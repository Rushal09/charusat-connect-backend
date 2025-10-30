// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// --- Google OAuth Client ---
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// --- JWT Generator ---
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'charusat-secret', {
    expiresIn: '7d'
  });
};

// --- TEST ROUTES (for debugging) ---
router.get('/test', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.json({
      message: '✅ Auth service test successful',
      status: 'OK',
      userCount,
      googleClientConfigured: !!process.env.GOOGLE_CLIENT_ID,
      jwtConfigured: !!process.env.JWT_SECRET,
      mongoConfigured: !!process.env.MONGODB_URI,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      message: '❌ Test route failed',
      error: error.message
    });
  }
});

// --- GOOGLE LOGIN ---
router.post('/google-login', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token)
      return res.status(400).json({ message: 'Missing Google token' });

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        message: 'Google OAuth not configured on backend'
      });
    }

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const email = payload.email;

    if (!email.endsWith('@charusat.edu.in')) {
      return res.status(403).json({
        message:
          'Access denied. Please use your CHARUSAT email (@charusat.edu.in)'
      });
    }

    // Find or create user
    let user = await User.findOne({ email });
    if (!user) {
      const username = email.split('@')[0];
      const emailMatch = email.match(/^(\d{2})([a-z]+)(\d+)@charusat\.edu\.in$/i);
      let year = 'Unknown';
      let branch = 'Unknown';

      if (emailMatch) {
        const yearPrefix = emailMatch[1];
        const branchCode = emailMatch[2].toLowerCase();
        const branchMap = {
          dit: 'Information Technology',
          cse: 'Computer Science Engineering',
          ce: 'Computer Engineering',
          it: 'Information Technology',
          ec: 'Electronics & Communication',
          ee: 'Electrical Engineering',
          me: 'Mechanical Engineering',
          civil: 'Civil Engineering',
          ic: 'Instrumentation & Control',
          bca: 'Bachelor of Computer Applications',
          mca: 'Master of Computer Applications'
        };
        year = `20${yearPrefix}`;
        branch = branchMap[branchCode] || branchCode.toUpperCase();
      }

      user = new User({
        username,
        email,
        isGoogleUser: true,
        googleId: payload.sub,
        isVerified: true,
        profile: {
          firstName: payload.given_name || '',
          lastName: payload.family_name || '',
          year,
          branch,
          profilePicture: payload.picture || ''
        }
      });

      await user.save();
      console.log(`✅ New Google user created: ${username}`);
    } else {
      user.googleId = payload.sub;
      user.isGoogleUser = true;
      user.isVerified = true;

      if (payload.picture) {
        user.profile.profilePicture = payload.picture;
      }
      if (payload.given_name) user.profile.firstName = payload.given_name;
      if (payload.family_name) user.profile.lastName = payload.family_name;

      await user.save();
      console.log(`✅ Google user updated: ${user.username}`);
    }

    const jwtToken = generateToken(user._id);

    return res.json({
      message: 'Google login successful',
      token: jwtToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profile: user.profile,
        isGoogleUser: true,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('❌ Google login error:', error.message);
    return res.status(500).json({
      message: 'Google authentication failed. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// --- REGISTER ---
router.post('/register', async (req, res) => {
  try {
    const { email, username, password, year, branch } = req.body;

    if (!email.endsWith('@charusat.edu.in')) {
      return res.status(400).json({
        message: 'Please use your CHARUSAT email address (@charusat.edu.in)'
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        message:
          existingUser.email === email
            ? 'Email already registered'
            : 'Username already taken'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      username,
      password: hashedPassword,
      isGoogleUser: false,
      isVerified: false,
      profile: { year, branch }
    });

    await user.save();
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'Registration successful! Please verify your email.',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profile: user.profile,
        isGoogleUser: false,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    res.status(500).json({
      message: 'Registration failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// --- LOGIN ---
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ message: 'Invalid email or password' });

    if (user.isGoogleUser && !user.password) {
      return res.status(400).json({
        message:
          'This account uses Google sign-in. Please use the "Sign in with Google" button.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch)
      return res.status(401).json({ message: 'Invalid email or password' });

    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profile: user.profile,
        isGoogleUser: user.isGoogleUser,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({
      message: 'Login failed. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// --- GET CURRENT USER ---
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profile: user.profile,
        isGoogleUser: user.isGoogleUser,
        isVerified: user.isVerified,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Get user error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- LOGOUT ---
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    // JWT logout is client-side; no token invalidation server-side.
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('❌ Logout error:', error.message);
    res.status(500).json({ message: 'Logout failed' });
  }
});

// --- HEALTH CHECK ---
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Auth service is running',
    googleOAuth: !!process.env.GOOGLE_CLIENT_ID,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
