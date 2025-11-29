const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
    },
    proposalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Proposal",
    },
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fromRole: {
      type: String,
      enum: ["brand", "influencer"],
      required: true,
    },
    toRole: {
      type: String,
      enum: ["brand", "influencer"],
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

// A user can only review a specific counterpart once per campaign
reviewSchema.index({ campaignId: 1, fromUser: 1, toUser: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema);
