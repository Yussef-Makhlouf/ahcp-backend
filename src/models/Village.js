const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     Village:
 *       type: object
 *       required:
 *         - name
 *         - code
 *       properties:
 *         _id:
 *           type: string
 *           description: Auto-generated MongoDB ObjectId
 *         name:
 *           type: string
 *           description: Village name in Arabic
 *           maxLength: 100
 *         nameEn:
 *           type: string
 *           description: Village name in English
 *           maxLength: 100
 *         code:
 *           type: string
 *           description: Unique village code
 *           maxLength: 20
 *         region:
 *           type: string
 *           description: Region or governorate
 *           maxLength: 100
 *         description:
 *           type: string
 *           description: Village description
 *           maxLength: 500
 *         coordinates:
 *           type: object
 *           properties:
 *             latitude:
 *               type: number
 *               description: Latitude coordinate
 *             longitude:
 *               type: number
 *               description: Longitude coordinate
 *         population:
 *           type: number
 *           description: Estimated population
 *         isActive:
 *           type: boolean
 *           description: Whether the village is active
 *           default: true
 *         createdBy:
 *           type: string
 *           description: User who created the village
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 */

const villageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Village name is required'],
    trim: true,
    maxlength: [100, 'Village name cannot exceed 100 characters']
  },
  nameEn: {
    type: String,
    trim: true,
    maxlength: [100, 'English name cannot exceed 100 characters']
  },
  code: {
    type: String,
    required: [true, 'Village code is required'],
    unique: true,
    trim: true,
    uppercase: true,
    maxlength: [20, 'Village code cannot exceed 20 characters'],
    match: [/^[A-Z0-9_-]+$/, 'Village code can only contain uppercase letters, numbers, hyphens, and underscores']
  },
  region: {
    type: String,
    trim: true,
    maxlength: [100, 'Region name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  coordinates: {
    latitude: {
      type: Number,
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90']
    },
    longitude: {
      type: Number,
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180']
    }
  },
  population: {
    type: Number,
    min: [0, 'Population cannot be negative']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
villageSchema.index({ name: 1 });
villageSchema.index({ code: 1 });
villageSchema.index({ region: 1 });
villageSchema.index({ isActive: 1 });
villageSchema.index({ 'coordinates.latitude': 1, 'coordinates.longitude': 1 });

// Virtual for client count
villageSchema.virtual('clientCount', {
  ref: 'Client',
  localField: 'name',
  foreignField: 'village',
  count: true
});

// Static method to find active villages
villageSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ name: 1 });
};

// Static method to find villages by region
villageSchema.statics.findByRegion = function(region) {
  return this.find({ region, isActive: true }).sort({ name: 1 });
};

// Instance method to toggle active status
villageSchema.methods.toggleStatus = function() {
  this.isActive = !this.isActive;
  return this.save();
};

// Pre-save middleware to ensure code is uppercase
villageSchema.pre('save', function(next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});

const Village = mongoose.model('Village', villageSchema);

module.exports = Village;
