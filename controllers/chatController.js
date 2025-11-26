const ChatRoom = require("../model/Chat");
const Campaign = require("../model/Campiagn");

exports.openChat = async (req, res) => {
  try {
    const userId = req.user._id; // can be influencer or brand
    const { campaignId, influencerId } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: "campaignId is required" });
    }

    console.log(`OpenChat request by ${req.user.role} ${userId} for campaign ${campaignId}`);

    const campaign = await Campaign.findById(campaignId).populate("brand_id");
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    let otherUserId;
    let otherUserRole;

    if (req.user.role === "influencer") {
      if (!campaign.brand_id) {
        console.error("Campaign has no brand_id populated:", campaign);
        return res.status(400).json({ error: "Campaign has no associated brand" });
      }
      otherUserId = campaign.brand_id._id;
      otherUserRole = "brand";
    } else {
      // If brand is opening chat, they must specify which influencer (e.g. from a proposal)
      // For now, if not provided, we can't proceed easily unless we pass influencerId in body
      if (influencerId) {
        otherUserId = influencerId;
        otherUserRole = "influencer";
      } else {
        // Fallback or error? 
        // If the campaign doesn't have a single influencer_id field (which it doesn't seem to), 
        // we can't guess.
        return res.status(400).json({ error: "influencerId is required to open chat as brand" });
      }
    }

    console.log(`Looking for chat between ${userId} and ${otherUserId}`);
    const pairKey = [String(userId), String(otherUserId)].sort().join(":");

    // Prefer pairKey for deterministic uniqueness
    let room = await ChatRoom.findOne({ pairKey });

    if (!room) {
      console.log("Creating new chat room");
      try {
        room = await ChatRoom.create({
          pairKey,
          participants: [
            { userId, role: req.user.role },
            { userId: otherUserId, role: otherUserRole }
          ],
          campaignIds: [campaignId]
        });
      } catch (createErr) {
        // Handle race: if another request created the room concurrently, fetch it
        if (createErr?.code === 11000) {
          room = await ChatRoom.findOne({ pairKey });
        } else {
          throw createErr;
        }
      }
    } else {
      console.log("Found existing chat room", room._id);
      if (!room.campaignIds.includes(campaignId)) {
        room.campaignIds.push(campaignId);
        await room.save();
      }
    }

    // Verify persistence
    const savedRoom = await ChatRoom.findById(room._id);
    if (!savedRoom) {
      console.error(`CRITICAL: Room ${room._id} created/found but not found by findById immediately!`);
      return res.status(500).json({ error: "Failed to persist chat room" });
    }

    // Populate participants for the response
    room = await room.populate("participants.userId", "name email role");

    console.log(`Returning room ID: ${room._id}`);
    return res.json({ success: true, room });
  } catch (err) {
    console.error("Error in openChat:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
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
    console.log(`getChatRoom called with ID: ${roomId}`);

    const room = await ChatRoom.findById(roomId)
      .populate("participants.userId", "name email role");

    if (!room) {
      console.log(`Room with ID ${roomId} not found in DB.`);
      return res.status(404).json({ error: "Room not found" });
    }

    console.log(`Room found: ${room._id}`);
    res.json({ success: true, room });
  } catch (err) {
    console.error(`Error in getChatRoom for ID ${req.params.roomId}:`, err);
    res.status(500).json({ error: err.message });
  }
};
