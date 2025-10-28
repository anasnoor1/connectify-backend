const User = require('../models/User');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
    const user = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!user) return res.status(400).json({ message: 'User not found' });
    if (user.is_verified) return res.status(400).json({ message: 'Already verified' });

    const otp = generateOtp();
    const expiresAt = new Date(otpExpiry(3));
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
          <h2>🔐 OTP Verification</h2>
          <p>Your OTP for verification is:</p>
          <h1 style="background:#f4f4f4;display:inline-block;padding:10px 20px;border-radius:8px;">${otp}</h1>
          <p>This OTP will expire in 3 minutes.</p>
        </div>
      `,
    });

    console.log('✅ Email sent successfully');
    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('❌ Email send error:', err?.response || err?.message || err);
    res.status(500).json({ message: 'Failed to send OTP' });
  }
};

// Verify OTP and activate account
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

    const user = await User.findOne({ email: emailNorm });
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

// Login: validate password, require verified, return JWT
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !password) return res.status(400).json({ message: 'Email and password are required' });

    const user = await User.findOne({ email: emailNorm });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

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

// Google OAuth: verify ID token, upsert user, return JWT
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
        otp: { code: null, expiresAt: null }
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