const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  amount: { type: Number, required: true },
  transaction_type: { type: String, enum: ["credit", "debit"], required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" },
  proposalId: { type: mongoose.Schema.Types.ObjectId, ref: "Proposal" },
  stripePaymentIntentId: { type: String },
  stripeChargeId: { type: String },
  currency: { type: String, default: "usd" },
  app_fee: { type: Number, default: 0 },
  influencer_amount: { type: Number, default: 0 },
  isPayout: { type: Boolean, default: false },
  sourceTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
  stripeTransferId: { type: String },
  description: { type: String },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Transaction", transactionSchema);
