const mongoose = require("mongoose");

const evidenceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["image", "video", "file", "link", "text"], default: "file" },
    url: { type: String },
    text: { type: String },
    caption: { type: String },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } }
);

const messageSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true },
    attachments: [
      {
        type: {
          type: String,
          enum: ["image", "video", "file", "link"],
          default: "file",
        },
        url: String,
      },
    ],
    isSystem: { type: Boolean, default: false },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } }
);

const disputeSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    against: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    roleOfRaiser: { type: String, enum: ["brand", "influencer"], required: true },
    reason: {
      type: String,
      enum: ["quality", "delay", "payment", "fraud", "other"],
      default: "other",
    },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "needs_info", "resolved", "rejected", "escalated"],
      default: "pending",
    },
    resolution: {
      decisionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      decision: {
        type: String,
        enum: ["refund_full", "refund_partial", "release_funds", "redo_work", "reject", null],
        default: null,
      },
      notes: { type: String },
      amount: { type: Number },
      decidedAt: { type: Date },
    },
    currentAssignee: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    autoHoldPayout: { type: Boolean, default: true },
    evidence: [evidenceSchema],
    messages: [messageSchema],
  },
  { timestamps: true }
);

disputeSchema.index({ campaignId: 1 });
disputeSchema.index({ raisedBy: 1, status: 1 });

module.exports = mongoose.model("Dispute", disputeSchema);
