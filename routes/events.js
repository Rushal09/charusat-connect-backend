const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const QRCode = require('qrcode');
const Event = require('../models/Event');
const Club = require('../models/Club');
const auth = require('../middleware/auth');

// Multer configuration for event images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/events/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'event-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get all events with filters
router.get('/', async (req, res) => {
  try {
    const {
      category,
      date,
      upcoming,
      club,
      search,
      page = 1,
      limit = 12
    } = req.query;

    let query = { status: 'published' };

    // Apply filters
    if (category && category !== 'all') {
      query.category = category;
    }

    if (club) {
      query.club = club;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { organizer: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    if (upcoming === 'true') {
      query['dateTime.start'] = { $gte: new Date() };
    }

    if (date) {
      const startOfDay = new Date(date);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query['dateTime.start'] = {
        $gte: startOfDay,
        $lte: endOfDay
      };
    }

    const events = await Event.find(query)
      .populate('createdBy', 'name email profile')
      .populate('club', 'name logo')
      .sort({ 'dateTime.start': 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Event.countDocuments(query);

    res.json({
      success: true,
      events,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Events fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch events' });
  }
});

// Get event categories with counts
router.get('/categories', async (req, res) => {
  try {
    const categories = await Event.aggregate([
      { $match: { status: 'published' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const formattedCategories = categories.map(cat => ({
      name: cat._id,
      count: cat.count,
      displayName: cat._id.charAt(0).toUpperCase() + cat._id.slice(1)
    }));

    res.json({
      success: true,
      categories: formattedCategories
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
});

// Get single event
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('createdBy', 'name email profile')
      .populate('club', 'name logo description')
      .populate('registeredUsers.user', 'name email profile');

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch event' });
  }
});

// Register for event
router.post('/:id/register', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // Check if already registered
    const alreadyRegistered = event.registeredUsers.some(
      registration => registration.user.toString() === req.user.id
    );

    if (alreadyRegistered) {
      return res.status(400).json({ success: false, message: 'Already registered for this event' });
    }

    // Check registration requirements
    if (event.registration.required) {
      if (event.registration.deadline && new Date() > event.registration.deadline) {
        return res.status(400).json({ success: false, message: 'Registration deadline has passed' });
      }

      if (event.registration.maxParticipants && 
          event.registration.currentParticipants >= event.registration.maxParticipants) {
        return res.status(400).json({ success: false, message: 'Event is full' });
      }
    }

    // Generate QR code
    const qrData = {
      eventId: event._id,
      userId: req.user.id,
      registrationId: new Date().getTime()
    };
    const qrCode = await QRCode.toDataURL(JSON.stringify(qrData));

    // Add registration
    event.registeredUsers.push({
      user: req.user.id,
      qrCode: qrCode
    });
    event.registration.currentParticipants += 1;

    await event.save();

    res.json({
      success: true,
      message: 'Successfully registered for event',
      qrCode: qrCode
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// Create new event (admin/club coordinators only)
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const eventData = {
      ...req.body,
      createdBy: req.user.id
    };

    if (req.file) {
      eventData.image = {
        url: `/uploads/events/${req.file.filename}`,
        filename: req.file.filename
      };
    }

    // Parse nested objects
    if (req.body.location) {
      eventData.location = JSON.parse(req.body.location);
    }
    if (req.body.dateTime) {
      eventData.dateTime = JSON.parse(req.body.dateTime);
    }
    if (req.body.registration) {
      eventData.registration = JSON.parse(req.body.registration);
    }
    if (req.body.tags) {
      eventData.tags = JSON.parse(req.body.tags);
    }

    const event = new Event(eventData);
    await event.save();

    // Add to club if specified
    if (eventData.club) {
      await Club.findByIdAndUpdate(
        eventData.club,
        { $push: { events: event._id } }
      );
    }

    const populatedEvent = await Event.findById(event._id)
      .populate('createdBy', 'name email')
      .populate('club', 'name logo');

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      event: populatedEvent
    });
  } catch (error) {
    console.error('Event creation error:', error);
    res.status(500).json({ success: false, message: 'Failed to create event' });
  }
});

module.exports = router;
