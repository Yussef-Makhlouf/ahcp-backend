const mongoose = require('mongoose');

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
 *         farmLocation:
 *           type: string
 *           description: Location of the farm
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

const horseDetailSchema = new mongoose.Schema({
  id: {
    type: String,
    required: [true, 'Horse ID is required'],
    trim: true,
    maxlength: [20, 'Horse ID cannot exceed 20 characters']
  },
  breed: {
    type: String,
    required: [true, 'Horse breed is required'],
    trim: true,
    maxlength: [50, 'Breed cannot exceed 50 characters']
  },
  age: {
    type: Number,
    required: [true, 'Horse age is required'],
    min: [0, 'Age cannot be negative'],
    max: [50, 'Age seems unrealistic for a horse']
  },
  gender: {
    type: String,
    required: [true, 'Gender is required'],
    enum: {
      values: ['ذكر', 'أنثى', 'مخصي'],
      message: 'Gender must be one of: ذكر, أنثى, مخصي'
    }
  },
  color: {
    type: String,
    required: [true, 'Horse color is required'],
    trim: true,
    maxlength: [30, 'Color description cannot exceed 30 characters']
  },
  healthStatus: {
    type: String,
    required: [true, 'Health status is required'],
    enum: {
      values: ['سليم', 'مريض', 'تحت العلاج', 'متعافي'],
      message: 'Health status must be one of: سليم, مريض, تحت العلاج, متعافي'
    }
  },
  weight: {
    type: Number,
    min: [0, 'Weight cannot be negative'],
    max: [2000, 'Weight seems unrealistic']
  },
  temperature: {
    type: Number,
    min: [35, 'Temperature seems too low'],
    max: [45, 'Temperature seems too high']
  },
  heartRate: {
    type: Number,
    min: [20, 'Heart rate seems too low'],
    max: [100, 'Heart rate seems too high']
  },
  respiratoryRate: {
    type: Number,
    min: [5, 'Respiratory rate seems too low'],
    max: [50, 'Respiratory rate seems too high']
  }
}, { _id: false });

const medicationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Medication name is required'],
    trim: true,
    maxlength: [100, 'Medication name cannot exceed 100 characters']
  },
  dosage: {
    type: String,
    required: [true, 'Dosage is required'],
    trim: true,
    maxlength: [50, 'Dosage cannot exceed 50 characters']
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [0, 'Quantity cannot be negative']
  },
  route: {
    type: String,
    required: [true, 'Administration route is required'],
    enum: {
      values: ['Oral', 'Injection', 'Topical', 'Intravenous', 'Intramuscular', 'Subcutaneous'],
      message: 'Invalid administration route'
    }
  },
  frequency: {
    type: String,
    trim: true,
    maxlength: [50, 'Frequency cannot exceed 50 characters']
  },
  duration: {
    type: String,
    trim: true,
    maxlength: [50, 'Duration cannot exceed 50 characters']
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
      values: ['Open', 'Closed', 'Pending'],
      message: 'Situation must be one of: Open, Closed, Pending'
    }
  },
  fulfillingDate: {
    type: Date
  }
}, { _id: false });

const equineHealthSchema = new mongoose.Schema({
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
  client: {
    name: {
      type: String,
      required: [true, 'Client name is required'],
      trim: true,
      maxlength: [100, 'Client name cannot exceed 100 characters']
    },
    nationalId: {
      type: String,
      required: [true, 'Client national ID is required'],
      trim: true,
      match: [/^\d{10,14}$/, 'National ID must be between 10-14 digits']
    },
    birthDate: {
      type: Date
    },
    phone: {
      type: String,
      required: [true, 'Client phone is required'],
      trim: true,
      match: [/^(\+966|0)?[5][0-9]{8}$/, 'Invalid Saudi phone number format']
    },
    village: {
      type: String,
      required: [true, 'Client village is required'],
      trim: true,
      maxlength: [100, 'Village name cannot exceed 100 characters']
    },
    detailedAddress: {
      type: String,
      required: [true, 'Client detailed address is required'],
      trim: true,
      maxlength: [200, 'Address cannot exceed 200 characters']
    }
  },
  farmLocation: {
    type: String,
    required: [true, 'Farm location is required'],
    trim: true,
    maxlength: [200, 'Location cannot exceed 200 characters']
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
  horseCount: {
    type: Number,
    required: [true, 'Horse count is required'],
    min: [1, 'Horse count must be at least 1']
  },
  horseDetails: [horseDetailSchema],
  diagnosis: {
    type: String,
    required: [true, 'Diagnosis is required'],
    trim: true,
    maxlength: [500, 'Diagnosis cannot exceed 500 characters']
  },
  interventionCategory: {
    type: String,
    required: [true, 'Intervention category is required'],
    enum: {
      values: ['Emergency', 'Routine', 'Preventive', 'Follow-up', 'Breeding', 'Performance'],
      message: 'Intervention category must be one of: Emergency, Routine, Preventive, Follow-up, Breeding, Performance'
    }
  },
  treatment: {
    type: String,
    required: [true, 'Treatment is required'],
    trim: true,
    maxlength: [1000, 'Treatment description cannot exceed 1000 characters']
  },
  medicationsUsed: [medicationSchema],
  request: {
    type: requestSchema,
    required: [true, 'Request information is required']
  },
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: {
    type: Date,
    validate: {
      validator: function(date) {
        return !date || date > this.date;
      },
      message: 'Follow-up date must be after visit date'
    }
  },
  vaccinationStatus: {
    type: String,
    enum: {
      values: ['Up to date', 'Overdue', 'Not applicable', 'Partial'],
      message: 'Invalid vaccination status'
    }
  },
  dewormingStatus: {
    type: String,
    enum: {
      values: ['Recent', 'Overdue', 'Not applicable'],
      message: 'Invalid deworming status'
    }
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: [1000, 'Remarks cannot exceed 1000 characters']
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
        emergencyInterventions: {
          $sum: { $cond: [{ $eq: ['$interventionCategory', 'Emergency'] }, 1, 0] }
        },
        routineInterventions: {
          $sum: { $cond: [{ $eq: ['$interventionCategory', 'Routine'] }, 1, 0] }
        },
        preventiveInterventions: {
          $sum: { $cond: [{ $eq: ['$interventionCategory', 'Preventive'] }, 1, 0] }
        },
        breedingInterventions: {
          $sum: { $cond: [{ $eq: ['$interventionCategory', 'Breeding'] }, 1, 0] }
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
    emergencyInterventions: 0,
    routineInterventions: 0,
    preventiveInterventions: 0,
    breedingInterventions: 0,
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
