const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom", required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  message: { type: String, required: true },
  isSystem: { type: Boolean, default: false },
  
  // Message status tracking
  status: { 
    type: String, 
    enum: ["sent", "delivered", "read"], 
    default: "sent" 
  },
  
  // Read receipts
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  readAt: { 
    type: Map, 
    of: Date, // userId -> read timestamp
    default: new Map()
  },
  
  // Delivery tracking
  deliveredAt: { type: Date },
  
  // Message reactions
  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    emoji: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Reply functionality
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  
  // File attachments
  attachments: [{
    type: { 
      type: String, 
      enum: ["image", "video", "file", "audio"], 
      required: true 
    },
    url: { type: String, required: true },
    filename: { type: String },
    size: { type: Number },
    mimeType: { type: String }
  }],
  
  // Message editing
  editedAt: { type: Date },
  originalMessage: { type: String }
  
}, { timestamps: true });

// Index for better query performance
MessageSchema.index({ roomId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });
MessageSchema.index({ "readBy": 1 });

module.exports = mongoose.model("Message", MessageSchema);