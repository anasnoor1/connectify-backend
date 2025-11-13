const express = require('express');
const router = express.Router();
const { getInstagramProfile } = require('../controllers/instagramController');

// GET /api/instagram/:username
router.get('/:username', getInstagramProfile);

module.exports = router;