const express = require('express');
const profileRouter = express.Router(); // Name change karo
const { protect } = require('../middleware/authMiddleware');
const profileController = require('../controllers/profileController');

// Brand profile routes
profileRouter.get('/brand', protect, profileController.getBrandProfile);
profileRouter.put('/brand', protect, profileController.upsertBrandProfile);
profileRouter.delete('/brand', protect, profileController.deleteBrandProfile);

// Influencer profile routes
profileRouter.get('/influencer', protect, profileController.getInfluencerProfile);
profileRouter.put('/influencer', protect, profileController.upsertInfluencerProfile);
profileRouter.delete('/influencer', protect, profileController.deleteInfluencerProfile);

// Unified profile routes with enhanced features
profileRouter.get('/me', protect, profileController.getCompleteProfile);
profileRouter.put('/me', protect, profileController.upsertCompleteProfile);
profileRouter.post('/me', protect, profileController.upsertCompleteProfile);
profileRouter.delete('/me', protect, profileController.deleteMyProfile);

// Additional features
profileRouter.put('/avatar', protect, profileController.uploadAvatar);
profileRouter.get('/search', protect, profileController.searchProfiles);

// Public read-only profile routes (no auth required)
profileRouter.get('/public/influencer/:slug', profileController.getPublicInfluencerProfileBySlug);
profileRouter.get('/public/brand/:slug', profileController.getPublicBrandProfileBySlug);
profileRouter.get('/public/influencer/id/:id', profileController.getPublicInfluencerProfileById);
profileRouter.get('/public/brand/id/:id', profileController.getPublicBrandProfileById);

module.exports = profileRouter;