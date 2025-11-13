const User = require('../model/User');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = global.fetch || require('node-fetch');

// Generate 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate OTP expiry time
function otpExpiry(minutes = 3) {
  return Date.now() + minutes * 60 * 1000;
}

// Send OTP to existing (unverified) user
exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: String(email).trim().toLowerCase(), is_deleted: false });
    if (!user) return res.status(400).json({ message: 'User not found' });
    if (user.is_verified) return res.status(400).json({ message: 'Already verified' });

    const otp = generateOtp();
    const expiresAt = new Date(otpExpiry(2));
    user.otp = { code: otp, expiresAt };
    await user.save();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: `"Connectify Team" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Your Connectify OTP Code',
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
          <h2>OTP Verification</h2>
          <p>Your OTP for verification is:</p>
          <h1 style="background:#f4f4f4;display:inline-block;padding:10px 20px;border-radius:8px;">${otp}</h1>
          <p>This OTP will expire in 2 minutes.</p>
        </div>
      `,
    });

    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('Email send error:', err?.response || err?.message || err);
    res.status(500).json({ message: 'Failed to send OTP' });
  }
};

// Register user (handles soft-deleted or existing)
exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!name || !emailNorm || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    let existing = await User.findOne({ email: emailNorm });

    // If user exists but is soft-deleted → restore and reset OTP
    if (existing && existing.is_deleted) {
      existing.is_deleted = false;
      existing.deletedAt = null;
      existing.is_verified = false;
      existing.status = 'pending_verification';
    }

    if (existing && !existing.is_deleted) {
      if (existing.is_verified) {
        return res.status(400).json({ message: 'Email already registered' });
      }

      const otp = generateOtp();
      existing.otp = { code: otp, expiresAt: new Date(otpExpiry(2)) };
      await existing.save();

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });

      await transporter.sendMail({
        from: `"Connectify Team" <${process.env.EMAIL_USER}>`,
        to: existing.email,
        subject: 'Your Connectify OTP Code',
        html: `
          <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
            <h2>OTP Verification</h2>
            <p>Your OTP for verification is:</p>
            <h1 style="background:#f4f4f4;display:inline-block;padding:10px 20px;border-radius:8px;">${otp}</h1>
            <p>This OTP will expire in 2 minutes.</p>
          </div>
        `,
      });

      return res.status(200).json({ message: 'Account pending verification. OTP sent again.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const otp = generateOtp();

    const user = new User({
      name,
      email: emailNorm,
      password: hashedPassword,
      role: role === 'brand' ? 'brand' : 'influencer',
      is_verified: false,
      status: 'pending_verification',
      otp: { code: otp, expiresAt: new Date(otpExpiry(2)) },
      is_deleted: false,
    });
    await user.save();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: `"Connectify Team" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Your Connectify OTP Code',
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
          <h2>OTP Verification</h2>
          <p>Your OTP for verification is:</p>
          <h1 style="background:#f4f4f4;display:inline-block;padding:10px 20px;border-radius:8px;">${otp}</h1>
          <p>This OTP will expire in 3 minutes.</p>
        </div>
      `,
    });

    return res.status(201).json({ message: 'Registered successfully. Please verify your email.' });
  } catch (err) {
    console.error('Register error:', err?.message || err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Forgot password
exports.passwordForgot = async (req, res) => {
  try {
    const { email } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: emailNorm, is_deleted: false });
    if (!user) return res.status(200).json({ message: 'If the email exists, an OTP has been sent' });

    const otp = generateOtp();
    user.otp = { code: otp, expiresAt: new Date(otpExpiry(10)) };
    await user.save();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: `"Connectify Team" <${process.env.EMAIL_USER}>`,
      to: emailNorm,
      subject: 'Password Reset OTP',
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
          <h2>Reset your password</h2>
          <p>Your OTP is:</p>
          <h1 style="background:#f4f4f4;display:inline-block;padding:10px 20px;border-radius:8px;">${otp}</h1>
          <p>This OTP will expire in 10 minutes.</p>
        </div>
      `,
    });

    return res.status(200).json({ message: 'If the email exists, an OTP has been sent' });
  } catch (err) {
    console.error('Password forgot error:', err?.message || err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Verify OTP and activate account
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

    const user = await User.findOne({ email: emailNorm, is_deleted: false });
    if (!user) return res.status(400).json({ message: 'User not found' });
    if (!user.otp || !user.otp.code) return res.status(400).json({ message: 'No OTP found. Please request a new code.' });
    if (user.is_verified) return res.status(400).json({ message: 'Already verified' });

    if (String(user.otp.code) !== String(otp)) return res.status(400).json({ message: 'Invalid OTP' });
    if (new Date() > new Date(user.otp.expiresAt)) return res.status(400).json({ message: 'OTP expired. Request a new one.' });

    user.is_verified = true;
    user.status = 'active';
    user.otp = { code: null, expiresAt: null };
    await user.save();

    return res.json({ message: 'Email verified successfully' });
  } catch (err) {
    console.error('Verify OTP error:', err?.message || err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !password) return res.status(400).json({ message: 'Email and password are required' });

    const user = await User.findOne({ email: emailNorm, is_deleted: false });
    if (!user) return res.status(400).json({ message: 'Invalid email or account deleted' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Wrong password' });

    if (!user.is_verified) return res.status(403).json({ message: 'Please verify your email first' });
    if (user.status === 'blocked') return res.status(403).json({ message: 'Account blocked' });

    const payload = { id: user._id, email: user.email, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    return res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err?.message || err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Google OAuth
exports.googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ message: 'idToken is required' });

    const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!resp.ok) return res.status(401).json({ message: 'Invalid Google token' });
    const payload = await resp.json();

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ message: 'Server misconfigured: GOOGLE_CLIENT_ID missing' });
    if (payload.aud !== clientId) return res.status(401).json({ message: 'Google token audience mismatch' });

    const email = String(payload.email || '').toLowerCase();
    const name = payload.name || (email ? email.split('@')[0] : 'User');
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (!email || !emailVerified) return res.status(401).json({ message: 'Email not verified with Google' });

    let user = await User.findOne({ email });

    // Handle soft-deleted user reactivation
    if (user && user.is_deleted) {
      user.is_deleted = false;
      user.deletedAt = null;
    }

    if (!user) {
      const randomPwd = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPwd, salt);
      user = new User({
        name,
        email,
        password: hashedPassword,
        role: 'influencer',
        is_verified: true,
        status: 'active',
        is_deleted: false,
        otp: { code: null, expiresAt: null },
        google: {
          stableId: payload.sub,
          jsonToken: payload.jti,
          idToken: idToken,
          expire: payload.exp,
          issueTime: payload.iat
        },
      });
      await user.save();
    } else if (!user.is_verified) {
      user.is_verified = true;
      user.status = 'active';
      user.otp = { code: null, expiresAt: null };
      await user.save();
    }

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    return res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Google auth error:', err?.message || err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Soft delete user
exports.softDeleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user || user.is_deleted) {
      return res.status(404).json({ message: 'User not found or already deleted' });
    }

    user.is_deleted = true;
    user.deletedAt = new Date();
    await user.save();

    return res.status(200).json({ message: 'User soft-deleted successfully' });
  } catch (err) {
    console.error('Soft delete error:', err?.message || err);
    return res.status(500).json({ message: 'Server error during soft delete' });
  }
};

// Restore user
exports.restoreUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user || !user.is_deleted) {
      return res.status(404).json({ message: 'User not found or not deleted' });
    }

    user.is_deleted = false;
    user.deletedAt = null;
    await user.save();

    return res.status(200).json({ message: 'User restored successfully' });
  } catch (err) {
    console.error('Restore user error:', err?.message || err);
    return res.status(500).json({ message: 'Server error during restore' });
  }
};

exports.verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

    const user = await User.findOne({ email: emailNorm });
    if (!user || !user.otp || !user.otp.code) return res.status(400).json({ message: 'Invalid or expired OTP' });
    if (String(user.otp.code) !== String(otp)) return res.status(400).json({ message: 'Invalid OTP' });
    if (new Date() > new Date(user.otp.expiresAt)) return res.status(400).json({ message: 'OTP expired' });

    return res.status(200).json({ message: 'OTP verified' });
  } catch (err) {
    console.error('Verify reset OTP error:', err?.message || err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP and newPassword are required' });
    }

    const user = await User.findOne({ email: emailNorm });
    if (!user || !user.otp || !user.otp.code) return res.status(400).json({ message: 'Invalid or expired OTP' });
    if (String(user.otp.code) !== String(otp)) return res.status(400).json({ message: 'Invalid OTP' });
    if (new Date() > new Date(user.otp.expiresAt)) return res.status(400).json({ message: 'OTP expired' });

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword, salt);
    user.password = hashed;
    user.otp = { code: null, expiresAt: null };
    await user.save();

    return res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Update password error:', err?.message || err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getCounts = async (req, res) => {
  try {
    const totalBrands = await User.countDocuments({
      role: "brand",
      is_deleted: false,
    });
    const totalInfluencers = await User.countDocuments({
      role: "influencer",
      is_deleted: false,
    });
    return res.status(200).json({
      totalBrands,
      totalInfluencers,
    });
  } catch (err) {
    console.error("Count fetch error:", err.message);
    res.status(500).json({ message: "Server error while fetching counts" });
  }
};

exports.getCounts = async (req, res) => {
  try {
    const totalBrands = await User.countDocuments({
      role: "brand",
      is_deleted: false,
      is_verified: true
    });
    const totalInfluencers = await User.countDocuments({
      role: "influencer",
      is_deleted: false,
      is_verified: true
    });
    return res.status(200).json({
      totalBrands,
      totalInfluencers,
    });
  } catch (err) {
    console.error("Count fetch error:", err.message);
    res.status(500).json({ message: "Server error while fetching counts" });
  }
};