const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({
  brand_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  influencer_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Chat", chatSchema);
