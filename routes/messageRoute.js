const express = require('express');
const router = express.Router();

const {protect} = require("../middleware/authMiddleware");
const messageFilter = require("../middleware/messageFilter");
const { getMessages, sendMessage } = require("../controllers/messageController");

router.get("/:roomId", protect, getMessages);
router.post("/", protect,messageFilter, sendMessage);

module.exports = router;
