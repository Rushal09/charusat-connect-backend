import mongoose from 'mongoose';

const clubSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ['technical', 'cultural', 'sports', 'social', 'hobby', 'academic'],
    default: 'technical'
  },
  description: { type: String, trim: true },
  president: { type: String },
  email: { type: String },
  icon: { type: String },
  membersCount: { type: Number, default: 0 },
  events: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }]
}, { timestamps: true });

export default mongoose.model('Club', clubSchema);
