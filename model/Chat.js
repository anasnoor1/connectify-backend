const mongoose = require("mongoose");

const ChatRoomSchema = new mongoose.Schema(
  {
    // Deterministic key for a pair of users (sorted "userIdA:userIdB")
    pairKey: { type: String, index: true, unique: true, sparse: true },
    participants: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        role: { type: String, enum: ["brand", "influencer"], required: true }
      }
    ],
    
    isGroup: { type: Boolean, default: false },
    groupName: { type: String },
    
    campaignIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" } // optional: associate campaigns
    ],
<<<<<<< HEAD

    messages: [       
=======
    
    messages: [
>>>>>>> e5b99c4dea9451716d38889958701bcab38f91a4
      {
        senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
      }
    ],

    lastMessage: {
      text: String,
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      createdAt: Date
    }
  },
  { timestamps: true }
);

// Note: Do NOT set a unique index on participants.userId, it blocks a user from being in multiple rooms.
// We instead ensure pair-level uniqueness using pairKey above.

module.exports = mongoose.model("ChatRoom", ChatRoomSchema);