const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const auth = require('../middleware/auth');
const LostItem = require('../models/lostitem');

const router = express.Router();

// Create uploads directory
const IMAGES_DIR = path.join(__dirname, '..', 'uploads', 'lostfound');
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Multer setup for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${req.user?.id || 'user'}_${Date.now()}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|webp|gif/.test(file.mimetype.toLowerCase());
    ok ? cb(null, true) : cb(new Error('Only image files allowed'));
  }
});

// GET /lostfound - List items (NO AUTH REQUIRED for viewing)
router.get('/', async (req, res) => {
  try {
    const { 
      type, 
      category, 
      status = 'open', 
      q, 
      page = 1, 
      limit = 20 
    } = req.query;
    
    // Build filter
    const filter = {};
    if (type && type !== 'all') filter.type = type;
    if (category && category !== 'all') filter.category = category;
    if (status && status !== 'all') filter.status = status;
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { location: { $regex: q, $options: 'i' } }
      ];
    }
    
    console.log('🔍 Searching with filter:', filter);
    
    const items = await LostItem.find(filter)
      .sort({ createdAt: -1 })
      .populate('user', 'username email')
      .lean(); // Use lean() for better performance
    
    console.log(`📋 Found ${items.length} items in database`);
    
    // Log first item for debugging
    if (items.length > 0) {
      console.log('📝 Sample item:', JSON.stringify(items[0], null, 2));
    }
    
    res.json(items);
    
  } catch (error) {
    console.error('❌ Fetch items error:', error);
    res.status(500).json({ message: 'Failed to fetch items', error: error.message });
  }
});


// POST /lostfound - Create new item (AUTH REQUIRED)
router.post('/', auth, upload.array('images', 5), async (req, res) => {
  try {
    const { 
      type, 
      title, 
      description, 
      category, 
      location, 
      date, 
      contactName, 
      contactEmail, 
      phone 
    } = req.body;
    
    console.log('📝 Creating item with data:', req.body);
    console.log('📷 Files received:', req.files?.map(f => f.filename));
    console.log('🔑 User:', req.user);
    
    // Validate required fields
    const missing = [];
    if (!type) missing.push('type');
    if (!title || !title.trim()) missing.push('title');
    if (!category) missing.push('category');
    if (!description || !description.trim()) missing.push('description');
    if (!location || !location.trim()) missing.push('location');
    if (!date) missing.push('date');
    if (!contactName || !contactName.trim()) missing.push('contactName');
    if (!contactEmail || !contactEmail.trim()) missing.push('contactEmail');
    
    if (missing.length > 0) {
      console.log('❌ Missing fields:', missing);
      return res.status(400).json({ 
        message: `Missing required fields: ${missing.join(', ')}`,
        missingFields: missing
      });
    }

    // Validate field lengths
    if (title.trim().length < 3) {
      return res.status(400).json({ message: 'Title must be at least 3 characters long' });
    }

    if (description.trim().length < 10) {
      return res.status(400).json({ message: 'Description must be at least 10 characters long' });
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactEmail.trim())) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    // Process images
    const images = (req.files || []).map(f => ({
      filename: f.filename,
      url: `/uploads/lostfound/${f.filename}`,
      uploadedAt: new Date()
    }));

    // Create item with DIRECT FIELDS matching the model
    const itemData = {
      user: req.user.id, // Use 'user' field (not 'owner')
      type: type.toLowerCase(),
      title: title.trim(),
      description: description.trim(),
      category,
      location: location.trim(),
      date: new Date(date),
      contactName: contactName.trim(), // Direct field
      contactEmail: contactEmail.trim(), // Direct field
      phone: phone ? phone.trim() : '',
      images,
      status: 'open',
      claims: []
    };

    console.log('💾 Creating item with structure:', itemData);

    const item = await LostItem.create(itemData);
    await item.populate('user', 'username');

    console.log('✅ Created item:', item._id);
    res.status(201).json(item);
    
  } catch (error) {
    console.error('❌ Create item error:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        fs.unlink(file.path, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: validationErrors 
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to create item', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// GET /lostfound/:id - Get single item
router.get('/:id', async (req, res) => {
  try {
    const item = await LostItem.findById(req.params.id)
      .populate('user', 'username email')
      .populate('claims.claimantId', 'username email');
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    console.log(`📋 Fetched single item: ${req.params.id}`);
    res.json(item);
    
  } catch (error) {
    console.error('❌ Get item error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /lostfound/:id/claim - Claim an item
router.post('/:id/claim', auth, async (req, res) => {
  try {
    const { message, proofDescription } = req.body;
    const itemId = req.params.id;
    
    console.log(`🔍 User ${req.user.id} attempting to claim item ${itemId}`);
    
    const item = await LostItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    // Check if user is trying to claim their own item
    if (item.user.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot claim your own item' });
    }
    
    // Check if item is already resolved
    if (item.status === 'resolved') {
      return res.status(400).json({ message: 'This item has already been resolved' });
    }
    
    // Check if already claimed by this user
    const existingClaim = item.claims.find(
      claim => claim.claimantId && claim.claimantId.toString() === req.user.id
    );
    
    if (existingClaim) {
      return res.status(400).json({ message: 'You have already claimed this item' });
    }
    
    // Get user info
    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    
    // Add claim
    item.claims.push({
      claimantId: req.user.id,
      claimantName: user.username,
      claimantEmail: user.email,
      message: message || '',
      proofDescription: proofDescription || '',
      status: 'pending'
    });
    
    // Update item status if first claim
    if (item.status === 'open') {
      item.status = 'claimed';
    }
    
    await item.save();
    await item.populate([
      { path: 'user', select: 'username' },
      { path: 'claims.claimantId', select: 'username' }
    ]);
    
    console.log(`✅ Claim submitted for item ${itemId} by user ${req.user.id}`);
    res.json({ 
      message: 'Claim submitted successfully! The item owner will be notified.',
      item 
    });
    
  } catch (error) {
    console.error('❌ Error claiming item:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /lostfound/my-items - Get current user's items
router.get('/my/items', auth, async (req, res) => {
  try {
    const items = await LostItem.find({ user: req.user.id })
      .populate('claims.claimantId', 'username email')
      .sort({ createdAt: -1 });
    
    console.log(`📋 Fetched ${items.length} items for user ${req.user.id}`);
    res.json(items);
  } catch (error) {
    console.error('❌ Error fetching user items:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /lostfound/my-claims - Get items current user has claimed
router.get('/my/claims', auth, async (req, res) => {
  try {
    const items = await LostItem.find({
      'claims.claimantId': req.user.id
    }).populate('user', 'username email');
    
    // Filter to only show relevant claim data
    const myClaimsData = items.map(item => {
      const myClaim = item.claims.find(
        claim => claim.claimantId && claim.claimantId.toString() === req.user.id
      );
      
      return {
        ...item.toObject(),
        myClaim: myClaim
      };
    });
    
    console.log(`📋 Fetched ${myClaimsData.length} claimed items for user ${req.user.id}`);
    res.json(myClaimsData);
  } catch (error) {
    console.error('❌ Error fetching user claims:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  console.error('❌ Multer error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Maximum size is 5MB per file.' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Too many files. Maximum is 5 files.' });
    }
  }
  
  if (error.message === 'Only image files allowed') {
    return res.status(400).json({ message: 'Only image files are allowed.' });
  }
  
  next(error);
});

module.exports = router;
