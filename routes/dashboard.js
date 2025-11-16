const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

// Protect all dashboard routes
router.use(protect);

// Get brand dashboard data
router.get('/brand', dashboardController.getBrandDashboard);

module.exports = router;