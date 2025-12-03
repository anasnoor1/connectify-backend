const express = require('express');
const router = express.Router();
const { protect, requireAdmin } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');

router.use(protect, requireAdmin);

router.get('/users', adminController.getAllUsers);
router.put('/users/:id/status', adminController.updateUserStatus);
router.get('/campaigns', adminController.getCampaigns);
router.put('/campaigns/:id/status', adminController.updateCampaignStatus);
router.get('/transactions', adminController.getTransactions);
router.post('/transactions/:proposalId/payout', adminController.payoutProposal);

module.exports = router;
