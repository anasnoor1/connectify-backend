const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../model/User');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, role: user.role },
    process.env.JWT_SECRET || 'dev_secret',
    { expiresIn: '7d' }
  );
}

function getFromAddress() {
  const addr = process.env.FROM_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@connectify.local';
  return `Connectify Team <${addr}>`;
}

function renderVerificationEmail(name, code, minutes) {
  const safeName = name || 'there';
  const subject = 'Connectify Verification Code';
  const text = `Hi ${safeName},\n\nYour Connectify verification code is ${code}. It expires in ${minutes} minutes.\n\nIf you didn’t request this, you can safely ignore this email.\n\n— Connectify Team`;
  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;background:#f6f7fb;padding:32px">
    <table role="presentation" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:#ffffff;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.06)">
      <tr>
        <td style="padding:24px 28px;border-bottom:1px solid #eef0f4">
          <div style="font-size:18px;font-weight:600;color:#111827">Connectify</div>
          <div style="font-size:12px;color:#6b7280">Account Verification</div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px">
          <p style="font-size:16px;color:#111827;margin:0 0 12px">Hi ${safeName},</p>
          <p style="font-size:14px;color:#374151;margin:0 0 16px">Use the following code to verify your email address for Connectify:</p>
          <div style="display:inline-block;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;letter-spacing:4px;font-size:22px;font-weight:700;color:#111827">${code}</div>
          <p style="font-size:13px;color:#6b7280;margin:16px 0 0">This code will expire in ${minutes} minutes.</p>
          <p style="font-size:12px;color:#9ca3af;margin:16px 0 0">If you didn’t request this, please ignore this email.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 28px;border-top:1px solid #eef0f4;color:#6b7280;font-size:12px">— Connectify Team</td>
      </tr>
    </table>
  </div>`;
  return { subject, text, html };
}

function renderResetEmail(name, code, minutes) {
  const safeName = name || 'there';
  const subject = 'Connectify Password Reset Code';
  const text = `Hi ${safeName},\n\nUse this code to reset your Connectify password: ${code}. It expires in ${minutes} minutes.\n\nIf you didn’t request this, you can safely ignore this email.\n\n— Connectify Team`;
  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;background:#f6f7fb;padding:32px">
    <table role="presentation" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:#ffffff;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.06)">
      <tr>
        <td style="padding:24px 28px;border-bottom:1px solid #eef0f4">
          <div style="font-size:18px;font-weight:600;color:#111827">Connectify</div>
          <div style="font-size:12px;color:#6b7280">Password Reset</div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px">
          <p style="font-size:16px;color:#111827;margin:0 0 12px">Hi ${safeName},</p>
          <p style="font-size:14px;color:#374151;margin:0 0 16px">Use the following code to reset your password:</p>
          <div style="display:inline-block;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;letter-spacing:4px;font-size:22px;font-weight:700;color:#111827">${code}</div>
          <p style="font-size:13px;color:#6b7280;margin:16px 0 0">This code will expire in ${minutes} minutes.</p>
          <p style="font-size:12px;color:#9ca3af;margin:16px 0 0">If you didn’t request this, please ignore this email.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 28px;border-top:1px solid #eef0f4;color:#6b7280;font-size:12px">— Connectify Team</td>
      </tr>
    </table>
  </div>`;
  return { subject, text, html };
}

