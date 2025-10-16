const mongoose = require('mongoose');

const villageSchema = new mongoose.Schema({
  serialNumber: {
    type: String,
    required: [true, 'الرقم التسلسلي مطلوب'],
    unique: true,
    trim: true,
    minlength: [1, 'الرقم التسلسلي يجب أن يكون حرف واحد على الأقل'],
    maxlength: [50, 'الرقم التسلسلي لا يمكن أن يتجاوز 50 حرف']
  },
  sector: {
    type: String,
    required: [true, 'القطاع مطلوب'],
    trim: true,
    minlength: [2, 'القطاع يجب أن يكون أكثر من حرفين'],
    maxlength: [100, 'القطاع لا يمكن أن يتجاوز 100 حرف']
  },
  nameArabic: {
    type: String,
    required: [true, 'الاسم العربي للقرية مطلوب'],
    trim: true,
    minlength: [2, 'الاسم العربي يجب أن يكون أكثر من حرفين'],
    maxlength: [100, 'الاسم العربي لا يمكن أن يتجاوز 100 حرف']
  },
  nameEnglish: {
    type: String,
    required: [true, 'الاسم الإنجليزي للقرية مطلوب'],
    trim: true,
    minlength: [2, 'الاسم الإنجليزي يجب أن يكون أكثر من حرفين'],
    maxlength: [100, 'الاسم الإنجليزي لا يمكن أن يتجاوز 100 حرف']
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
villageSchema.index({ serialNumber: 1 });
villageSchema.index({ nameArabic: 1 });
villageSchema.index({ nameEnglish: 1 });
villageSchema.index({ sector: 1 });

// Virtual for full name
villageSchema.virtual('fullName').get(function() {
  return `${this.nameArabic} (${this.nameEnglish})`;
});

// Pre-save middleware to ensure data consistency
villageSchema.pre('save', function(next) {
  // Ensure serialNumber is uppercase
  if (this.serialNumber) {
    this.serialNumber = this.serialNumber.toUpperCase();
  }
  
  next();
});

// Static method to find villages by sector
villageSchema.statics.findBySector = function(sector) {
  return this.find({ sector }).sort({ nameArabic: 1 });
};

// Static method to search villages
villageSchema.statics.searchVillages = function(query) {
  const searchRegex = new RegExp(query, 'i');
  return this.find({
    $or: [
      { nameArabic: searchRegex },
      { nameEnglish: searchRegex },
      { sector: searchRegex },
      { serialNumber: searchRegex }
    ]
  }).sort({ nameArabic: 1 });
};

// Instance method to get statistics
villageSchema.methods.getStats = function() {
  return {
    name: this.nameArabic,
    sector: this.sector,
    serialNumber: this.serialNumber
  };
};

module.exports = mongoose.model('Village', villageSchema);