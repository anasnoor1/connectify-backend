<<<<<<< HEAD
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const path = require('path');

=======
const express = require("express");
const http = require('http')
const cors = require('cors')
require('dotenv').config()
>>>>>>> auth-anas
const app = express();


const PORT = process.env.PORT || 5001;

const connectDB = require('./database.js')
const authRoutes = require('./routes/auth')

connectDB();

app.use(cors({ origin: 'http://localhost:5173', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }))
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