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
    paymentStatus: {
      type: String,
      enum: ["unpaid", "pending", "paid", "released"],
      default: "unpaid",
    },
    paymentIntentId: {
      type: String,
    },
    brandTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
    },
    payoutTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
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
    brandPaidAmount: {
      type: Number,
    },
    platformFeeFromBrand: {
      type: Number,
    },
    platformFeeFromInfluencer: {
      type: Number,
    },
    influencerGrossAmount: {
      type: Number,
    },
    influencerNetAmount: {
      type: Number,
    },
    payoutReleasedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Proposal", proposalSchema);
