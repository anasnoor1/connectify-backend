// const Message = require("./model/Message");
// const cleanMessage = require("./middleware/messageFilter");

// module.exports = (io) => {
//   io.on("connection", (socket) => {
//     console.log("User connected", socket.id);

//     socket.on("join_room", (roomId) => {
//       socket.join(roomId);
//     });

//     socket.on("send_message", async (data) => {
//       const clean = cleanMessage(data.message);
//       if (!clean) {
//         return socket.emit("blocked", "Personal info not allowed");
//       }

//       const msg = await Message.create({
//         roomId: data.roomId,
//         senderId: data.senderId,
//         message: clean,
//       });

//       io.to(data.roomId).emit("receive_message", msg);
//     });
//   });
// };
/////////////////////

const jwt = require("jsonwebtoken");
const Message = require("./model/Message");
const cleanMessage = require("./middleware/messageFilter");

module.exports = (io) => {

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

    socket.on("join_room", (roomId) => {
      socket.join(roomId);
    });

    socket.on("send_message", async (data) => {
      const clean = cleanMessage(data.message);
      if (!clean) return socket.emit("blocked", "Personal info not allowed");

      // Use authenticated user
      const msg = await Message.create({
        roomId: data.roomId,
        senderId: socket.user.id, // <--- use socket.user.id
        message: clean,
      });

      io.to(data.roomId).emit("receive_message", msg);
    });
  });
};
