const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getStripeStatus,
  createStripeConnectLink,
  createStripeLoginLink,
  disconnectStripe,
  createPakPayment,
} = require('../controllers/paymentController');

router.get('/stripe/status', protect, getStripeStatus);
router.post('/stripe/connect', protect, createStripeConnectLink);
router.get('/stripe/login-link', protect, createStripeLoginLink);
router.post('/stripe/disconnect', protect, disconnectStripe);
router.post('/pak-payment', protect, createPakPayment);

module.exports = router;
