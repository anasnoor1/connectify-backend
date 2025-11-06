// models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["brand", "influencer", "admin"], default: "influencer" },
  is_verified: { type: Boolean, default: false },
  status: { type: String, enum: ["pending_verification", "active", "blocked"], default: "pending_verification" },
  otp: {
    code: { type: String, default: null },
    expiresAt: { type: Date, default: null }
  },
  is_deleted: { type: Boolean, default: false }, 
  deletedAt: { type: Date, default: null },  
  google: {
    stableId:{type: String},
    jsonToken:{type: String},
    idToken:{type: String},
    expire:{type: Number},
    issueTime:{type: Number},
  },

  created_at: { type: Date, default: Date.now },

});

module.exports = mongoose.model("User", userSchema);