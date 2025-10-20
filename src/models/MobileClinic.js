const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     MobileClinic:
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
 *           description: Date of mobile clinic visit
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
 *         animalCounts:
 *           type: object
 *           properties:
 *             sheep:
 *               type: number
 *             goats:
 *               type: number
 *             camel:
 *               type: number
 *             cattle:
 *               type: number
 *             horse:
 *               type: number
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

const medicationSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    maxlength: [100, 'Medication name cannot exceed 100 characters']
  },
  dosage: {
    type: String,
    trim: true,
    maxlength: [50, 'Dosage cannot exceed 50 characters']
  },
  quantity: {
    type: Number,
    min: [0, 'Quantity cannot be negative']
  },
  administrationRoute: {
    type: String,
    enum: {
      values: ['Oral', 'Injection', 'Topical', 'Intravenous', 'Intramuscular', 'Subcutaneous'],
      message: 'Invalid administration route'
    }
  }
}, { _id: false });

const requestSchema = new mongoose.Schema({
  date: {
    type: Date
  },
  situation: {
    type: String,
    enum: {
      values: ['Open', 'Closed'],
      message: 'Situation must be one of: Open, Closed'
    }
  },
  fulfillingDate: {
    type: Date,
    validate: {
      validator: function(date) {
        // Allow empty fulfilling date or ensure it's not before request date
        if (!date) return true;
        if (!this.date) return true;
        
        // Compare dates only (ignore time)
        const requestDate = new Date(this.date);
        const fulfillingDate = new Date(date);
        
        requestDate.setHours(0, 0, 0, 0);
        fulfillingDate.setHours(0, 0, 0, 0);
        
        return fulfillingDate >= requestDate;
      },
      message: 'Fulfilling date cannot be before request date'
    }
  }
}, { _id: false });

const mobileClinicSchema = new mongoose.Schema({
  serialNo: {
    type: String,
    required: [true, 'Serial number is required'],
    unique: true,
    trim: true,
    maxlength: [20, 'Serial number cannot exceed 20 characters']
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
    validate: {
      validator: function(date) {
        return date <= new Date();
      },
      message: 'Date cannot be in the future'
    }
  },
  holdingCode: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HoldingCode'
  },
  // Client reference (ObjectId) - optional if flat client fields are provided
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  },
  
  // Flat client fields (alternative to client reference)
  clientName: {
    type: String,
    trim: true,
    maxlength: [100, 'Client name cannot exceed 100 characters']
  },
  clientId: {
    type: String,
    trim: true,
    maxlength: [20, 'Client ID cannot exceed 20 characters']
  },
  clientPhone: {
    type: String,
    trim: true,
    maxlength: [15, 'Client phone cannot exceed 15 characters']
  },
  clientBirthDate: {
    type: Date
  },
  clientVillage: {
    type: String,
    trim: true,
    maxlength: [100, 'Client village cannot exceed 100 characters']
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
    trim: true,
    maxlength: [20, 'Vehicle number cannot exceed 20 characters']
  },
  animalCounts: {
    sheep: {
      type: Number,
      min: [0, 'Sheep count cannot be negative'],
      default: 0
    },
    goats: {
      type: Number,
      min: [0, 'Goats count cannot be negative'],
      default: 0
    },
    camel: {
      type: Number,
      min: [0, 'Camel count cannot be negative'],
      default: 0
    },
    cattle: {
      type: Number,
      min: [0, 'Cattle count cannot be negative'],
      default: 0
    },
    horse: {
      type: Number,
      min: [0, 'Horse count cannot be negative'],
      default: 0
    }
  },
  diagnosis: {
    type: String,
    trim: true,
    maxlength: [500, 'Diagnosis cannot exceed 500 characters']
  },
  interventionCategory: {
    type: String,
    required: [true, 'Intervention category is required'],
    enum: {
      values: ['Emergency', 'Routine', 'Preventive', 'Follow-up', 'Clinical Examination', 'Ultrasonography', 'Lab Analysis', 'Surgical Operation', 'Farriery'],
      message: 'Intervention category must be one of: Emergency, Routine, Preventive, Follow-up, Clinical Examination, Ultrasonography, Lab Analysis, Surgical Operation, Farriery'
    }
  },
  treatment: {
    type: String,
    trim: true,
    maxlength: [1000, 'Treatment description cannot exceed 1000 characters']
  },
  medicationsUsed: [medicationSchema],
  request: {
    type: requestSchema
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
mobileClinicSchema.index({ serialNo: 1 });
mobileClinicSchema.index({ date: -1 });
mobileClinicSchema.index({ client: 1 });
mobileClinicSchema.index({ supervisor: 1 });
mobileClinicSchema.index({ interventionCategory: 1 });
mobileClinicSchema.index({ 'request.situation': 1 });
mobileClinicSchema.index({ followUpRequired: 1 });
mobileClinicSchema.index({ 'coordinates.latitude': 1, 'coordinates.longitude': 1 });

// Virtual for total animals treated
mobileClinicSchema.virtual('totalAnimals').get(function() {
  const counts = this.animalCounts;
  return (counts.sheep || 0) + 
         (counts.goats || 0) + 
         (counts.camel || 0) + 
         (counts.cattle || 0) + 
         (counts.horse || 0);
});

// Virtual for total medications count
mobileClinicSchema.virtual('totalMedications').get(function() {
  return this.medicationsUsed.length;
});

// Static method to find records by date range
mobileClinicSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).populate('client', 'name nationalId phone village');
};

// Static method to find records by intervention category
mobileClinicSchema.statics.findByInterventionCategory = function(category) {
  return this.find({ interventionCategory: category })
    .populate('client', 'name nationalId phone village');
};

// Static method to find records requiring follow-up
mobileClinicSchema.statics.findRequiringFollowUp = function() {
  return this.find({ followUpRequired: true })
    .populate('client', 'name nationalId phone village');
};

// Static method to get statistics
mobileClinicSchema.statics.getStatistics = async function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: null,
        totalRecords: { $sum: 1 },
        totalAnimals: { 
          $sum: { 
            $add: [
              '$animalCounts.sheep',
              '$animalCounts.goats',
              '$animalCounts.camel',
              '$animalCounts.cattle',
              '$animalCounts.horse'
            ]
          }
        },
        emergencyInterventions: {
          $sum: { $cond: [{ $eq: ['$interventionCategory', 'Emergency'] }, 1, 0] }
        },
        routineInterventions: {
          $sum: { $cond: [{ $eq: ['$interventionCategory', 'Routine'] }, 1, 0] }
        },
        preventiveInterventions: {
          $sum: { $cond: [{ $eq: ['$interventionCategory', 'Preventive'] }, 1, 0] }
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
    totalAnimals: 0,
    emergencyInterventions: 0,
    routineInterventions: 0,
    preventiveInterventions: 0,
    followUpRequired: 0
  };
};

// Pre-save middleware to validate client data and update updatedBy
mobileClinicSchema.pre('save', function(next) {
  // Validate that either client reference or flat client fields are provided
  const hasClientReference = this.client;
  const hasFlatClientFields = this.clientName && this.clientId;
  
  if (!hasClientReference && !hasFlatClientFields) {
    const error = new Error('Either client reference or flat client fields (clientName, clientId) must be provided');
    error.name = 'ValidationError';
    return next(error);
  }
  
  if (this.isModified() && !this.isNew) {
    this.updatedBy = this.constructor.currentUser;
  }
  next();
});

module.exports = mongoose.model('MobileClinic', mobileClinicSchema);