function renderResetEmail(name, code, minutes) {
  const safeName = name || 'there';
  const subject = 'Connectify Password Reset Code';
  const text = `Hi ${safeName},\n\nUse this code to reset your Connectify password: ${code}. It expires in ${minutes} minutes.\n\nIf you didn’t request this, you can safely ignore this email.\n\n— Connectify Team`;
  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;background:#f6f7fb;padding:32px">
    <table role="presentation" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:#ffffff;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.06)">
      <tr>
        <td style="padding:24px 28px;border-bottom:1px solid #eef0f4">
          <div style="font-size:18px;font-weight:600;color:#111827">Connectify</div>
          <div style="font-size:12px;color:#6b7280">Password Reset</div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px">
          <p style="font-size:16px;color:#111827;margin:0 0 12px">Hi ${safeName},</p>
          <p style="font-size:14px;color:#374151;margin:0 0 16px">Use the following code to reset your password:</p>
          <div style="display:inline-block;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;letter-spacing:4px;font-size:22px;font-weight:700;color:#111827">${code}</div>
          <p style="font-size:13px;color:#6b7280;margin:16px 0 0">This code will expire in ${minutes} minutes.</p>
          <p style="font-size:12px;color:#9ca3af;margin:16px 0 0">If you didn’t request this, please ignore this email.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 28px;border-top:1px solid #eef0f4;color:#6b7280;font-size:12px">— Connectify Team</td>
      </tr>
    </table>
  </div>`;
  return { subject, text, html };
}

function generateOtp() {
  return ('' + Math.floor(100000 + Math.random() * 900000));
}

async function getTransporter() {
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
  const port = process.env.SMTP_PORT || process.env.EMAIL_PORT;
  const secure = process.env.SMTP_SECURE || process.env.EMAIL_SECURE;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port: Number(port || 587),
      secure: String(secure).toLowerCase() === 'true',
      auth: { user, pass },
    });
  }
  const test = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: test.user, pass: test.pass },
  });
}

async function googleAuth(req, res) {
  try {
    const { idToken, role } = req.body || {};
    if (!idToken) return res.status(400).json({ message: 'idToken is required' });

    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!tokenInfoRes.ok) return res.status(401).json({ message: 'Invalid Google token' });
    const info = await tokenInfoRes.json();

    const aud = info.aud;
    const email = (info.email || '').toLowerCase();
    const name = info.name || email.split('@')[0] || 'User';
    if (!email) return res.status(400).json({ message: 'Email not present in Google token' });

    const expectedAud = process.env.GOOGLE_CLIENT_ID || '720475734209-do0bg2s9kce36tp0hvc6dlfvh9qhtvnf.apps.googleusercontent.com';
    if (expectedAud && aud !== expectedAud) return res.status(401).json({ message: 'Google token audience mismatch' });

    const userRole = role === 'brand' ? 'brand' : 'influencer';

    let user = await User.findOne({ email });
    if (!user) {
      const randomPass = await bcrypt.hash(`${email}:${Date.now()}:${Math.random()}`, 10);
      user = await User.create({
        name,
        email,
        password: randomPass,
        role: userRole,
        is_verified: true,
        status: 'active',
      });
    } else {
      if (user.status === 'blocked') {
        return res.status(403).json({ message: 'Account is blocked' });
      }
      // Existing account – instruct user to login instead of creating again
      return res.status(409).json({ message: 'Account already exists. Please login.' });
    }

    const token = signToken(user);
    return res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_verified: user.is_verified,
        status: user.status,
        created_at: user.created_at,
      },
    });
  } catch (e) {
    return res.status(500).json({ message: 'Google auth failed', error: e?.message || 'unknown' });
  }
}

async function sendOtp(req, res) {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const code = generateOtp();
    const otpMins = Number(process.env.OTP_EXPIRES_MIN || 10);
    const expiresAt = new Date(Date.now() + otpMins * 60 * 1000);
    user.otp = { code, expiresAt };
    await user.save();
    const transporter = await getTransporter();
    const fromAddr = process.env.FROM_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@connectify.local';
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: normalizedEmail,
      subject: renderVerificationEmail(user.name, code, otpMins).subject,
      text: renderVerificationEmail(user.name, code, otpMins).text,
      html: renderVerificationEmail(user.name, code, otpMins).html,
    });
    const preview = nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null;
    if (preview) console.log('Verification OTP preview URL:', preview);
    return res.json({ message: 'OTP sent', preview: preview || undefined });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to send OTP', error: e?.message || 'unknown' });
  }
}

async function verifyOtp(req, res) {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) return res.status(400).json({ message: 'Email and otp are required' });
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.otp || !user.otp.code) return res.status(400).json({ message: 'Invalid or expired OTP' });
    if (String(user.otp.code) !== String(otp)) return res.status(400).json({ message: 'Invalid or expired OTP' });
    if (user.otp.expiresAt && new Date(user.otp.expiresAt).getTime() < Date.now()) return res.status(400).json({ message: 'Invalid or expired OTP' });
    user.is_verified = true;
    user.status = 'active';
    user.otp = { code: null, expiresAt: null };
    await user.save();
    return res.json({ message: 'Account verified' });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to verify OTP', error: e?.message || 'unknown' });
  }
}
async function register(req, res) {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ message: 'Missing required fields' });
    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ message: 'Account already exists. Please login.' });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password: hash,
      role: role === 'brand' ? 'brand' : 'influencer',
      is_verified: false,
      status: 'pending_verification',
    });
    try {
      const code = generateOtp();
      const otpMins = Number(process.env.OTP_EXPIRES_MIN || 10);
      user.otp = { code, expiresAt: new Date(Date.now() + otpMins * 60 * 1000) };
      await user.save();
      const transporter = await getTransporter();
      const fromAddr = process.env.FROM_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@connectify.local';
      const emailTpl = renderVerificationEmail(user.name, code, otpMins);
      const info = await transporter.sendMail({
        from: getFromAddress(),
        to: normalizedEmail,
        subject: emailTpl.subject,
        text: emailTpl.text,
        html: emailTpl.html,
      });
      const preview = nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null;
      if (preview) console.log('Signup OTP preview URL:', preview);
      return res.status(201).json({ message: 'Signup successful. Verification code sent to your email.', user: { _id: user._id, email: user.email }, preview: preview || undefined });
    } catch (e) {
      return res.status(201).json({ message: 'Signup successful. Failed to send verification email; use resend OTP.', user: { _id: user._id, email: user.email } });
    }
  } catch (e) {
    return res.status(500).json({ message: 'Registration failed', error: e?.message || 'unknown' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = signToken(user);
    return res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, is_verified: user.is_verified, status: user.status, created_at: user.created_at } });
  } catch (e) {
    return res.status(500).json({ message: 'Login failed', error: e?.message || 'unknown' });
  }
}
async function passwordForgot(req, res) {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const code = generateOtp();
    const otpMins = Number(process.env.OTP_EXPIRES_MIN || 10);
    user.otp = { code, expiresAt: new Date(Date.now() + otpMins * 60 * 1000) };
    await user.save();
    const transporter = await getTransporter();
    const fromAddr = process.env.FROM_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@connectify.local';
    const emailTpl = renderResetEmail(user.name, code, otpMins);
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: normalizedEmail,
      subject: emailTpl.subject,
      text: emailTpl.text,
      html: emailTpl.html,
    });
    const preview = nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null;
    if (preview) console.log('Password reset OTP preview URL:', preview);
    return res.json({ message: 'Reset OTP sent', preview: preview || undefined });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to send reset OTP', error: e?.message || 'unknown' });
  }
}

async function verifyResetOtp(req, res) {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) return res.status(400).json({ message: 'Email and otp are required' });
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.otp || !user.otp.code) return res.status(400).json({ message: 'Invalid or expired OTP' });
    if (String(user.otp.code) !== String(otp)) return res.status(400).json({ message: 'Invalid or expired OTP' });
    if (user.otp.expiresAt && new Date(user.otp.expiresAt).getTime() < Date.now()) return res.status(400).json({ message: 'Invalid or expired OTP' });
    return res.json({ message: 'OTP verified' });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to verify reset OTP', error: e?.message || 'unknown' });
  }
}

async function updatePassword(req, res) {
  try {
    const { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword) return res.status(400).json({ message: 'Email, otp and newPassword are required' });
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.otp || !user.otp.code) return res.status(400).json({ message: 'Invalid or expired OTP' });
    if (String(user.otp.code) !== String(otp)) return res.status(400).json({ message: 'Invalid or expired OTP' });
    if (user.otp.expiresAt && new Date(user.otp.expiresAt).getTime() < Date.now()) return res.status(400).json({ message: 'Invalid or expired OTP' });
    user.password = await bcrypt.hash(String(newPassword), 10);
    user.otp = { code: null, expiresAt: null };
    await user.save();
    return res.json({ message: 'Password updated' });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to update password', error: e?.message || 'unknown' });
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
  register,
  login,
  googleAuth,
  passwordForgot,
  verifyResetOtp,
  updatePassword,
};

