const ChatRoom = require("../model/Chat");
const Campaign = require("../model/Campaign");
const Proposal = require("../model/Proposal");
const BrandProfile = require("../model/BrandProfile");
const InfluencerProfile = require("../model/InfluencerProfile");

exports.openChat = async (req, res) => {
  try {
    const userId = req.user._id; // can be influencer or brand
    const { campaignId, influencerId } = req.body;

    console.log(`OpenChat request by ${req.user.role} ${userId} for campaign ${campaignId}`);

    const campaign = await Campaign.findById(campaignId).populate("brand_id");
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const maxInfluencers =
      (campaign.requirements && typeof campaign.requirements.max_influencers === "number"
        ? campaign.requirements.max_influencers
        : 1) || 1;

    const ensureAcceptedProposal = async (targetInfluencerId) => {
      if (!targetInfluencerId) {
        return false;
      }
      const accepted = await Proposal.exists({
        campaignId,
        influencerId: targetInfluencerId,
        status: "accepted",
      });
      return Boolean(accepted);
    };

    let otherUserId;
    let otherUserRole;

    let room;

    // Single-influencer campaign: strict 1-1 chat using pairKey
    if (maxInfluencers <= 1) {
      if (req.user.role === "influencer") {
        const accepted = await ensureAcceptedProposal(userId);
        if (!accepted) {
          return res.status(403).json({ error: "Chat is available only after your proposal is accepted." });
        }

        if (!campaign.brand_id) {
          console.error("Campaign has no brand_id populated:", campaign);
          return res.status(400).json({ error: "Campaign has no associated brand" });
        }
        otherUserId = campaign.brand_id._id;
        otherUserRole = "brand";
      } else {
        // Brand must specify influencer for 1-1 chat
        if (influencerId) {
          const accepted = await ensureAcceptedProposal(influencerId);
          if (!accepted) {
            return res.status(403).json({ error: "You can only open chats with accepted influencers." });
          }
          otherUserId = influencerId;
          otherUserRole = "influencer";
        } else {
          return res.status(400).json({ error: "influencerId is required to open chat as brand" });
        }
      }

      console.log(`Looking for chat between ${userId} and ${otherUserId}`);
      const basePairKey = [String(userId), String(otherUserId)].sort().join(":");
      const campaignScopedPairKey = `${String(campaignId)}:${basePairKey}`;

      // Prefer campaign-scoped chats; fallback to legacy pairKey rooms that already include this campaign
      room = await ChatRoom.findOne({ pairKey: campaignScopedPairKey });
      if (!room) {
        room = await ChatRoom.findOne({ pairKey: basePairKey, campaignIds: campaignId });
      }

      if (!room) {
        console.log("Creating new 1-1 chat room");
        try {
          room = await ChatRoom.create({
            pairKey: campaignScopedPairKey,
            participants: [
              { userId, role: req.user.role },
              { userId: otherUserId, role: otherUserRole }
            ],
            campaignIds: [campaignId]
          });
        } catch (createErr) {
          // Handle race: if another request created the room concurrently, fetch it
          if (createErr?.code === 11000) {
            room = await ChatRoom.findOne({ pairKey: campaignScopedPairKey });
          } else {
            throw createErr;
          }
        }
      } else {
        console.log("Found existing 1-1 chat room", room._id);
        if (!room.campaignIds.includes(campaignId)) {
          room.campaignIds.push(campaignId);
          await room.save();
        }
      }
    } else {
      // Multi-influencer campaign: use a shared group room per campaign
      console.log("Opening group chat for campaign", campaignId);

      room = await ChatRoom.findOne({
        isGroup: true,
        campaignIds: campaignId,
      });

      if (!room) {
        console.log("Creating new group chat room for campaign");

        const baseParticipants = [];

        // Ensure brand owner is always in the group
        if (campaign.brand_id) {
          baseParticipants.push({ userId: campaign.brand_id._id || campaign.brand_id, role: "brand" });
        }

        // Add the current user if not already in baseParticipants
        const currentIdStr = String(userId);
        if (req.user.role === "influencer") {
          const accepted = await ensureAcceptedProposal(userId);
          if (!accepted) {
            return res.status(403).json({ error: "Chat is available only after your proposal is accepted." });
          }
        }
        if (!baseParticipants.some(p => String(p.userId) === currentIdStr)) {
          baseParticipants.push({ userId, role: req.user.role });
        }

        room = await ChatRoom.create({
          isGroup: true,
          groupName: campaign.title,
          participants: baseParticipants,
          campaignIds: [campaignId],
        });
        console.log("it is the room : ", room);
      } else {
        // Make sure the current user is part of the group
        const currentIdStr = String(userId);
        if (req.user.role === "influencer") {
          const accepted = await ensureAcceptedProposal(userId);
          if (!accepted) {
            return res.status(403).json({ error: "Chat is available only after your proposal is accepted." });
          }
        }
        const alreadyIn = room.participants.some(p => String(p.userId) === currentIdStr);
        if (!alreadyIn) {
          room.participants.push({ userId, role: req.user.role });
          await room.save();
        }
      }
    }

    // Verify persistence
    // console.log("room._id : ", room._id);
    const savedRoom = await ChatRoom.findById(room._id);
    if (!savedRoom) {
      console.error(`CRITICAL: Room ${room._id} created/found but not found by findById immediately!`);
      return res.status(500).json({ error: "Failed to persist chat room" });
    }

    // Populate participants for the response (basic user info)
    room = await room.populate("participants.userId", "name email role");

    // Attach avatar_url to each participant based on role/profile
    const roomObj = room.toObject();
    const participantIds = [];

    if (Array.isArray(roomObj.participants)) {
      roomObj.participants.forEach(p => {
        const u = p && p.userId;
        if (u && u._id) {
          participantIds.push(u._id.toString());
        }
      });
    }

    if (participantIds.length > 0) {
      const uniqueIds = [...new Set(participantIds)];

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

      roomObj.participants.forEach(p => {
        const u = p && p.userId;
        if (!u || !u._id) return;
        const key = u._id.toString();
        if (u.role === "brand" && brandMap[key] !== undefined) {
          u.avatar_url = brandMap[key];
        } else if (u.role === "influencer" && influencerMap[key] !== undefined) {
          u.avatar_url = influencerMap[key];
        }
      });
    }

    // Chats should always remain writable regardless of campaign completion
    roomObj.isReadOnly = false;

    console.log(`Returning room ID: ${room._id}`);
    return res.json({ success: true, room: roomObj });

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

    // Convert to plain objects to safely enrich data
    const chatsData = chats.map(c => c.toObject());

    // Collect all participant user IDs
    const allUserIds = [];
    chatsData.forEach(room => {
      if (!Array.isArray(room.participants)) return;
      room.participants.forEach(p => {
        const u = p && p.userId;
        if (u && u._id) {
          allUserIds.push(u._id.toString());
        }
      });
    });

    if (allUserIds.length > 0) {
      const uniqueIds = [...new Set(allUserIds)];

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

      chatsData.forEach(room => {
        if (!Array.isArray(room.participants)) return;
        room.participants.forEach(p => {
          const u = p && p.userId;
          if (!u || !u._id) return;
          const key = u._id.toString();
          if (u.role === "brand" && brandMap[key] !== undefined) {
            u.avatar_url = brandMap[key];
          } else if (u.role === "influencer" && influencerMap[key] !== undefined) {
            u.avatar_url = influencerMap[key];
          }
        });
      });
    }

    res.status(200).json({ success: true, data: chatsData });

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

    // Enrich room with avatar URLs similar to openChat
    const roomObj = room.toObject();
    const participantIds = [];

    if (Array.isArray(roomObj.participants)) {
      roomObj.participants.forEach(p => {
        const u = p && p.userId;
        if (u && u._id) {
          participantIds.push(u._id.toString());
        }
      });
    }

    if (participantIds.length > 0) {
      const uniqueIds = [...new Set(participantIds)];

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

      roomObj.participants.forEach(p => {
        const u = p && p.userId;
        if (!u || !u._id) return;
        const key = u._id.toString();
        if (u.role === "brand" && brandMap[key] !== undefined) {
          u.avatar_url = brandMap[key];
        } else if (u.role === "influencer" && influencerMap[key] !== undefined) {
          u.avatar_url = influencerMap[key];
        }
      });
    }

    // Chats should always remain writable regardless of campaign completion
    roomObj.isReadOnly = false;

    console.log(`Room found: ${room._id}`);
    res.json({ success: true, room: roomObj });

  } catch (err) {
    console.error(`Error in getChatRoom for ID ${req.params.roomId}:`, err);
    res.status(500).json({ error: err.message });
  }
};