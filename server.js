const express = require("express");
const cors = require('cors')
require('dotenv').config()
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;


const connectDB = require('./database.js')
const authRoutes = require('./routes/auth')
const profileRoutes = require('./routes/profile')
const userRoutes = require('./routes/user')
const contactRoutes = require('./routes/contact')
const instagramRoutes = require('./routes/instagram')
const dashboardRoutes = require('./routes/dashboard');
const campaignRoutes = require('./routes/campaign');
const adminRoutes = require('./routes/admin');
const ensureAdminUser = require('./utils/ensureAdminUser');
const proposalRoutes = require("./routes/proposals");

const io = socketIo(server, {
  cors: { 
    origin: "*", // You can restrict this to FRONTEND_ORIGINS if required
  }
});

require("./socket")(io);

connectDB();
ensureAdminUser();

// CORS configuration
const FRONTEND_ORIGINS = String(
  process.env.FRONTEND_ORIGIN ||
  'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
console.log('CORS: allowing origins', FRONTEND_ORIGINS);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    return FRONTEND_ORIGINS.includes(origin)
      ? cb(null, true)
      : cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization', 'Accept', 'X-Requested-With'],
  credentials: true,
}))
app.use(express.json())
app.use('/api/auth', authRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/user', userRoutes)
app.use('/api/contact', contactRoutes)
app.use('/api/instagram', instagramRoutes)
app.use('/api/admin', adminRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use("/api/proposals", proposalRoutes);

app.use("/api/chat", require("./routes/chatRoutes.js"));
app.use("/api/message", require("./routes/messageRoute.js"));


server.listen(Number(PORT), () => {
  console.log(`Server running on port ${PORT}`);
});

// app.listen(Number(PORT), () => {
//   console.log(`Server is listening at port ${PORT}`)
// });

