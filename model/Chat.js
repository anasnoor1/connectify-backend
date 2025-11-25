
const mongoose = require("mongoose");

const ChatRoomSchema = new mongoose.Schema(
  {
    participants: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        role: { type: String, enum: ["brand", "influencer"], required: true }
      }
    ],

    campaignIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" } // optional: associate campaigns
    ],

    messages: [
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

// Optional: ensure only one chat per pair of participants
ChatRoomSchema.index(
  { "participants.userId": 1 },
  { unique: true, sparse: true } // sparse: avoid conflicts for multiple participants
);

module.exports = mongoose.model("ChatRoom", ChatRoomSchema);