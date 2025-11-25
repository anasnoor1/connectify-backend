const bcrypt = require('bcryptjs');
const User = require('../model/User');

const DEFAULT_ADMIN_EMAIL = 'naeemilyas2140@gmail.com';
const DEFAULT_ADMIN_PASSWORD = 'Pakistan1@';
const ensureAdminUser = async () => {
  try {
    const adminEmail = String(process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.warn('Admin credentials are not configured. Skipping admin bootstrap.');
      return;
    }

    let admin = await User.findOne({ email: adminEmail }).select('+password');

    if (!admin) {
      const hashed = await bcrypt.hash(adminPassword, 10);
      await User.create({
        name: 'Connectify Admin',
        email: adminEmail,
        password: hashed,
        role: 'admin',
        is_verified: true,
        status: 'active',
        otp: { code: null, expiresAt: null },
        is_deleted: false,
        deletedAt: null,
      });
      console.log(`Admin user created with email ${adminEmail}`);
      return;
    }

    let hasChanges = false;

    if (admin.role !== 'admin') {
      admin.role = 'admin';
      hasChanges = true;
    }

    if (!admin.is_verified) {
      admin.is_verified = true;
      hasChanges = true;
    }

    if (admin.status !== 'active') {
      admin.status = 'active';
      hasChanges = true;
    }

    if (admin.is_deleted) {
      admin.is_deleted = false;
      admin.deletedAt = null;
      hasChanges = true;
    }

    if (admin.otp?.code || admin.otp?.expiresAt) {
      admin.otp = { code: null, expiresAt: null };
      hasChanges = true;
    }

    const passwordMatches = await bcrypt.compare(adminPassword, admin.password);
    if (!passwordMatches) {
      admin.password = await bcrypt.hash(adminPassword, 10);
      hasChanges = true;
    }

    if (hasChanges) {
      await admin.save();
      console.log(`Admin user ${adminEmail} updated.`);
    } else {
      console.log(`Admin user ${adminEmail} already configured.`);
    }
  } catch (error) {
    console.error('Failed to ensure admin user:', error.message || error);
  }
};

module.exports = ensureAdminUser;
