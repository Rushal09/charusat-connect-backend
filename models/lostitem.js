const mongoose = require('mongoose');

const lostFoundItemSchema = new mongoose.Schema({
  // User who created the item (required)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Basic item info
  type: {
    type: String,
    required: true,
    enum: ['lost', 'found'],
    lowercase: true
  },
  
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 100
  },
  
  category: {
    type: String,
    required: true,
    enum: ['ID Card', 'Electronics', 'Books', 'Clothing', 'Accessories', 'Keys', 'Wallet', 'Documents', 'Other']
  },
  
  description: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 1000
  },
  
  location: {
    type: String,
    required: true,
    trim: true
  },
  
  date: {
    type: Date,
    required: true
  },
  
  // Contact information (required fields)
  contactName: {
    type: String,
    required: true,
    trim: true
  },
  
  contactEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  
  phone: {
    type: String,
    trim: true
  },
  
  // Images
  images: [{
    filename: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Status - fix enum values
  status: {
    type: String,
    enum: ['open', 'claimed', 'resolved'], // Added 'open' as valid value
    default: 'open'
  },
  
  // Claims system
  claims: [{
    claimantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    claimantName: String,
    claimantEmail: String,
    message: String,
    proofDescription: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Resolution info
  resolvedWith: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: Date,
    note: String
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Add indexes for better performance
lostFoundItemSchema.index({ type: 1, status: 1 });
lostFoundItemSchema.index({ category: 1 });
lostFoundItemSchema.index({ createdAt: -1 });

module.exports = mongoose.model('LostFoundItem', lostFoundItemSchema);
