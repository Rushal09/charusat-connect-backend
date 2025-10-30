const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// --- ✅ CORS CONFIG ---
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://charusat-connect-frontend-chi.vercel.app', // main production frontend
  'https://charusat-connect-frontend.vercel.app'      // backup domain just in case
];

// Allow subdomains of vercel.app dynamically
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      // Allow server-to-server, Google OAuth, and local tools
      return callback(null, true);
    }

    const isAllowed =
      allowedOrigins.includes(origin) ||
      /\.vercel\.app$/.test(origin); // wildcard for Vercel preview deployments

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('🚫 Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// --- Payload Config ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Upload Folders ---
const uploadDirs = [
  path.join(__dirname, 'uploads', 'lostfound'),
  path.join(__dirname, 'uploads', 'events'),
  path.join(__dirname, 'uploads', 'clubs')
];
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log('📁 Created upload directory:', dir);
    } catch (error) {
      console.log('📁 Upload directory creation skipped (production environment)');
    }
  }
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Health Routes ---
app.get('/', (req, res) => {
  res.json({
    message: 'CHARUSAT Connect Backend is running!',
    status: 'success',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.get('/api/auth/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Backend is working properly',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// --- API Routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/lostfound', require('./routes/lostfound'));

try {
  if (fs.existsSync(path.join(__dirname, 'routes', 'events.js'))) {
    app.use('/api/events', require('./routes/events'));
    console.log('✅ Events routes loaded');
  }
} catch (error) {
  console.log('⚠️ Events routes not available yet');
}

try {
  if (fs.existsSync(path.join(__dirname, 'routes', 'clubs.js'))) {
    app.use('/api/clubs', require('./routes/clubs'));
    console.log('✅ Clubs routes loaded');
  }
} catch (error) {
  console.log('⚠️ Clubs routes not available yet');
}

// --- MongoDB Connection ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/charusat-connect';
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
  })
  .catch(err => {
    console.log('❌ MongoDB connection error:', err.message);
    if (process.env.NODE_ENV !== 'production') process.exit(1);
  });

// --- Socket.io Config ---
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
});

// --- Active Users Placeholder ---
const activeUsers = new Map();
// (Add socket.io events here)

// --- Start Server ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 CHARUSAT Connect Backend running on port ${PORT}`);
});

// --- Export for Render ---
module.exports = { app, server };
