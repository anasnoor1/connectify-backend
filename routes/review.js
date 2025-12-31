const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const reviewController = require('../controllers/reviewController');

// Create a review (brand or influencer)
router.post('/', protect, reviewController.createReview);

// Public: get reviews for a user (with average rating)
router.get('/user/:userId', reviewController.getUserReviews);

// Protected: get reviews for a specific campaign
router.get('/campaign/:campaignId', protect, reviewController.getCampaignReviews);

module.exports = router;
