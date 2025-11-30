const express = require("express");
const router = express.Router();
const {
    createProposal,
    getMyProposals,
    getBrandProposals,
    updateProposalStatus,
    getAllProposals,
    getMyStats,
} = require("../controllers/proposalController");
const { protect, requireAdmin } = require("../middleware/authMiddleware");

// Influencer routes
router.post("/", protect, createProposal);
router.get("/my", protect, getMyProposals);
router.get("/my/stats", protect, getMyStats);

// Brand routes
router.get("/brand", protect, getBrandProposals);
router.patch("/:proposalId/status", protect, updateProposalStatus);

// Admin routes
router.get("/all", protect, requireAdmin, getAllProposals);

module.exports = router;
