const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     Section:
 *       type: object
 *       required:
 *         - name
 *         - code
 *       properties:
 *         _id:
 *           type: string
 *           description: Section ID
 *         name:
 *           type: string
 *           description: Section name in Arabic
 *         nameEn:
 *           type: string
 *           description: Section name in English
 *         code:
 *           type: string
 *           description: Unique section code
 *         description:
 *           type: string
 *           description: Section description
 *         isActive:
 *           type: boolean
 *           description: Section status
 *         supervisorCount:
 *           type: number
 *           description: Number of supervisors in this section
 *         workerCount:
 *           type: number
 *           description: Number of workers in this section
 *         createdBy:
 *           type: string
 *           description: ID of user who created this section
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

const sectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'اسم القسم مطلوب'],
    trim: true,
    minlength: [2, 'اسم القسم يجب أن يكون على الأقل حرفين'],
    maxlength: [100, 'اسم القسم لا يمكن أن يتجاوز 100 حرف']
  },
  nameEn: {
    type: String,
    trim: true,
    maxlength: [100, 'English name cannot exceed 100 characters']
  },
  code: {
    type: String,
    required: [true, 'رمز القسم مطلوب'],
    unique: true,
    trim: true,
    uppercase: true,
    minlength: [2, 'رمز القسم يجب أن يكون على الأقل حرفين'],
    maxlength: [10, 'رمز القسم لا يمكن أن يتجاوز 10 أحرف'],
    match: [/^[A-Z0-9]+$/, 'رمز القسم يجب أن يحتوي على أحرف إنجليزية كبيرة وأرقام فقط']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'الوصف لا يمكن أن يتجاوز 500 حرف']
  },
  // isActive field removed - all sections are active by default
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
sectionSchema.index({ code: 1 });
sectionSchema.index({ name: 1 });
// isActive index removed
sectionSchema.index({ createdBy: 1 });

// Virtual for supervisor count
sectionSchema.virtual('supervisorCount', {
  ref: 'User',
  localField: 'code',
  foreignField: 'section',
  count: true,
  match: { role: 'section_supervisor' }
});

// Virtual for worker count
sectionSchema.virtual('workerCount', {
  ref: 'User',
  localField: 'code',
  foreignField: 'section',
  count: true,
  match: { role: 'field_worker' }
});

// Virtual for total user count
sectionSchema.virtual('totalUsers', {
  ref: 'User',
  localField: 'code',
  foreignField: 'section',
  count: true,
  match: {}
});

// Static method to find all sections (all are active)
sectionSchema.statics.findActive = function() {
  return this.find({}).sort({ name: 1 });
};

// Static method to find section by code
sectionSchema.statics.findByCode = function(code) {
  return this.findOne({ code: code.toUpperCase() });
};

// Pre-save middleware to ensure code is uppercase
sectionSchema.pre('save', function(next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});

// Pre-update middleware to ensure code is uppercase
sectionSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  const update = this.getUpdate();
  if (update.code) {
    update.code = update.code.toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Section', sectionSchema);
