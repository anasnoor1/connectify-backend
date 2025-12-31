const express = require('express');
const userRouter = express.Router(); // Name change karo
const { protect } = require('../middleware/authMiddleware');
const profileController = require('../controllers/profileController');

// Compatibility layer: frontend calls /api/user/me
userRouter.get('/me', protect, profileController.getCompleteProfile);
userRouter.put('/me', protect, profileController.upsertCompleteProfile);
userRouter.post('/me', protect, profileController.upsertCompleteProfile);
userRouter.delete('/me', protect, profileController.deleteMyProfile);

module.exports = userRouter;