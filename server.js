const express = require("express");
const http = require('http')
const cors = require('cors')
require('dotenv').config()
const app = express();

const PORT = process.env.PORT || 5001;

const connectDB = require('./database.js')
const authRoutes = require('./routes/auth')

connectDB();

// CORS: allow a single, explicit frontend origin (secure and simple)
// Configure via FRONTEND_ORIGIN; defaults to Vite dev URL
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || 'http://localhost:5174').trim();
console.log('CORS: allowing origin', FRONTEND_ORIGIN);

app.use(cors({
  origin: (origin, cb) => {
    // Allow non-browser requests (no Origin header) and same-origin tools
    if (!origin) return cb(null, true);
    return origin === FRONTEND_ORIGIN
      ? cb(null, true)
      : cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  // credentials: true, // enable only if you move to cookie-based auth
}))
app.use(express.json())
app.use('/api/auth', authRoutes)

function startServer(port, triedFallback = false) {
  const server = http.createServer(app);
  server.listen(port, () => {
    console.log(`Server is listening at the port ${port}`)
  });
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      const fallback = 5001;
      if (!triedFallback && port !== fallback) {
        console.warn(`Port ${port} in use. Trying ${fallback}...`);
        startServer(fallback, true);
      } else {
        console.error(`All attempted ports are in use. Last tried: ${port}`);
        process.exit(1);
      }
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
}

startServer(Number(PORT));