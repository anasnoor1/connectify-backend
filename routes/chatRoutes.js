const express = require('express');
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { openChat, getChatRoom, getUserChats } = require("../controllers/chatController");

// Open or create a chat
router.post("/open", protect, openChat);

// Get a specific chat room by campaignId + participants
// router.get("/chatroom", protect, getChatRoom);
router.get("/my-chats", protect, getUserChats);
router.get("/chatroom/:roomId", protect, getChatRoom);

// Get all chats for the logged-in user (influencer or brand)

module.exports = router;