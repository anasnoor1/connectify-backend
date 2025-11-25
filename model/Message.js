const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom", required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  message: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model("Message", MessageSchema);