const Message = require("../model/Message");
const ChatRoom = require("../model/Chat");
// const cleanMessage = require("../middleware/messageFilter");

exports.getMessages = async (req, res) => {
  const { roomId } = req.params;

  const messages = await Message.find({ roomId })
    .populate("senderId", "name role");

  res.json(messages);
};


// exports.sendMessage = async (req, res) => {
//   const { roomId, message } = req.body;
//   const clean = cleanMessage(message);

//   if (!clean) return res.status(400).json({ error: "Sharing personal info is not allowed." });

//   const newMsg = await Message.create({
//     roomId,
//     senderId: req.user._id,
//     message: clean,
//   });

//   return res.json(newMsg);
// };

exports.sendMessage = async (req, res) => {
  try {
    const { roomId, message } = req.body;

    // message is already validated by middleware

    const newMsg = await Message.create({
      roomId,
      senderId: req.user._id,
      message,
    });

    await ChatRoom.findByIdAndUpdate(roomId, {
      lastMessage: {
        text: message,
        senderId: req.user._id,
        createdAt: new Date(),
      }
    });

    res.json(newMsg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};