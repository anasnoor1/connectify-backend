const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/register', authController.register);
router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/google', authController.googleAuth);
// Forgot password flow
router.post('/password/forgot', authController.passwordForgot);
router.post('/password/verify-reset', authController.verifyResetOtp);
router.put('/password/update', authController.updatePassword);

module.exports = router;