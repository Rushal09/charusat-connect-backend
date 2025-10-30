const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    maxlength: 1000
  },
  user: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    username: {
      type: String,
      required: true
    },
    displayName: String,
    year: Number,
    branch: String
  },
  room: {
    type: String,
    required: true,
    enum: ['general', 'computer-engineering', 'information-technology', 'electronics-communication', 'mechanical-engineering', 'civil-engineering', 'chemical-engineering', 'study-help', 'events']
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  type: {
    type: String,
    enum: ['user', 'system'],
    default: 'user'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);
