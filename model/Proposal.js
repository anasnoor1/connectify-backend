const mongoose = require("mongoose");

const proposalSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
    },
    influencerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    deliveryTime: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    influencerMarkedComplete: {
      type: Boolean,
      default: false,
    },
    influencerCompletedAt: {
      type: Date,
    },
    adminApprovedCompletion: {
      type: Boolean,
      default: false,
    },
    adminCompletionApprovedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Proposal", proposalSchema);
