const express = require('express');
// const Message = require('../models/Message'); // Temporarily comment this out

const router = express.Router();

// Get available chat rooms
router.get('/rooms', (req, res) => {
  const rooms = [
    { id: 'general', name: '💬 General Chat', description: 'Open discussion for all students' },
    { id: 'computer-engineering', name: '💻 Computer Engineering', description: 'CE students discussion' },
    { id: 'information-technology', name: '🖥️ Information Technology', description: 'IT students discussion' },
    { id: 'electronics-communication', name: '📡 Electronics & Communication', description: 'ECE students discussion' },
    { id: 'mechanical-engineering', name: '⚙️ Mechanical Engineering', description: 'Mechanical students discussion' },
    { id: 'civil-engineering', name: '🏗️ Civil Engineering', description: 'Civil students discussion' },
    { id: 'chemical-engineering', name: '🧪 Chemical Engineering', description: 'Chemical students discussion' },
    { id: 'study-help', name: '📚 Study Help', description: 'Academic support and study groups' },
    { id: 'events', name: '🎉 College Events', description: 'Campus events and announcements' }
  ];

  res.json({ rooms });
});

// Get message history for a room (temporarily disabled)
router.get('/messages/:room', async (req, res) => {
  try {
    // const { room } = req.params;
    // const messages = await Message.find({ room })
    //   .sort({ timestamp: -1 })
    //   .limit(50)
    //   .lean();

    // messages.reverse();

    // Temporary response
    res.json({ messages: [] });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

// Save a message to database (temporarily disabled)
router.post('/messages', async (req, res) => {
  try {
    // const { content, user, room } = req.body;
    // const message = new Message({
    //   content,
    //   user,
    //   room
    // });
    // await message.save();
    
    // Temporary response
    res.status(201).json({ message: 'Message saved (placeholder)' });
  } catch (error) {
    console.error('Error saving message:', error);
    res.status(500).json({ message: 'Failed to save message' });
  }
});

module.exports = router;
