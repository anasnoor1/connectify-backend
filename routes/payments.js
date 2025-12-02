const express = require("express");
const router = express.Router();
const { protect, requireAdmin } = require("../middleware/authMiddleware");
const {
  createPaymentIntent,
  markPaymentPaid,
  markPayoutReleased,
} = require("../controllers/paymentsController");

router.post("/create-intent", protect, createPaymentIntent);
router.post("/mark-paid", protect, markPaymentPaid);
router.post("/mark-payout-released", protect, requireAdmin, markPayoutReleased);

module.exports = router;
