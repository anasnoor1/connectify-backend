const Message = require("../model/Message");
const ChatRoom = require("../model/Chat");
const BrandProfile = require("../model/BrandProfile");
const InfluencerProfile = require("../model/InfluencerProfile");
const Campaign = require("../model/Campaign");

// const cleanMessage = require("../middleware/messageFilter");

exports.getMessages = async (req, res) => {
  const { roomId } = req.params;

  const rawMessages = await Message.find({ roomId })
    .populate("senderId", "name role");

  const messages = rawMessages.map(m => m.toObject());

  // Collect all sender IDs to fetch avatars in bulk
  const senderIds = [];
  messages.forEach(m => {
    const u = m && m.senderId;
    if (u && u._id) {
      senderIds.push(u._id.toString());
    }
  });

  if (senderIds.length > 0) {
    const uniqueIds = [...new Set(senderIds)];

    const [brandProfiles, influencerProfiles] = await Promise.all([
      BrandProfile.find({ brand_id: { $in: uniqueIds } }).select("brand_id avatar_url"),
      InfluencerProfile.find({ influencer_id: { $in: uniqueIds } }).select("influencer_id avatar_url"),
    ]);

    const brandMap = {};
    brandProfiles.forEach(bp => {
      if (bp.brand_id) brandMap[bp.brand_id.toString()] = bp.avatar_url || "";
    });

    const influencerMap = {};
    influencerProfiles.forEach(ip => {
      if (ip.influencer_id) influencerMap[ip.influencer_id.toString()] = ip.avatar_url || "";
    });

    messages.forEach(m => {
      const u = m && m.senderId;
      if (!u || !u._id) return;
      const key = u._id.toString();
      if (u.role === "brand" && brandMap[key] !== undefined) {
        u.avatar_url = brandMap[key];
      } else if (u.role === "influencer" && influencerMap[key] !== undefined) {
        u.avatar_url = influencerMap[key];
      }
    });
  }

  res.json(messages);
};



exports.sendMessage = async (req, res) => {
  try {
    const { roomId, message } = req.body;

    // message is already validated by middleware
    // Block sending messages if the associated campaign is completed
    const room = await ChatRoom.findById(roomId).populate("campaignIds", "status");
    if (room && room.campaignIds && room.campaignIds.length > 0) {
      const hasCompletedCampaign = room.campaignIds.some((c) => c && c.status === "completed");
      if (hasCompletedCampaign) {
        return res.status(400).json({
          error: "This campaign is completed. You cannot send new messages in this chat.",
        });
      }
    }

    const newMsg = await Message.create({
      roomId,
      senderId: req.user._id,
      message,
    });

    await ChatRoom.findByIdAndUpdate(roomId, {
      lastMessage: {
        text: message,
        senderId: req.user._id,
        createdAt: new Date(),
      }
    });

    res.json(newMsg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};