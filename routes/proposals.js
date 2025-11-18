const express = require("express");
const router = express.Router();
const { createProposal ,getMyProposals } = require("../controllers/proposalController");
const { protect } = require("../middleware/authMiddleware");

// Create proposal
router.post("/", protect, createProposal);
router.get("/my", protect, getMyProposals);

module.exports = router;