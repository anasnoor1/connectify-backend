const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const campaignController = require('../controllers/campaignController');

// Protect all campaign routes
router.use(protect);

// Campaign routes
router.post('/', campaignController.createCampaign);
router.get('/', campaignController.getBrandCampaigns);
router.get("/suggestions",  campaignController.getSuggestedCampaigns);
router.get('/:id', campaignController.getCampaign);
router.put('/:id', campaignController.updateCampaign);
router.delete('/:id', campaignController.deleteCampaign);
router.post('/:id/influencer-complete', campaignController.markCompletedByInfluencer);

module.exports = router;