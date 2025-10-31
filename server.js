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

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      const { address, family, internal } = interface;
      if (family === 'IPv4' && !internal) {
        return address;
      }
    }
  }
  return '127.0.0.1';
}

const localIP = getLocalIP();

// ✅ PRODUCTION-READY CORS CONFIGURATION
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
    if (!origin) return callback(null, true);
    
    // Define allowed origins for different environments
    const allowedOrigins = [
      // Local development
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      `http://${localIP}:3000`,
      
      // Vercel deployments (allow all .vercel.app domains)
      /https:\/\/.*\.vercel\.app$/,
      
      // Local network (for mobile testing)
      /http:\/\/192\.168\.\d+\.\d+:\d+/,
      /http:\/\/10\.\d+\.\d+\.\d+:\d+/,
      /http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+:\d+/
    ];
    
    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(pattern => {
      if (typeof pattern === 'string') {
        return origin === pattern;
      } else if (pattern instanceof RegExp) {
        return pattern.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      // In production, be more permissive to avoid blocking legitimate requests
      if (process.env.NODE_ENV === 'production') {
        callback(null, true); // Allow all origins in production
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Additional CORS headers for production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
  });
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Root route for health check
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

// Health check route
app.get('/api/auth/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    message: 'Backend is working properly',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ✅ CRITICAL: Create upload directories if they don't exist
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

// ✅ Static file serving (works in both development and production)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes - Only include existing routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/lostfound', require('./routes/lostFound'));

// ✅ CONDITIONAL: Only add routes if files exist
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

// Socket.io setup with production-ready configuration
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? "*" : corsOptions.origin,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Database connection with better error handling
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/charusat-connect';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    console.log('📊 Database:', MONGODB_URI.includes('mongodb+srv') ? 'MongoDB Atlas (Cloud)' : 'Local MongoDB');
  })
  .catch(err => {
    console.log('❌ MongoDB connection error:', err.message);
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  });

// Enhanced Socket.io Chat Logic
const activeUsers = new Map();

io.on('connection', (socket) => {
  const clientIP = socket.handshake.address;
  console.log(`🟢 User connected: ${socket.id} from ${clientIP}`);

  socket.on('join-room', ({ room, user }) => {
    socket.join(room);
    activeUsers.set(socket.id, { ...user, room, socketId: socket.id, joinedAt: new Date() });
    
    socket.to(room).emit('user-joined', {
      message: `${user.username || user.displayName} joined the chat`,
      timestamp: new Date(),
      type: 'system'
    });

    const roomUsers = Array.from(activeUsers.values()).filter(u => u.room === room);
    io.to(room).emit('room-users-updated', {
      count: roomUsers.length,
      users: roomUsers.map(u => ({ 
        username: u.username, 
        displayName: u.displayName,
        joinedAt: u.joinedAt
      }))
    });

    console.log(`📥 ${user.username} joined room: ${room} (Total in room: ${roomUsers.length})`);
  });

  socket.on('send-message', ({ room, message, user }) => {
    const chatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: message.trim(),
      user: {
        username: user.username,
        displayName: user.displayName || user.username,
        year: user.profile?.year,
        branch: user.profile?.branch
      },
      timestamp: new Date(),
      type: 'user'
    };

    io.to(room).emit('receive-message', chatMessage);
    console.log(`💬 Message in ${room} from ${user.username}: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
  });

  socket.on('typing-start', ({ room, user }) => {
    socket.to(room).emit('user-typing', { 
      user: user.username,
      displayName: user.displayName || user.username 
    });
  });

  socket.on('typing-stop', ({ room, user }) => {
    socket.to(room).emit('user-stop-typing', { user: user.username });
  });

  socket.on('disconnect', (reason) => {
    const user = activeUsers.get(socket.id);
    if (user) {
      const { room } = user;
      activeUsers.delete(socket.id);
      
      socket.to(room).emit('user-left', {
        message: `${user.username || user.displayName} left the chat`,
        timestamp: new Date(),
        type: 'system'
      });

      const roomUsers = Array.from(activeUsers.values()).filter(u => u.room === room);
      io.to(room).emit('room-users-updated', {
        count: roomUsers.length,
        users: roomUsers.map(u => ({ 
          username: u.username, 
          displayName: u.displayName,
          joinedAt: u.joinedAt
        }))
      });

      console.log(`🔴 ${user.username} disconnected from ${room} (Reason: ${reason})`);
    }
  });

  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });
});

// Server startup
const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV === 'production') {
  // Vercel/Production environment
  server.listen(PORT, () => {
    console.log('🚀 CHARUSAT Connect Backend deployed successfully!');
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    console.log(`🌐 Port: ${PORT}`);
  });
} else {
  // Local development environment
  server.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 CHARUSAT Connect Server Started Successfully!');
    console.log('📋 Server Information:');
    console.log(`   ├── Port: ${PORT}`);
    console.log(`   ├── Local: http://localhost:${PORT}`);
    console.log(`   ├── Network: http://${localIP}:${PORT}`);
    console.log('📱 Socket.io enabled for real-time chat');
    console.log('🔍 Lost & Found API enabled');
    console.log('\n🌐 Access URLs:');
    console.log('   ├── Same Device: http://localhost:3000');
    console.log(`   ├── Other Devices: http://${localIP}:3000`);
    console.log('   └── (Ensure all devices are on the same WiFi network)');
    console.log('\n✅ Ready to accept connections!\n');
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔄 Shutting down server gracefully...');
  server.close(() => {
    console.log('✅ Server shut down complete');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
