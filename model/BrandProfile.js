const mongoose = require("mongoose");

const brandProfileSchema = new mongoose.Schema({
  brand_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
  company_name: { type: String, required: true },
  industry: { type: String },
  website: { type: String },
  bio: { type: String },
  is_verified: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("BrandProfile", brandProfileSchema);
