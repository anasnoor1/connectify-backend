const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema({
  brand_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  budgetMin: {
    type: Number,
    required: true
  },
  budgetMax: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ["active", "pending", "completed", "cancelled"],
    default: "pending"
  },
  reviewEnabled: {
    type: Boolean,
    default: false,
  },
  influencerCompleted: {
    type: Boolean,
    default: false
  },
  influencerCompletedAt: {
    type: Date
  },
  target_audience: {
    age_range: { min: Number, max: Number },
    gender: { type: String, enum: ["male", "female", "all"] },
    location: String,
    interests: [String]
  },
  requirements: {
    min_followers: Number,
    min_engagement: Number,
    content_type: [String],
    deadline: Date,
    max_influencers: {
      type: Number,
      default: 1,
    },
  },
  social_media: [{
    platform: String,
    requirements: String
  }],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Campaign", campaignSchema);