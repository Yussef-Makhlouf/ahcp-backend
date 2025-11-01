const mongoose = require('mongoose');

/**
 * Parasite Control Model - Rebuilt from scratch
 * Handles parasite control activities for livestock
 * 
 * @swagger
 * components:
 *   schemas:
 *     ParasiteControl:
 *       type: object
 *       required:
 *         - serialNo
 *         - date
 *         - client
 *         - supervisor
 *         - vehicleNo
 *         - insecticide
 *         - animalBarnSizeSqM
 *         - herdHealthStatus
 *         - complyingToInstructions
 *         - request
 *       properties:
 *         serialNo:
 *           type: string
 *           description: Unique serial number
 *         date:
 *           type: string
 *           format: date
 *         client:
 *           type: string
 *           description: Client ObjectId reference
 *         supervisor:
 *           type: string
 *         vehicleNo:
 *           type: string
 *         insecticide:
 *           type: object
 *         herdHealthStatus:
 *           type: string
 *           enum: [Healthy, Sick, Sporadic cases]
 *         complyingToInstructions:
 *           type: string
 *           enum: [Comply, Not Comply, Partially Comply]
 */

// Animal count sub-schema
const animalCountSchema = new mongoose.Schema({
  total: {
    type: Number,
    min: 0,
    default: 0
  },
  young: {
    type: Number,
    min: 0,
    default: 0
  },
  female: {
    type: Number,
    min: 0,
    default: 0
  },
  treated: {
    type: Number,
    min: 0,
    default: 0
  }
}, { _id: false });

const insecticideSchema = new mongoose.Schema({
  type: {
    type: String,
    required: [true, 'Insecticide type is required'],
    trim: true,
    maxlength: [200, 'Insecticide type cannot exceed 200 characters'],
    // Common types from real data
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'Insecticide type cannot be empty'
    }
  },
  method: {
    type: String,
    required: [true, 'Application method is required'],
    trim: true,
    maxlength: [100, 'Method cannot exceed 100 characters'],
    enum: {
      values: ['Pour on', 'Spraying', 'Dipping', 'Injection', 'Oral', 'Other'],
      message: 'Method must be one of: Pour on, Spraying, Dipping, Injection, Oral, Other'
    },
    default: 'Pour on'
  },
  volumeMl: {
    type: Number,
    required: [true, 'Volume is required'],
    min: [0, 'Volume cannot be negative'],
    max: [50000, 'Volume cannot exceed 50,000 ml']
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: {
      values: ['Sprayed', 'Not Sprayed', 'Partially Sprayed'],
      message: 'Status must be one of: Sprayed, Not Sprayed, Partially Sprayed'
    },
    default: 'Not Sprayed'
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    maxlength: [100, 'Category cannot exceed 100 characters'],
    // Will accept any category from the data
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'Category cannot be empty'
    }
  },
  // Additional fields for better tracking
  concentration: {
    type: String,
    trim: true,
    maxlength: [50, 'Concentration cannot exceed 50 characters']
  },
  manufacturer: {
    type: String,
    trim: true,
    maxlength: [100, 'Manufacturer cannot exceed 100 characters']
  }
}, { _id: false });

const requestSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, 'Request date is required']
  },
  situation: {
    type: String,
    required: [true, 'Request situation is required'],
    enum: {
      values: ['Ongoing', 'Closed'],
      message: 'Situation must be one of: Ongoing, Closed'
    }
  },
  fulfillingDate: {
    type: Date,
    validate: {
      validator: function(date) {
        return !date || date >= this.date;
      },
      message: 'Fulfilling date cannot be before request date'
    }
  }
}, { _id: false });

