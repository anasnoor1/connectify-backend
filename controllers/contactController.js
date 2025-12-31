const nodemailer = require('nodemailer');

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

exports.submit = async (req, res) => {
  try {
    const { name, email, message } = req.body || {};
    const nameStr = String(name || '').trim();
    const emailStr = String(email || '').trim().toLowerCase();
    const msgStr = String(message || '').trim();

    if (!nameStr || !emailStr || !msgStr || !isValidEmail(emailStr)) {
      return res.status(400).json({ success: false, message: 'Invalid input' });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    await transporter.sendMail({
      from: `Connectify <${process.env.EMAIL_USER}>`,
      to: 'naeemilyas2140@gmail.com',
      replyTo: `${nameStr} <${emailStr}>`,
      subject: 'New Contact Message from Connectify',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 16px;">
          <h2 style="margin:0 0 12px">New Contact Submission</h2>
          <p><strong>Name:</strong> ${nameStr}</p>
          <p><strong>Email:</strong> ${emailStr}</p>
          <p><strong>Message:</strong></p>
          <p style="white-space:pre-wrap">${msgStr}</p>
        </div>
      `,
    });

    return res.status(200).json({ success: true, message: 'Email sent successfully' });
  } catch (err) {
    console.error('Contact submit error:', err?.response || err?.message || err);
    return res.status(500).json({ success: false, message: 'Something went wrong' });
  }
};
