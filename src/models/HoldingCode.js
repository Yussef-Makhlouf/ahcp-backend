const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     HoldingCode:
 *       type: object
 *       required:
 *         - code
 *         - client
 *         - village
 *       properties:
 *         _id:
 *           type: string
 *           description: Holding code ID
 *         code:
 *           type: string
 *           description: The holding code value
 *         client:
 *           type: string
 *           description: Client ID reference
 *         village:
 *           type: string
 *           description: Village name
 *         description:
 *           type: string
 *           description: Optional description for the holding code
 *         isActive:
 *           type: boolean
 *           description: Whether the holding code is active
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

const holdingCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Holding code is required'],
    trim: true,
    maxlength: [50, 'Holding code cannot exceed 50 characters']
  },
  village: {
    type: String,
    required: [true, 'Village is required'],
    trim: true,
    maxlength: [100, 'Village name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
holdingCodeSchema.index({ code: 1 }, { unique: true }); // Ensure code uniqueness
holdingCodeSchema.index({ village: 1 }, { unique: true }); // Ensure village uniqueness - only one holding code per village
holdingCodeSchema.index({ isActive: 1 }); // For active status queries

// Static method to find all holding codes by village
holdingCodeSchema.statics.findByVillage = function(village) {
  return this.find({ village: village, isActive: true })
    .populate('createdBy', 'name email')
    .sort({ code: 1 });
};

// Virtual for village info
holdingCodeSchema.virtual('villageInfo').get(function() {
  return {
    name: this.village,
    code: this.code
  };
});

// Pre-save middleware for validation
holdingCodeSchema.pre('save', async function(next) {
  // Ensure code uniqueness across all holding codes
  if (this.isNew || this.isModified('code')) {
    const existingCode = await this.constructor.findOne({
      code: this.code,
      _id: { $ne: this._id }
    });
    
    if (existingCode) {
      const error = new Error(`Holding code '${this.code}' already exists`);
      error.code = 'DUPLICATE_HOLDING_CODE';
      return next(error);
    }
  }
  
  // Ensure village uniqueness - only one holding code per village
  if (this.isNew || this.isModified('village')) {
    const existingVillage = await this.constructor.findOne({
      village: this.village,
      _id: { $ne: this._id }
    });
    
    if (existingVillage) {
      const error = new Error(`Village '${this.village}' already has a holding code: ${existingVillage.code}`);
      error.code = 'DUPLICATE_VILLAGE_HOLDING_CODE';
      return next(error);
    }
  }
  
  next();
});

module.exports = mongoose.model('HoldingCode', holdingCodeSchema);
