const express = require("express");
const router = express.Router();
const { getLandingHighlights } = require("../controllers/homeController");

// Public landing page data
router.get("/highlights", getLandingHighlights);

module.exports = router;
