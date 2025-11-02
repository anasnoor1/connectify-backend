const express = require("express");
const http = require('http')
const cors = require('cors')
require('dotenv').config()
const app = express();


const PORT = process.env.PORT || 5001;

const connectDB = require('./database.js')
const authRoutes = require('./routes/auth')

connectDB();

const envOrigins = (process.env.FRONTEND_URLS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const allowedOrigins = envOrigins.length ? envOrigins : ['http://localhost:5173','http://localhost:5174'];
app.use(cors({ origin: allowedOrigins, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }))
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