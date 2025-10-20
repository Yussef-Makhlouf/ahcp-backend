const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     DropdownList:
 *       type: object
 *       required:
 *         - category
 *         - value
 *         - label
 *         - labelAr
 *       properties:
 *         _id:
 *           type: string
 *           description: Unique identifier
 *         category:
 *           type: string
 *           enum: [vaccine_types, herd_health, animals_handling, labours, reachable_location, request_situation, insecticide_types, spray_methods, insecticide_categories, spray_status, herd_health_status, compliance, breeding_sites, intervention_categories, horse_gender, health_status, administration_routes, sample_types, test_types, animal_types, priority_levels, task_status, reminder_times, recurring_types, time_periods, user_roles]
 *           description: Category of the dropdown list
 *         value:
 *           type: string
 *           description: The actual value used in the system
 *         label:
 *           type: string
 *           description: Display label in English
 *         labelAr:
 *           type: string
 *           description: Display label in Arabic
 *         isActive:
 *           type: boolean
 *           default: true
 *           description: Whether the option is active and available for selection
 *         createdBy:
 *           type: string
 *           description: User who created this option
 *         updatedBy:
 *           type: string
 *           description: User who last updated this option
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

const dropdownListSchema = new mongoose.Schema({
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: {
      values: [
        // Vaccination categories
        'vaccine_types',
        'herd_health',
        'animals_handling',
        'labours',
        'reachable_location',
        'request_situation',
        
        // Parasite Control categories
        'insecticide_types',
        'spray_methods',
        'insecticide_categories',
        'spray_status',
        'herd_health_status',
        'compliance',
        'breeding_sites',
        
        // Equine Health categories
        'intervention_categories',
        'horse_gender',
        'health_status',
        'administration_routes',
        
        // Laboratory categories
        'sample_types',
        'test_types',
        'animal_types',
        
        // Scheduling categories
        'priority_levels',
        'task_status',
        'reminder_times',
        'recurring_types',
        
        // Reports categories
        'time_periods',
        
        // User Management categories
        'user_roles'
      ],
      message: 'Invalid category'
    },
    index: true
  },
  
  value: {
    type: String,
    required: [true, 'Value is required'],
    trim: true
  },
  
  label: {
    type: String,
    required: [true, 'Label is required'],
    trim: true
  },
  
  labelAr: {
    type: String,
    required: [true, 'Arabic label is required'],
    trim: true
  },
  
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by is required']
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

// Compound index for category and value uniqueness
dropdownListSchema.index({ category: 1, value: 1 }, { unique: true });

// Index for sorting
dropdownListSchema.index({ category: 1, createdAt: 1 });

// Static method to get options by category
dropdownListSchema.statics.getByCategory = function(category, includeInactive = false) {
  const filter = { category };
  
  // Only include active items by default
  if (!includeInactive) {
    filter.isActive = true;
  }
  
  return this.find(filter)
    .sort({ createdAt: 1 })
    .select('value label labelAr isActive')
    .lean();
};

// Static method to get all categories
dropdownListSchema.statics.getCategories = function() {
  return this.distinct('category');
};

// Static method to get category statistics
dropdownListSchema.statics.getCategoryStats = function(category) {
  return this.aggregate([
    { $match: { category } },
    {
      $group: {
        _id: '$category',
        total: { $sum: 1 }
      }
    }
  ]);
};

// Pre-save middleware
dropdownListSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedBy = this.constructor._currentUser;
  }
  next();
});

// Pre-validate middleware to check for duplicates
dropdownListSchema.pre('validate', async function(next) {
  if (this.isNew || this.isModified('category') || this.isModified('value')) {
    const existing = await this.constructor.findOne({
      category: this.category,
      value: this.value,
      _id: { $ne: this._id }
    });
    
    if (existing) {
      const error = new Error(`Value '${this.value}' already exists in category '${this.category}'`);
      error.code = 'DUPLICATE_VALUE';
      return next(error);
    }
  }
  next();
});

// Virtual for display name
dropdownListSchema.virtual('displayName').get(function() {
  return this.labelAr || this.label;
});

// Method to check if option is used in any records
dropdownListSchema.methods.isUsedInRecords = async function() {
  const models = ['Vaccination', 'ParasiteControl', 'Laboratory', 'MobileClinic', 'EquineHealth'];
  
  for (const modelName of models) {
    try {
      const Model = mongoose.model(modelName);
      const count = await Model.countDocuments({
        $or: [
          { [this.category]: this.value },
          { [`${this.category}.value`]: this.value }
        ]
      });
      
      if (count > 0) {
        return { used: true, model: modelName, count };
      }
    } catch (error) {
      // Model might not exist, continue
      continue;
    }
  }
  
  return { used: false, model: null, count: 0 };
};

const DropdownList = mongoose.model('DropdownList', dropdownListSchema);

module.exports = DropdownList;
