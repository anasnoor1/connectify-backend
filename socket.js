const jwt = require("jsonwebtoken");
const Message = require("./model/Message");
const cleanMessage = require("./middleware/messageFilter");
const BrandProfile = require("./model/BrandProfile");
const InfluencerProfile = require("./model/InfluencerProfile");
const ChatRoom = require("./model/Chat");
const Campaign = require("./model/Campaign");

module.exports = (io) => {

  // Socket authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Not authorized"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded; // attach user info to socket
      next();
    } catch (err) {
      next(new Error("Token invalid"));
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected", socket.id, socket.user?.email);

    socket.on("join_room", (roomId) => {
      socket.join(roomId);
    });

    socket.on("send_message", async (data) => {
      const clean = cleanMessage(data.message);
      if (!clean) return socket.emit("blocked", "Personal info not allowed");

      // Block sending messages if the associated campaign is completed
      try {
        const room = await ChatRoom.findById(data.roomId).populate("campaignIds", "status");
        if (room && room.campaignIds && room.campaignIds.length > 0) {
          const hasCompletedCampaign = room.campaignIds.some((c) => c && c.status === "completed");
          if (hasCompletedCampaign) {
            return socket.emit("blocked", "This campaign is completed. You cannot send new messages in this chat.");
          }
        }
      } catch (err) {
        console.error("send_message campaign status check failed:", err);
      }

      // Use authenticated user
      const msg = await Message.create({
        roomId: data.roomId,
        senderId: socket.user.id, // <--- use socket.user.id
        message: clean,
      });

      // Populate sender basic info
      let populated = await Message.findById(msg._id).populate("senderId", "name role");
      let payload = populated.toObject();

      // Attach avatar_url for sender
      const sender = payload.senderId;
      if (sender && sender._id) {
        const senderId = sender._id.toString();
        if (sender.role === "brand") {
          const bp = await BrandProfile.findOne({ brand_id: senderId }).select("avatar_url");
          if (bp) sender.avatar_url = bp.avatar_url || "";
        } else if (sender.role === "influencer") {
          const ip = await InfluencerProfile.findOne({ influencer_id: senderId }).select("avatar_url");
          if (ip) sender.avatar_url = ip.avatar_url || "";
        }
      }

      io.to(data.roomId).emit("receive_message", payload);
    });
  });
};