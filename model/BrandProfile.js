const mongoose = require("mongoose");

const brandProfileSchema = new mongoose.Schema({
  brand_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
  company_name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    validate: {
      validator: function (v) {
        if (!v) return false;
        return /^[A-Za-z\s]+$/.test(v);
      },
      message: 'Company name can only contain letters and spaces',
    },
  },
  industry: { type: String, trim: true },
  website: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        if (!v) return true;
        return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v);
      },
      message: 'Invalid URL',
    },
  },
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
        const normalized = v.replace(/\s|-/g, '');
        const pakRegex = /^(?:\+92|92|0)?3[0-9]{9}$/;
        // allow either strict Pakistani mobile pattern or generic 10-15 digit international
        return pakRegex.test(normalized) || /^\+?[0-9]{10,15}$/.test(normalized);
      },
      message: 'Invalid phone number',
    },
  },
  bio: { type: String, trim: true },
  is_verified: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("BrandProfile", brandProfileSchema);
