const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const os = require('os');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// --- CORS CONFIG ---
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://charusat-connect-frontend-chi.vercel.app', // your deployed Vercel frontend
  // add any other domains as needed
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like Next.js/SSR or server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS blocked for origin: ' + origin));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

// Apply CORS to all routes
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Preflight for all routes

// ----- JSON middleware -----
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ----- Static/upload dirs -----
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

// --- Health check routes ---
app.get('/', (req, res) => {
  res.json({
    message: 'CHARUSAT Connect Backend is running!',
    status: 'success',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    endpoints: [
      'POST /api/auth/signup',
      'POST /api/auth/login', 
      'GET /api/auth/me',
      'GET /api/auth/health',
      'GET /api/chat/rooms',
      'GET /api/chat/messages/:room',
      'GET /lostfound',
      'POST /lostfound',
      'GET /api/events',
      'GET /api/clubs'
    ]
  });
});
app.get('/api/auth/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Backend is working properly',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
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

// --- Database ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/charusat-connect';
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    console.log('📊 Database:', MONGODB_URI.includes('mongodb+srv') ? 'MongoDB Atlas (Cloud)' : 'Local MongoDB');
  })
  .catch(err => {
    console.log('❌ MongoDB connection error:', err.message);
    if (process.env.NODE_ENV !== 'production') process.exit(1);
  });

// --- Socket.io ---
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

const activeUsers = new Map();
// ... Socket.io code remains as you had ...

// --- Server startup ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 CHARUSAT Connect Backend running: http://localhost:${PORT}`);
});

// --- Clean shutdown, errors etc (no changes needed) ---

module.exports = { app, server }; // If your deployment needs it
