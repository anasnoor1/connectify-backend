const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getStripeStatus,
  createStripeConnectLink,
} = require('../controllers/paymentController');

router.get('/stripe/status', protect, getStripeStatus);
router.post('/stripe/connect', protect, createStripeConnectLink);

module.exports = router;
