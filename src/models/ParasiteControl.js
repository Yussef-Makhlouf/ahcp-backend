const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     HerdCount:
 *       type: object
 *       properties:
 *         total:
 *           type: number
 *           description: Total number of animals
 *         young:
 *           type: number
 *           description: Number of young animals
 *         female:
 *           type: number
 *           description: Number of female animals
 *         treated:
 *           type: number
 *           description: Number of treated animals
 *     
 *     ParasiteControl:
 *       type: object
 *       required:
 *         - serialNo
 *         - date
 *         - client
 *         - supervisor
 *         - vehicleNo
 *       properties:
 *         _id:
 *           type: string
 *           description: Record ID
 *         serialNo:
 *           type: string
 *           description: Serial number for the record
 *         date:
 *           type: string
 *           format: date
 *           description: Date of parasite control operation
 *         client:
 *           type: string
 *           description: Client ID reference
 *         coordinates:
 *           type: object
 *           properties:
 *             latitude:
 *               type: number
 *             longitude:
 *               type: number
 *         supervisor:
 *           type: string
 *           description: Supervisor name
 *         vehicleNo:
 *           type: string
 *           description: Vehicle number used
 *         herdCounts:
 *           type: object
 *           properties:
 *             sheep:
 *               $ref: '#/components/schemas/HerdCount'
 *             goats:
 *               $ref: '#/components/schemas/HerdCount'
 *             camel:
 *               $ref: '#/components/schemas/HerdCount'
 *             cattle:
 *               $ref: '#/components/schemas/HerdCount'
 *             horse:
 *               $ref: '#/components/schemas/HerdCount'
 *         insecticide:
 *           type: object
 *           properties:
 *             type:
 *               type: string
 *             method:
 *               type: string
 *             volumeMl:
 *               type: number
 *             status:
 *               type: string
 *               enum: [Sprayed, Not Sprayed]
 *             category:
 *               type: string
 *         animalBarnSizeSqM:
 *           type: number
 *           description: Animal barn size in square meters
 *         breedingSites:
 *           type: string
 *           description: Description of breeding sites
 *         herdHealthStatus:
 *           type: string
 *           enum: [Healthy, Sick, Sporadic cases]
 *         complyingToInstructions:
 *           type: string
 *           enum: [Comply, Not Comply, Partially Comply]
 *         request:
 *           type: object
 *           properties:
 *             date:
 *               type: string
 *               format: date
 *             situation:
 *               type: string
 *               enum: [Open, Closed, Pending]
 *             fulfillingDate:
 *               type: string
 *               format: date
 *         remarks:
 *           type: string
 *           description: Additional remarks
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

const herdCountSchema = new mongoose.Schema({
  total: {
    type: Number,
    required: true,
    min: [0, 'Total count cannot be negative'],
    default: 0
  },
  young: {
    type: Number,
    required: true,
    min: [0, 'Young count cannot be negative'],
    default: 0
  },
  female: {
    type: Number,
    required: true,
    min: [0, 'Female count cannot be negative'],
    default: 0
  },
  treated: {
    type: Number,
    required: true,
    min: [0, 'Treated count cannot be negative'],
    default: 0
  }
}, { _id: false });

const insecticideSchema = new mongoose.Schema({
  type: {
    type: String,
    required: [true, 'Insecticide type is required'],
    trim: true,
    maxlength: [100, 'Insecticide type cannot exceed 100 characters']
  },
  method: {
    type: String,
    required: [true, 'Application method is required'],
    trim: true,
    maxlength: [100, 'Method cannot exceed 100 characters']
  },
  volumeMl: {
    type: Number,
    required: [true, 'Volume is required'],
    min: [0, 'Volume cannot be negative']
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: {
      values: ['Sprayed', 'Not Sprayed'],
      message: 'Status must be either Sprayed or Not Sprayed'
    }
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters']
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
    sheep: herdCountSchema,
    goats: herdCountSchema,
    camel: herdCountSchema,
    cattle: herdCountSchema,
    horse: herdCountSchema
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

// Virtual for total herd count
parasiteControlSchema.virtual('totalHerdCount').get(function() {
  const counts = this.herdCounts;
  return (counts.sheep?.total || 0) + 
         (counts.goats?.total || 0) + 
         (counts.camel?.total || 0) + 
         (counts.cattle?.total || 0) + 
         (counts.horse?.total || 0);
});

// Virtual for total treated animals
parasiteControlSchema.virtual('totalTreated').get(function() {
  const counts = this.herdCounts;
  return (counts.sheep?.treated || 0) + 
         (counts.goats?.treated || 0) + 
         (counts.camel?.treated || 0) + 
         (counts.cattle?.treated || 0) + 
         (counts.horse?.treated || 0);
});

// Virtual for treatment efficiency percentage
parasiteControlSchema.virtual('treatmentEfficiency').get(function() {
  const total = this.totalHerdCount;
  const treated = this.totalTreated;
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
