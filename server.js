const express = require("express");
const cors = require('cors')
require('dotenv').config()
const app = express();

const PORT = process.env.PORT || 5000;

const connectDB = require('./database.js')
const authRoutes = require('./routes/auth')
const profileRoutes = require('./routes/profile')
const userRoutes = require('./routes/user')
const contactRoutes = require('./routes/contact')

connectDB();

// CORS: allow explicit frontend origins
// Configure via FRONTEND_ORIGIN (comma-separated); sensible defaults for local dev (5173/5174)
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
    // Allow non-browser requests (no Origin header) and same-origin tools
    if (!origin) return cb(null, true);
    return FRONTEND_ORIGINS.includes(origin)
      ? cb(null, true)
      : cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  // credentials: true, // enable only if you move to cookie-based auth
}))
app.use(express.json())
app.use('/api/auth', authRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/user', userRoutes)
app.use('/api/contact', contactRoutes)

app.listen(Number(PORT), () => {
  console.log(`Server is listening at the port ${PORT}`)
});