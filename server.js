require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const path = require('path');

const app = express();
connectDB();

app.use(helmet());
app.use(express.json());
// CORS configuration with allowlist for multiple dev origins
const allowlist = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((s) => s.trim());

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowlist.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
// Express v5: handle preflight for all paths using a regex
app.options(/.*/, cors(corsOptions));

// serve uploads folder statically
app.use('/upload', express.static(path.join(__dirname, 'upload')));

// Basic rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 10,                 // limit each IP to 10 requests per windowMs
  message: { message: 'Too many requests, please try later.' }
});

app.use('/api/auth', authLimiter, require('./routes/auth'));

// health check
app.get('/', (req, res) => res.send({ status: 'ok' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));