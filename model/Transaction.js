const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  amount: { type: Number, required: true },
  transaction_type: { type: String, enum: ["credit", "debit"], required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Transaction", transactionSchema);
