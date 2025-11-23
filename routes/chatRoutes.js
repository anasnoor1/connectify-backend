// const express = require('express');
// const router = express.Router();
// const { protect }  = require("../middleware/authMiddleware");
// const { openChat ,getChatRoom , getBrandChats} = require("../controllers/chatController");


// router.get("/chatroom", protect, getChatRoom);
// router.post("/open", protect, openChat);
// router.get('/brand', protect, getBrandChats);

// module.exports = router;

const express = require('express');
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { openChat, getChatRoom, getUserChats } = require("../controllers/chatController");

// Open or create a chat
router.post("/open", protect, openChat);

// Get a specific chat room by campaignId + participants
router.get("/chatroom", protect, getChatRoom);

// Get all chats for the logged-in user (influencer or brand)
router.get("/my-chats", protect, getUserChats);

module.exports = router;
