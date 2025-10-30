import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, trim: true },
  category: {
    type: String,
    enum: ['workshop', 'fest', 'seminar', 'competition', 'sports', 'cultural', 'club', 'other'],
    default: 'other'
  },
  organizer: { type: String },
  banner: { type: String },
  date: { type: Date, required: true },
  time: { type: String },
  location: { type: String },
  registrationFee: { type: Number, default: 0 },
  registrationLink: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('Event', eventSchema);
