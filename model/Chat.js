// const mongoose = require("mongoose");

// const chatSchema = new mongoose.Schema({
//   brand_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//   influencer_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//   created_at: { type: Date, default: Date.now },
// });

// module.exports = mongoose.model("Chat", chatSchema);

// const mongoose = require("mongoose");

// const ChatRoomSchema = new mongoose.Schema({
//   campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true },
//   influencerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//   brandId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
// }, { timestamps: true });

// module.exports = mongoose.model("ChatRoom", ChatRoomSchema);
////////////////////////
// const mongoose = require("mongoose");

// const ChatRoomSchema = new mongoose.Schema(
//   {
//     influencerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//     brandId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

//     // OPTIONAL: store campaigns involved, but does NOT create duplicate chats
//     campaignIds: [
//       { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" }
//     ],
//   },
//   { timestamps: true }
// );

// // Ensure UNIQUE chat between influencer + brand
// ChatRoomSchema.index({ influencerId: 1, brandId: 1 }, { unique: true });

// module.exports = mongoose.model("ChatRoom", ChatRoomSchema);

/////////////////////////////////////////

// const mongoose = require("mongoose");

// const ChatRoomSchema = new mongoose.Schema(
//   {
//     influencerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//     brandId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

//     // optional: for history
//     campaignIds: [
//       { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" }
//     ],

//     // store last message for chat list preview
//     lastMessage: {
//       text: String,
//       senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//       createdAt: Date,
//     }
//   },
//   { timestamps: true }
// );

// // WhatsApp logic: one chat per pair of users
// ChatRoomSchema.index({ influencerId: 1, brandId: 1 }, { unique: true });

// module.exports = mongoose.model("ChatRoom", ChatRoomSchema);

///////////////////////////////////////////

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