const parasiteControlSchema = new mongoose.Schema({
  serialNo: {
    type: String,
    required: [true, 'Serial number is required'],
    unique: true,
    trim: true,
    maxlength: [20, 'Serial number cannot exceed 20 characters']
  },
  date: {
    type: Date,
    required: [true, 'Date is required']
  },
  holdingCode: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HoldingCode'
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    populate: {
      path: 'client',
      select: 'name nationalId phone village birthDate'
    },
    required: [true, 'Client reference is required']
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
  supervisor: {
    type: String,
    required: [true, 'Supervisor is required'],
    trim: true,
    maxlength: [100, 'Supervisor name cannot exceed 100 characters']
  },
  vehicleNo: {
    type: String,
    required: [true, 'Vehicle number is required'],
    trim: true,
    maxlength: [20, 'Vehicle number cannot exceed 20 characters']
  },
  herdCounts: {
    sheep: animalCountSchema,
    goats: animalCountSchema,
    camel: animalCountSchema,
    cattle: animalCountSchema,
    horse: animalCountSchema
  },
  insecticide: {
    type: insecticideSchema,
    required: [true, 'Insecticide information is required']
  },
  animalBarnSizeSqM: {
    type: Number,
    required: [true, 'Animal barn size is required'],
    min: [0, 'Barn size cannot be negative']
  },
  breedingSites: {
    type: String,
    trim: true,
    maxlength: [500, 'Breeding sites description cannot exceed 500 characters']
  },
  herdHealthStatus: {
    type: String,
    required: [true, 'Herd health status is required'],
    enum: {
      values: ['Healthy', 'Sick', 'Sporadic cases'],
      message: 'Health status must be one of: Healthy, Sick, Sporadic cases'
    }
  },
  complyingToInstructions: {
    type: String,
    enum: ['Comply', 'Not Comply', 'Partially Comply'],
    required: [true, 'Compliance status is required'],
    default: 'Comply'
  },
  request: {
    type: requestSchema,
    required: [true, 'Request information is required']
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: [1000, 'Remarks cannot exceed 1000 characters']
  },
  // Additional fields for comprehensive data tracking
  totalHerdCount: {
    type: Number,
    min: [0, 'Total herd count cannot be negative'],
    default: 0
  },
  totalYoung: {
    type: Number,
    min: [0, 'Total young count cannot be negative'],
    default: 0
  },
  totalFemale: {
    type: Number,
    min: [0, 'Total female count cannot be negative'],
    default: 0
  },
  totalTreated: {
    type: Number,
    min: [0, 'Total treated count cannot be negative'],
    default: 0
  },
  // Activity tracking
  activityType: {
    type: String,
    default: 'Parasite Control Activity',
    trim: true,
    maxlength: [100, 'Activity type cannot exceed 100 characters']
  },
  // Import metadata
  importSource: {
    type: String,
    enum: ['manual', 'excel', 'csv', 'api'],
    default: 'manual'
  },
  importDate: {
    type: Date,
    default: Date.now
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
parasiteControlSchema.index({ serialNo: 1 });
parasiteControlSchema.index({ date: -1 });
parasiteControlSchema.index({ client: 1 });
parasiteControlSchema.index({ supervisor: 1 });
parasiteControlSchema.index({ 'request.situation': 1 });
parasiteControlSchema.index({ herdHealthStatus: 1 });
parasiteControlSchema.index({ 'coordinates.latitude': 1, 'coordinates.longitude': 1 });

// Pre-save middleware to calculate totals from herd counts
parasiteControlSchema.pre('save', function(next) {
  if (this.herdCounts) {
    // Calculate and store totals for better query performance
    const counts = this.herdCounts;
    
    this.totalHerdCount = (counts.sheep?.total || 0) + 
                         (counts.goats?.total || 0) + 
                         (counts.camel?.total || 0) + 
                         (counts.cattle?.total || 0) + 
                         (counts.horse?.total || 0);
    
    this.totalYoung = (counts.sheep?.young || 0) + 
                     (counts.goats?.young || 0) + 
                     (counts.camel?.young || 0) + 
                     (counts.cattle?.young || 0) + 
                     (counts.horse?.young || 0);
    
    this.totalFemale = (counts.sheep?.female || 0) + 
                      (counts.goats?.female || 0) + 
                      (counts.camel?.female || 0) + 
                      (counts.cattle?.female || 0) + 
                      (counts.horse?.female || 0);
    
    this.totalTreated = (counts.sheep?.treated || 0) + 
                       (counts.goats?.treated || 0) + 
                       (counts.camel?.treated || 0) + 
                       (counts.cattle?.treated || 0) + 
                       (counts.horse?.treated || 0);
  }
  next();
});

// Virtual for treatment efficiency percentage (only this one as virtual)
parasiteControlSchema.virtual('treatmentEfficiency').get(function() {
  const total = this.totalHerdCount || 0;
  const treated = this.totalTreated || 0;
  return total > 0 ? Math.round((treated / total) * 100) : 0;
}); 

// Static method to find records by date range
parasiteControlSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).populate('client', 'name nationalId phone village');
};

// Static method to find records by supervisor
parasiteControlSchema.statics.findBySupervisor = function(supervisor) {
  return this.find({ supervisor }).populate('client', 'name nationalId phone village');
};

// Static method to get statistics
parasiteControlSchema.statics.getStatistics = async function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: null,
        totalRecords: { $sum: 1 },
        totalAnimals: { 
          $sum: { 
            $add: [
              '$herdCounts.sheep.total',
              '$herdCounts.goats.total',
              '$herdCounts.camel.total',
              '$herdCounts.cattle.total',
              '$herdCounts.horse.total'
            ]
          }
        },
        totalTreated: { 
          $sum: { 
            $add: [
              '$herdCounts.sheep.treated',
              '$herdCounts.goats.treated',
              '$herdCounts.camel.treated',
              '$herdCounts.cattle.treated',
              '$herdCounts.horse.treated'
            ]
          }
        },
        healthyHerds: {
          $sum: { $cond: [{ $eq: ['$herdHealthStatus', 'Healthy'] }, 1, 0] }
        },
        sickHerds: {
          $sum: { $cond: [{ $eq: ['$herdHealthStatus', 'Sick'] }, 1, 0] }
        },
        underTreatmentHerds: {
          $sum: { $cond: [{ $eq: ['$herdHealthStatus', 'Under Treatment'] }, 1, 0] }
        }
      }
    }
  ];
  
  const result = await this.aggregate(pipeline);
  return result[0] || {
    totalRecords: 0,
    totalAnimals: 0,
    totalTreated: 0,
    healthyHerds: 0,
    sickHerds: 0,
    underTreatmentHerds: 0
  };
};

// Pre-save middleware to update updatedBy
parasiteControlSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedBy = this.constructor.currentUser;
  }
  next();
});

// Pre-save validation for herd counts
parasiteControlSchema.pre('save', function(next) {
  const herdTypes = ['sheep', 'goats', 'camel', 'cattle', 'horse'];
  
  for (const type of herdTypes) {
    const herd = this.herdCounts[type];
    if (herd) {
      if (herd.young > herd.total) {
        return next(new Error(`Young ${type} count cannot exceed total count`));
      }
      if (herd.female > herd.total) {
        return next(new Error(`Female ${type} count cannot exceed total count`));
      }
      if (herd.treated > herd.total) {
        return next(new Error(`Treated ${type} count cannot exceed total count`));
      }
    }
  }
  next();
});

module.exports = mongoose.model('ParasiteControl', parasiteControlSchema);
