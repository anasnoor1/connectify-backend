const mongoose = require("mongoose");

const adminActivitySchema = new mongoose.Schema({
  admin_id: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  action: { type: String, required: true },
  entity_type: { type: String, enum: ["user", "profile", "report", "transaction"], required: true },
  entity_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AdminActivity", adminActivitySchema);
