const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: function() {
      // Password is required only for non-Google users
      return !this.isGoogleUser;
    },
    minlength: 6
  },
  
  // Google OAuth fields
  isGoogleUser: {
    type: Boolean,
    default: false
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows multiple null values
  },
  
  // Verification status
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // User profile information
  profile: {
    firstName: {
      type: String,
      trim: true,
      default: ''
    },
    lastName: {
      type: String,
      trim: true,
      default: ''
    },
    year: {
      type: String,
      default: 'Unknown'
    },
    branch: {
      type: String,
      default: 'Unknown'
    },
    profilePicture: {
      type: String,
      default: ''
    }
  }
}, {
  timestamps: true
});

// Index for better performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ googleId: 1 });

// Hash password before saving (only for non-Google users)
userSchema.pre('save', async function(next) {
  // Only hash password if it's modified and user is not a Google user
  if (!this.isModified('password') || this.isGoogleUser) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  // Google users don't have real passwords
  if (this.isGoogleUser) {
    return false;
  }
  
  return await bcrypt.compare(candidatePassword, this.password);
};

// Transform JSON output to remove sensitive data
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.profile?.firstName || ''} ${this.profile?.lastName || ''}`.trim() || this.username;
});

module.exports = mongoose.model('User', userSchema);
