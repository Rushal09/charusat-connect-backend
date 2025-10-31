// import express from 'express';
// import Club from '../models/Club.js';
// const router = express.Router();

// // CREATE CLUB
// router.post('/', async (req, res) => {
//   try {
//     const club = new Club(req.body);
//     await club.save();
//     res.status(201).json({ success: true, club });
//   } catch (e) {
//     res.status(500).json({ success: false, message: e.message });
//   }
// });

// // GET ALL CLUBS
// router.get('/', async (req, res) => {
//   try {
//     const clubs = await Club.find().populate('events');
//     res.json({ success: true, clubs });
//   } catch (e) {
//     res.status(500).json({ success: false, message: e.message });
//   }
// });

// // GET SINGLE CLUB
// router.get('/:id', async (req, res) => {
//   try {
//     const club = await Club.findById(req.params.id).populate('events');
//     res.json({ success: true, club });
//   } catch (e) {
//     res.status(500).json({ success: false, message: e.message });
//   }
// });

// module.exports = router;


