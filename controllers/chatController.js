const ChatRoom = require("../model/Chat");
const Campaign = require("../model/Campiagn");

exports.openChat = async (req, res) => {
  try {
    const userId = req.user._id; // can be influencer or brand
    const { campaignId } = req.body;

    const campaign = await Campaign.findById(campaignId).populate("brand_id");
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const otherUserId =
      req.user.role === "influencer"
        ? campaign.brand_id._id
        : campaign.influencer_id; // or some influencer field

    // Look for a chat that contains both participants
    let room = await ChatRoom.findOne({
      "participants.userId": { $all: [userId, otherUserId] }
    });

    if (!room) {
      room = await ChatRoom.create({
        participants: [
          { userId, role: req.user.role },
          { userId: otherUserId, role: req.user.role === "influencer" ? "brand" : "influencer" }
        ],
        campaignIds: [campaignId]
      });
    } else {
      if (!room.campaignIds.includes(campaignId)) {
        room.campaignIds.push(campaignId);
        await room.save();
      }
    }

    return res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUserChats = async (req, res) => {
  try {
    const userId = req.user._id;

    const chats = await ChatRoom.find({
      "participants.userId": userId
    })
      .populate("participants.userId", "name email role")
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, data: chats });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
 

exports.getChatRoom = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await ChatRoom.findById(roomId)
      .populate("participants.userId", "name email role");

    if (!room) return res.status(404).json({ error: "Room not found" });

    res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
