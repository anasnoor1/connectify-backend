const jwt = require("jsonwebtoken");
const Message = require("./model/Message");
const cleanMessage = require("./middleware/messageFilter");
const BrandProfile = require("./model/BrandProfile");
const InfluencerProfile = require("./model/InfluencerProfile");
const ChatRoom = require("./model/Chat");
const Campaign = require("./model/Campaign");
let ioInstance = null;

// Store online users and typing indicators
const onlineUsers = new Map(); // userId -> { socketId, lastSeen }
const typingUsers = new Map(); // roomId -> Set of userIds typing

module.exports = (io) => {
  ioInstance = io;

  // Socket authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Not authorized"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded; // attach user info to socket
      next();
    } catch (err) {
      next(new Error("Token invalid"));
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected", socket.id, socket.user?.email);

    // Add user to online users
    if (socket.user?.id) {
      onlineUsers.set(socket.user.id, {
        socketId: socket.id,
        lastSeen: new Date(),
        user: socket.user
      });
      
      // Broadcast online status to all rooms user is in
      socket.broadcast.emit("user_online", {
        userId: socket.user.id,
        user: socket.user
      });
    }

    socket.on("join_room", (roomId) => {
      socket.join(roomId);
      console.log(`User ${socket.user?.id} joined room ${roomId}`);
      
      // Notify others in room that user is online
      socket.to(roomId).emit("user_joined_room", {
        userId: socket.user.id,
        roomId: roomId,
        user: socket.user
      });
    });

    socket.on("leave_room", (roomId) => {
      socket.leave(roomId);
      console.log(`User ${socket.user?.id} left room ${roomId}`);
      
      // Notify others in room that user left
      socket.to(roomId).emit("user_left_room", {
        userId: socket.user.id,
        roomId: roomId
      });
    });

    // Typing indicators
    socket.on("typing_start", (data) => {
      const { roomId } = data;
      if (!roomId || !socket.user?.id) return;

      if (!typingUsers.has(roomId)) {
        typingUsers.set(roomId, new Set());
      }
      typingUsers.get(roomId).add(socket.user.id);

      socket.to(roomId).emit("user_typing", {
        userId: socket.user.id,
        roomId: roomId,
        user: socket.user
      });
    });

    socket.on("typing_stop", (data) => {
      const { roomId } = data;
      if (!roomId || !socket.user?.id) return;

      if (typingUsers.has(roomId)) {
        typingUsers.get(roomId).delete(socket.user.id);
        if (typingUsers.get(roomId).size === 0) {
          typingUsers.delete(roomId);
        }
      }

      socket.to(roomId).emit("user_stopped_typing", {
        userId: socket.user.id,
        roomId: roomId
      });
    });

    // Read receipts
    socket.on("mark_messages_read", async (data) => {
      const { roomId, messageIds } = data;
      if (!roomId || !socket.user?.id) return;

      try {
        await Message.updateMany(
          { 
            _id: { $in: messageIds },
            roomId: roomId,
            senderId: { $ne: socket.user.id } // Only mark others' messages as read
          },
          { 
            $addToSet: { readBy: socket.user.id },
            $set: { [`readAt.${socket.user.id}`]: new Date() }
          }
        );

        // Notify sender that their messages were read
        const messages = await Message.find({ _id: { $in: messageIds } })
          .populate("senderId", "name role");
        
        messages.forEach(msg => {
          if (msg.senderId._id.toString() !== socket.user.id) {
            io.to(msg.senderId._id.toString()).emit("messages_read", {
              roomId: roomId,
              messageIds: messageIds,
              readBy: socket.user.id,
              readAt: new Date()
            });
          }
        });

      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    });

    socket.on("send_message", async (data) => {
      const clean = cleanMessage(data.message);
      if (!clean) return socket.emit("blocked", "Personal info not allowed");

      try {
        // Use authenticated user
        const msg = await Message.create({
          roomId: data.roomId,
          senderId: socket.user.id,
          message: clean,
          status: "sent",
          attachments: data.attachments || [],
          replyTo: data.replyTo || null
        });

        // Populate sender basic info and reply info
        let populated = await Message.findById(msg._id)
          .populate("senderId", "name role")
          .populate("replyTo", "message senderId");
        
        let payload = populated.toObject();

        // Attach avatar_url for sender
        const sender = payload.senderId;
        if (sender && sender._id) {
          const senderId = sender._id.toString();
          if (sender.role === "brand") {
            const bp = await BrandProfile.findOne({ brand_id: senderId }).select("avatar_url");
            if (bp) sender.avatar_url = bp.avatar_url || "";
          } else if (sender.role === "influencer") {
            const ip = await InfluencerProfile.findOne({ influencer_id: senderId }).select("avatar_url");
            if (ip) sender.avatar_url = ip.avatar_url || "";
          }
        }

        // Send to room
        io.to(data.roomId).emit("receive_message", payload);

        // Update message status to delivered for sender
        await Message.findByIdAndUpdate(msg._id, { status: "delivered" });
        
        // Notify sender of delivery
        socket.emit("message_delivered", {
          messageId: msg._id,
          roomId: data.roomId
        });

      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("message_error", {
          error: "Failed to send message",
          roomId: data.roomId
        });
      }
    });

    // Handle message reactions
    socket.on("add_reaction", async (data) => {
      const { roomId, messageId, emoji } = data;
      
      if (!roomId || !messageId || !emoji) return;

      try {
        // Check if user already reacted with this emoji
        const message = await Message.findById(messageId);
        if (!message) return;

        const existingReaction = message.reactions?.find(
          r => r.userId.toString() === socket.user.id && r.emoji === emoji
        );

        if (existingReaction) {
          // Remove reaction if it already exists
          await Message.findByIdAndUpdate(messageId, {
            $pull: { reactions: { userId: socket.user.id, emoji } }
          });
        } else {
          // Add new reaction
          await Message.findByIdAndUpdate(messageId, {
            $push: { 
              reactions: { 
                userId: socket.user.id, 
                emoji, 
                createdAt: new Date() 
              } 
            }
          });
        }

        // Get updated message with populated reactions
        const updatedMessage = await Message.findById(messageId)
          .populate("reactions.userId", "name");

        // Broadcast reaction update to room
        io.to(roomId).emit("reaction_updated", {
          messageId,
          reactions: updatedMessage.reactions
        });

      } catch (error) {
        console.error("Error adding reaction:", error);
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log("User disconnected", socket.id, socket.user?.email);
      
      if (socket.user?.id) {
        // Remove from online users
        onlineUsers.delete(socket.user.id);
        
        // Remove from all typing indicators
        typingUsers.forEach((users, roomId) => {
          if (users.has(socket.user.id)) {
            users.delete(socket.user.id);
            socket.to(roomId).emit("user_stopped_typing", {
              userId: socket.user.id,
              roomId: roomId
            });
          }
        });

        // Broadcast offline status
        socket.broadcast.emit("user_offline", {
          userId: socket.user.id
        });
      }
    });
  });
};

// Helper functions to get online users and typing status
module.exports.getOnlineUsers = () => {
  return Array.from(onlineUsers.values()).map(user => ({
    userId: user.user.id,
    name: user.user.name,
    role: user.user.role,
    lastSeen: user.lastSeen
  }));
};

module.exports.getTypingUsers = (roomId) => {
  const typing = typingUsers.get(roomId);
  return typing ? Array.from(typing) : [];
};

module.exports.getIO = () => {
  if (!ioInstance) {
    throw new Error("Socket.io not initialized");
  }
  return ioInstance;
};