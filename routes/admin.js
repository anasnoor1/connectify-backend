const express = require('express');
const router = express.Router();
const { protect, requireAdmin } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');
const adminReportsController = require('../controllers/adminReportsController');

router.use(protect, requireAdmin);

router.get('/users', adminController.getAllUsers);
router.put('/users/:id/status', adminController.updateUserStatus);
router.get('/campaigns', adminController.getCampaigns);
router.put('/campaigns/:id/status', adminController.updateCampaignStatus);
router.get('/transactions', adminController.getTransactions);
router.post('/transactions/:proposalId/payout', adminController.payoutProposal);

router.get('/reports/summary', adminReportsController.getSummaryReport);
router.get('/reports/summary/export', adminReportsController.exportSummaryReport);

router.get('/reports/campaign-performance', adminReportsController.getCampaignPerformanceReport);
router.get('/reports/brand-spending', adminReportsController.getBrandSpendingReport);
router.get('/reports/influencer-earnings', adminReportsController.getInfluencerEarningsReport);
router.get('/reports/platform-revenue', adminReportsController.getPlatformRevenueReport);

router.get('/reports/:type/export', adminReportsController.exportReport);

module.exports = router;
