const mongoose = require("mongoose");

const influencerProfileSchema = new mongoose.Schema({
  influencer_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
  instagram_username: { type: String, trim: true },
  category: { type: String, trim: true },
  followers_count: { type: Number, default: 0, min: 0 },
  engagement_rate: { type: Number, default: 0, min: 0, max: 100 }, // percentage 0-100
  bio: { type: String, trim: true },
  avatar_url: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        if (!v) return true;
        return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v);
      },
      message: 'Invalid avatar URL',
    },
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        if (!v) return true;
        return /^\+?[0-9]{10,15}$/.test(v.replace(/\s|-/g, ''));
      },
      message: 'Invalid phone number',
    },
  },
  social_links: [{
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        if (!v) return true;
        return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v);
      },
      message: 'Invalid URL in social_links',
    },
  }],
  is_verified: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("InfluencerProfile", influencerProfileSchema);
