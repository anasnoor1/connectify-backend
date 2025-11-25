const express = require('express');
const router = express.Router();

const {protect} = require("../middleware/authMiddleware");
const messageFilter = require("../middleware/messageFilter");
const { getMessages, sendMessage } = require("../controllers/messageController");

router.post("/", protect,messageFilter, sendMessage);
router.get("/:roomId", protect, getMessages);

module.exports = router;


