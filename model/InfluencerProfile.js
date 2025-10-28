const mongoose = require("mongoose");

const influencerProfileSchema = new mongoose.Schema({
  influencer_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
  category: { type: String },
  followers_count: { type: Number, default: 0 },
  engagement_rate: { type: Number, default: 0 },
  bio: { type: String },
  social_links: [{ type: String }],
  is_verified: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("InfluencerProfile", influencerProfileSchema);
