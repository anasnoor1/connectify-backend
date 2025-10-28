const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  confirmPassword: { type: String, required: true },
  role: { type: String, enum: ["brand", "influencer"], required: true },
  status: { type: String, enum: ["active", "blocked"], default: "active" },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
