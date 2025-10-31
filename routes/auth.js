const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { OAuth2Client } = require('google-auth-library');

const router = express.Router();

// Initialize Google OAuth client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'charusat-secret', { expiresIn: '7d' });
};

// TEST ROUTES - Add these for debugging
router.get('/test', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    
    res.json({
      message: 'Auth service test successful ✅',
      status: 'OK',
      database: 'connected',
      userCount: userCount,
      googleClientId: !!process.env.GOOGLE_CLIENT_ID,
      jwtSecret: !!process.env.JWT_SECRET,
      mongoUri: !!process.env.MONGODB_URI,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('❌ Test route error:', error);
    res.status(500).json({
      message: 'Test failed ❌',
      database: 'connection failed',
      error: error.message
    });
  }
});

router.get('/google-test', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  
  res.json({
    message: 'Google OAuth Configuration Test',
    clientIdConfigured: !!clientId,
    clientIdLength: clientId?.length || 0,
    clientIdPreview: clientId ? `${clientId.substring(0, 20)}...` : 'Not configured',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// POST /api/auth/google-login - Google OAuth login
router.post('/google-login', async (req, res) => {
  try {
    const { token } = req.body;
    
    console.log('🔍 Google login attempt');
    console.log('🔑 Client ID configured:', !!process.env.GOOGLE_CLIENT_ID);
    
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        message: 'Google OAuth not configured on server'
      });
    }
    
    // Verify the Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    console.log('👤 Google user:', payload.email);
    console.log('📧 Email domain check:', payload.email.endsWith('@charusat.edu.in'));
    
    // Check domain restriction
    if (!payload.email.endsWith('@charusat.edu.in')) {
      return res.status(403).json({
        message: 'Access denied. Please use your CHARUSAT email (@charusat.edu.in)'
      });
    }
    
    // Check if user exists
    let user = await User.findOne({ email: payload.email });
    
    if (!user) {
      // Create new user from Google data
      const username = payload.email.split('@')[0]; // Extract username from email
      
      // Extract additional info from email pattern (e.g., 22dit085@charusat.edu.in)
      const emailMatch = payload.email.match(/^(\d{2})([a-z]+)(\d+)@charusat\.edu\.in$/i);
      let year = 'Unknown';
      let branch = 'Unknown';
      
      if (emailMatch) {
        const yearPrefix = emailMatch[1]; // 22
        const branchCode = emailMatch[2].toLowerCase(); // dit
        
        // Convert to full year
        year = `20${yearPrefix}`;
        
        // Map branch codes to full names
        const branchMap = {
          'dit': 'Information Technology',
          'cse': 'Computer Science Engineering',
          'ce': 'Computer Engineering',
          'it': 'Information Technology',
          'ec': 'Electronics & Communication',
          'ee': 'Electrical Engineering',
          'me': 'Mechanical Engineering',
          'civil': 'Civil Engineering',
          'ic': 'Instrumentation & Control',
          'bca': 'Bachelor of Computer Applications',
          'mca': 'Master of Computer Applications'
        };
        
        branch = branchMap[branchCode] || branchCode.toUpperCase();
      }
      
      // Create user without password (Google users don't need it)
      user = new User({
        username: username,
        email: payload.email,
        isGoogleUser: true,
        googleId: payload.sub,
        isVerified: true, // Google users are pre-verified
        profile: {
          firstName: payload.given_name || '',
          lastName: payload.family_name || '',
          year: year,
          branch: branch,
          profilePicture: payload.picture || ''
        }
      });
      
      await user.save();
      console.log('✅ Created new Google user:', username, `(${year} - ${branch})`);
    } else {
      // Update existing user with Google info
      user.googleId = payload.sub;
      user.isGoogleUser = true;
      user.isVerified = true;
      
      // Update profile picture if available
      if (payload.picture && (!user.profile?.profilePicture || user.profile.profilePicture === '')) {
        if (!user.profile) user.profile = {};
        user.profile.profilePicture = payload.picture;
      }
      
      // Update name if not set
      if (payload.given_name && (!user.profile?.firstName || user.profile.firstName === '')) {
        if (!user.profile) user.profile = {};
        user.profile.firstName = payload.given_name;
      }
      
      if (payload.family_name && (!user.profile?.lastName || user.profile.lastName === '')) {
        if (!user.profile) user.profile = {};
        user.profile.lastName = payload.family_name;
      }
      
      await user.save();
      console.log('✅ Updated existing user:', user.username);
    }
    
    // Generate JWT token (use consistent field name)
    const jwtToken = generateToken(user._id);
    
    res.json({
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
    console.error('❌ Google login error:', error);
    
    // Handle specific Google OAuth errors
    if (error.message.includes('Token used too early')) {
      return res.status(400).json({
        message: 'Invalid Google token. Please try signing in again.'
      });
    }
    
    if (error.message.includes('Invalid token signature')) {
      return res.status(400).json({
        message: 'Invalid Google authentication. Please try again.'
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      console.error('❌ Validation errors:', error.errors);
      return res.status(400).json({
        message: 'User validation failed',
        errors: Object.keys(error.errors).map(key => ({
          field: key,
          message: error.errors[key].message
        }))
      });
    }
    
    res.status(500).json({
      message: 'Google authentication failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, username, password, year, branch } = req.body;

    // Validate CHARUSAT email domain
    if (!email.endsWith('@charusat.edu.in')) {
      return res.status(400).json({ 
        message: 'Please use your CHARUSAT email address (@charusat.edu.in)' 
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        message: existingUser.email === email ? 'Email already registered' : 'Username already taken'
      });
    }

    // Create user
    const user = new User({
      email,
      username,
      password,
      profile: { year, branch },
      isGoogleUser: false,
      isVerified: false // Regular users need email verification
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
    console.error('Registration error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: validationErrors 
      });
    }
    
    res.status(500).json({ 
      message: 'Registration failed. Please try again.', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if this is a Google user trying to use password login
    if (user.isGoogleUser) {
      return res.status(400).json({ 
        message: 'This account uses Google sign-in. Please use the "Sign in with Google" button.' 
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate token
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
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Login failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    // Get user with populated profile
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

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
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Logout (optional - mainly clears any server-side sessions if needed)
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    // Since we're using JWT tokens, logout is mainly handled client-side
    // But we can add any server-side cleanup here if needed
    
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Logout failed' });
  }
});

// Health check route
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Auth service is running',
    googleOAuth: !!process.env.GOOGLE_CLIENT_ID,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
