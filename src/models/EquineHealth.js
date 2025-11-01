const mongoose = require('mongoose');
const { populate } = require('./Client');

/**
 * @swagger
 * components:
 *   schemas:
 *     EquineHealth:
 *       type: object
 *       required:
 *         - serialNo
 *         - date
 *         - client
 *         - supervisor
 *         - vehicleNo
 *         - diagnosis
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
 *           description: Date of equine health visit
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
 *         horseCount:
 *           type: number
 *           description: Number of horses examined
 *         horseDetails:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               breed:
 *                 type: string
 *               age:
 *                 type: number
 *               gender:
 *                 type: string
 *               color:
 *                 type: string
 *               healthStatus:
 *                 type: string
 *         diagnosis:
 *           type: string
 *           description: Medical diagnosis
 *         interventionCategory:
 *           type: string
 *           description: Type of medical intervention
 *         treatment:
 *           type: string
 *           description: Treatment provided
 *         medicationsUsed:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               dosage:
 *                 type: string
 *               quantity:
 *                 type: number
 *               route:
 *                 type: string
 *         request:
 *           type: object
 *           properties:
 *             date:
 *               type: string
 *               format: date
 *             situation:
 *               type: string
 *               enum: [Ongoing, Closed]
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

const horseDetailSchema = new mongoose.Schema({
  id: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [50, 'Horse ID cannot exceed 50 characters'],
    default: 'N/A' // Default value for missing data
  },
  breed: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [100, 'Breed cannot exceed 100 characters'],
    default: 'N/A' // Default value for missing data
  },
  age: {
    type: Number,
    required: false, // Made optional for import flexibility
    min: [0, 'Age cannot be negative'],
    max: [100, 'Age limit increased for flexibility'],
    default: 0 // Default value for missing data
  },
  gender: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [50, 'Gender cannot exceed 50 characters'],
    default: 'N/A' // Default value for missing data - removed enum validation
  },
  color: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [100, 'Color description cannot exceed 100 characters'],
    default: 'N/A' // Default value for missing data
  },
  healthStatus: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [100, 'Health status cannot exceed 100 characters'],
    default: 'N/A' // Default value for missing data - removed enum validation
  },
  weight: {
    type: Number,
    min: [0, 'Weight cannot be negative'],
    max: [5000, 'Weight limit increased for flexibility'],
    default: 0 // Default value for missing data
  },
  temperature: {
    type: Number,
    min: [30, 'Temperature range expanded'],
    max: [50, 'Temperature range expanded'],
    default: 0 // Default value for missing data
  },
  heartRate: {
    type: Number,
    min: [10, 'Heart rate range expanded'],
    max: [200, 'Heart rate range expanded'],
    default: 0 // Default value for missing data
  },
  respiratoryRate: {
    type: Number,
    min: [1, 'Respiratory rate range expanded'],
    max: [100, 'Respiratory rate range expanded'],
    default: 0 // Default value for missing data
  }
}, { _id: false });

const medicationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [200, 'Medication name cannot exceed 200 characters'],
    default: 'N/A' // Default value for missing data
  },
  dosage: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [100, 'Dosage cannot exceed 100 characters'],
    default: 'N/A' // Default value for missing data
  },
  quantity: {
    type: Number,
    required: false, // Made optional for import flexibility
    min: [0, 'Quantity cannot be negative'],
    default: 0 // Default value for missing data
  },
  route: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [100, 'Administration route cannot exceed 100 characters'],
    default: 'N/A' // Default value for missing data - removed enum validation
  },
  frequency: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [100, 'Frequency cannot exceed 100 characters'],
    default: 'N/A' // Default value for missing data
  },
  duration: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [100, 'Duration cannot exceed 100 characters'],
    default: 'N/A' // Default value for missing data
  }
}, { _id: false });

const requestSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: false // Made optional for import flexibility
  },
  situation: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [100, 'Situation cannot exceed 100 characters'],
    default: 'N/A' // Default value for missing data - removed enum validation
  },
  fulfillingDate: {
    type: Date
  }
}, { _id: false });

// Function to generate random serial number
const generateSerialNo = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `EH${timestamp.slice(-6)}${random}`;
};

const equineHealthSchema = new mongoose.Schema({
  serialNo: {
    type: String,
    required: false, // Made optional for import flexibility
    unique: false, // Removed unique constraint for import flexibility
    trim: true,
    maxlength: [50, 'Serial number cannot exceed 50 characters'],
    default: generateSerialNo
  },
  date: {
    type: Date,
    required: false, // Made optional for import flexibility
    default: Date.now // Default to current date if missing
  },
  holdingCode: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HoldingCode'
  },
  client: {
    name: {
      type: String,
      required: false, // Made optional for import flexibility
      trim: true,
      maxlength: [200, 'Client name cannot exceed 200 characters'],
      default: 'غير محدد' // Default value for missing data
    },
    nationalId: {
      type: String,
      required: false, // Made optional for import flexibility
      trim: true,
      maxlength: [20, 'National ID cannot exceed 20 characters'],
      default: 'N/A' // Default value for missing data - removed pattern validation
    },
    birthDate: {
      type: Date
    },
    phone: {
      type: String,
      required: false, // Made optional for import flexibility
      trim: true,
      maxlength: [20, 'Phone cannot exceed 20 characters'],
      default: 'N/A' // Default value for missing data - removed pattern validation
    },
    village: {
      type: String,
      required: false, // Made optional for import flexibility
      trim: true,
      maxlength: [200, 'Village name cannot exceed 200 characters'],
      default: 'N/A' // Default value for missing data
    },
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
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [200, 'Supervisor name cannot exceed 200 characters'],
    default: 'N/A' // Default value for missing data
  },
  vehicleNo: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [50, 'Vehicle number cannot exceed 50 characters'],
    default: 'N/A' // Default value for missing data
  },
  horseCount: {
    type: Number,
    required: false, // Made optional for import flexibility
    min: [0, 'Horse count cannot be negative'],
    default: 0 // Default value for missing data
  },
  horseDetails: [horseDetailSchema],
  diagnosis: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [1000, 'Diagnosis cannot exceed 1000 characters'],
    default: 'N/A' // Default value for missing data
  },
  interventionCategory: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [200, 'Intervention category cannot exceed 200 characters'],
    default: 'N/A' // Default value for missing data - removed enum validation
  },
  treatment: {
    type: String,
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [2000, 'Treatment description cannot exceed 2000 characters'],
    default: 'N/A' // Default value for missing data
  },
  medicationsUsed: [medicationSchema],
  request: {
    type: requestSchema,
    required: false // Made optional for import flexibility
  },
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: {
    type: Date
    // Removed validation for import flexibility
  },
  vaccinationStatus: {
    type: String,
    trim: true,
    maxlength: [100, 'Vaccination status cannot exceed 100 characters'],
    default: 'N/A' // Default value for missing data - removed enum validation
  },
  dewormingStatus: {
    type: String,
    trim: true,
    maxlength: [100, 'Deworming status cannot exceed 100 characters'],
    default: 'N/A' // Default value for missing data - removed enum validation
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: [2000, 'Remarks cannot exceed 2000 characters'],
    default: '' // Default value for missing data
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
equineHealthSchema.index({ serialNo: 1 });
equineHealthSchema.index({ date: -1 });
equineHealthSchema.index({ client: 1 });
equineHealthSchema.index({ supervisor: 1 });
equineHealthSchema.index({ interventionCategory: 1 });
equineHealthSchema.index({ 'request.situation': 1 });
equineHealthSchema.index({ followUpRequired: 1 });
equineHealthSchema.index({ 'coordinates.latitude': 1, 'coordinates.longitude': 1 });

// Virtual for healthy horses count
equineHealthSchema.virtual('healthyHorsesCount').get(function() {
  return this.horseDetails.filter(horse => horse.healthStatus === 'سليم').length;
});

// Virtual for sick horses count
equineHealthSchema.virtual('sickHorsesCount').get(function() {
  return this.horseDetails.filter(horse => horse.healthStatus === 'مريض').length;
});

// Virtual for horses under treatment count
equineHealthSchema.virtual('underTreatmentCount').get(function() {
  return this.horseDetails.filter(horse => horse.healthStatus === 'تحت العلاج').length;
});

// Virtual for total medications count
equineHealthSchema.virtual('totalMedications').get(function() {
  return this.medicationsUsed.length;
});

// Static method to find records by date range
equineHealthSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  });
};

// Static method to find records by intervention category
equineHealthSchema.statics.findByInterventionCategory = function(category) {
  return this.find({ interventionCategory: category });
};

// Static method to find records requiring follow-up
equineHealthSchema.statics.findRequiringFollowUp = function() {
  return this.find({ followUpRequired: true });
};

// Static method to get statistics
equineHealthSchema.statics.getStatistics = async function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: null,
        totalRecords: { $sum: 1 },
        totalHorses: { $sum: '$horseCount' },
        clinicalExaminations: {
          $sum: { $cond: [{ $eq: ['$interventionCategory', 'Clinical Examination'] }, 1, 0] }
        },
        surgicalOperations: {
          $sum: { $cond: [{ $eq: ['$interventionCategory', 'Surgical Operation'] }, 1, 0] }
        },
        ultrasonography: {
          $sum: { $cond: [{ $eq: ['$interventionCategory', 'Ultrasonography'] }, 1, 0] }
        },
        labAnalyses: {
          $sum: { $cond: [{ $eq: ['$interventionCategory', 'Lab Analysis'] }, 1, 0] }
        },
        farriery: {
          $sum: { $cond: [{ $eq: ['$interventionCategory', 'Farriery'] }, 1, 0] }
        },
        followUpRequired: {
          $sum: { $cond: ['$followUpRequired', 1, 0] }
        }
      }
    }
  ];
  
  const result = await this.aggregate(pipeline);
  return result[0] || {
    totalRecords: 0,
    totalHorses: 0,
    clinicalExaminations: 0,
    surgicalOperations: 0,
    ultrasonography: 0,
    labAnalyses: 0,
    farriery: 0,
    followUpRequired: 0
  };
};

// Static method to get breed statistics
equineHealthSchema.statics.getBreedStats = async function(filters = {}) {
  const pipeline = [
    { $match: filters },
    { $unwind: '$horseDetails' },
    {
      $group: {
        _id: '$horseDetails.breed',
        count: { $sum: 1 },
        healthyCount: {
          $sum: { $cond: [{ $eq: ['$horseDetails.healthStatus', 'سليم'] }, 1, 0] }
        },
        sickCount: {
          $sum: { $cond: [{ $eq: ['$horseDetails.healthStatus', 'مريض'] }, 1, 0] }
        }
      }
    },
    { $sort: { count: -1 } }
  ];
  
  return await this.aggregate(pipeline);
};

// Pre-save middleware to update updatedBy
equineHealthSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedBy = this.constructor.currentUser;
  }
  next();
});

// Pre-save validation for horse details count (only if horseDetails is provided)
equineHealthSchema.pre('save', function(next) {
  if (this.horseDetails && this.horseDetails.length > 0 && this.horseDetails.length !== this.horseCount) {
    return next(new Error('Horse details count must match horse count'));
  }
  next();
});

module.exports = mongoose.model('EquineHealth', equineHealthSchema);
