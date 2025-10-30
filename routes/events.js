import express from 'express';
import Event from '../models/Event.js';
const router = express.Router();

// CREATE EVENT
router.post('/', async (req, res) => {
  try {
    const event = new Event(req.body);
    const saved = await event.save();
    res.status(201).json({ success: true, event: saved });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET ALL EVENTS
router.get('/', async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    res.json({ success: true, events });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET SINGLE EVENT
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    res.json({ success: true, event });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// UPDATE EVENT
router.put('/:id', async (req, res) => {
  try {
    const updated = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, event: updated });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// DELETE EVENT
router.delete('/:id', async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Event deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
