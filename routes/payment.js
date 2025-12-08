const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getStripeStatus,
  createStripeConnectLink,
  disconnectStripe,
} = require('../controllers/paymentController');

router.get('/stripe/status', protect, getStripeStatus);
router.post('/stripe/connect', protect, createStripeConnectLink);
router.post('/stripe/disconnect', protect, disconnectStripe);

module.exports = router;
