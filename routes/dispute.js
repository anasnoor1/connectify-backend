const express = require("express");
const router = express.Router();
const { protect, requireAdmin } = require("../middleware/authMiddleware");
const {
  createDispute,
  getDisputes,
  getDispute,
  addEvidence,
  addMessage,
  adminDecision,
} = require("../controllers/disputeController");

// Brand or Influencer can create and view their disputes
router.post("/", protect, createDispute);
router.get("/", protect, getDisputes);
router.get("/:id", protect, getDispute);
router.post("/:id/evidence", protect, addEvidence);
router.post("/:id/messages", protect, addMessage);

// Admin actions
router.post("/:id/decision", protect, requireAdmin, adminDecision);

module.exports = router;
