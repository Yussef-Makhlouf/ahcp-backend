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
    unique: true, // كل قرية لها holding code واحد فقط
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

// Index to ensure one holding code per village
holdingCodeSchema.index({ village: 1 }, { unique: true });

// Index for better performance
holdingCodeSchema.index({ code: 1 });
holdingCodeSchema.index({ village: 1 });
holdingCodeSchema.index({ isActive: 1 });

// Static method to find holding code by village
holdingCodeSchema.statics.findByVillage = function(village) {
  return this.findOne({ 
    village: village, 
    isActive: true 
  });
};

// Static method to find all holding codes by village
holdingCodeSchema.statics.findByVillage = function(village) {
  return this.find({ village: village, isActive: true })
    .populate('client', 'name nationalId phone village')
    .sort({ code: 1 });
};

// Virtual for village info
holdingCodeSchema.virtual('villageInfo').get(function() {
  return {
    name: this.village,
    code: this.code
  };
});

// Pre-save middleware to ensure village uniqueness
holdingCodeSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('village')) {
    // Check if another holding code exists for the same village
    const existingCode = await this.constructor.findOne({
      village: this.village,
      _id: { $ne: this._id },
      isActive: true
    });
    
    if (existingCode) {
      const error = new Error(`Village '${this.village}' already has a holding code: '${existingCode.code}'`);
      error.code = 'DUPLICATE_VILLAGE_HOLDING_CODE';
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model('HoldingCode', holdingCodeSchema);
