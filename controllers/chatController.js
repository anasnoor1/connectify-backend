// const ChatRoom = require("../model/Chat");
// const Campaign = require("../model/Campiagn");



// exports.openChat = async (req, res) => {
//   try {
//     const influencerId = req.user._id;
//     const { campaignId } = req.body;

//     const campaign = await Campaign.findById(campaignId).populate("brand_id");
//     if (!campaign) return res.status(404).json({ error: "Campaign not found" });

//     let room = await ChatRoom.findOne({
//       influencerId,
//       brandId: campaign.brand_id._id
//     });

//     if (!room) {
//       room = await ChatRoom.create({
//         influencerId,
//         brandId: campaign.brand_id._id,
//         campaignIds: [campaignId],
//       });
//     } else {
//       // add campaign to history if not already added
//       if (!room.campaignIds.includes(campaignId)) {
//         room.campaignIds.push(campaignId);
//         await room.save();
//       }
//     }

//     return res.json({ success: true, room });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// exports.getChatRoom = async (req, res) => {
//   try {
//     const { campaignId, influencerId, brandId } = req.query;

//     if (!campaignId || !influencerId || !brandId) {
//       return res.status(400).json({ error: "Missing parameters" });
//     }

//     let room = await ChatRoom.findOne({ campaignId, influencerId, brandId });

//     if (!room) {
//       return res.status(404).json({ error: "Room not found" });
//     }

//     return res.json({ success: true, room });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };




// exports.getBrandChats = async (req, res) => {
//   try {
//     const brandId = req.user._id;

//     const chats = await ChatRoom.find({ brandId })
//       .populate("influencerId", "name email role")
//       .sort({ updatedAt: -1 });

//     res.status(200).json({ success: true, data: chats });
//   } catch (err) {
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };
///////////////////////

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
    const { campaignId, participantId } = req.query;
    const userId = req.user._id;

    if (!participantId) {
      return res.status(400).json({ error: "Participant ID is required" });
    }

    // Find a room that has BOTH participants
    let room = await ChatRoom.findOne({
      "participants.userId": { $all: [userId, participantId] }
    })
      .populate("participants.userId", "name email role") // Populate user details
      .populate("campaignIds", "title"); // Populate campaign details if needed

    if (!room) return res.status(404).json({ error: "Room not found" });

    // Transform response to include legacy fields if frontend expects them,
    // or just return the room with populated participants.
    // For compatibility with ChatPage.jsx which expects room.influencerId and room.brandId:

    const roomObj = room.toObject();

    // Helper to find participant by role
    const influencer = roomObj.participants.find(p => p.role === 'influencer')?.userId;
    const brand = roomObj.participants.find(p => p.role === 'brand')?.userId;

    // Attach legacy fields for frontend compatibility
    roomObj.influencerId = influencer;
    roomObj.brandId = brand;

    res.json({ success: true, room: roomObj });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
