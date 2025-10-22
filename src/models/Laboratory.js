const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     Laboratory:
 *       type: object
 *       required:
 *         - sampleCode
 *         - sampleType
 *         - collector
 *         - date
 *       properties:
 *         _id:
 *           type: string
 *           description: Record ID
 *         sampleCode:
 *           type: string
 *           description: Unique sample code
 *         sampleType:
 *           type: string
 *           description: Type of sample collected
 *         collector:
 *           type: string
 *           description: Name of sample collector
 *         date:
 *           type: string
 *           format: date
 *           description: Date of sample collection
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
 *         speciesCounts:
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
 *         testType:
 *           type: string
 *           description: Type of laboratory test
 *         testResults:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               parameter:
 *                 type: string
 *               result:
 *                 type: string
 *               normalRange:
 *                 type: string
 *               status:
 *                 type: string
 *         positiveCases:
 *           type: number
 *           description: Number of positive test results
 *         negativeCases:
 *           type: number
 *           description: Number of negative test results
 *         testStatus:
 *           type: string
 *           enum: [Pending, In Progress, Completed, Failed]
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

const testResultSchema = new mongoose.Schema({
  parameter: {
    type: String,
    required: [true, 'Test parameter is required'],
    trim: true,
    maxlength: [100, 'Parameter name cannot exceed 100 characters']
  },
  result: {
    type: String,
    required: [true, 'Test result is required'],
    trim: true,
    maxlength: [200, 'Result cannot exceed 200 characters']
  },
  normalRange: {
    type: String,
    trim: true,
    maxlength: [100, 'Normal range cannot exceed 100 characters']
  },
  status: {
    type: String,
    required: [true, 'Result status is required'],
    enum: {
      values: ['Normal', 'Abnormal', 'Positive', 'Negative', 'Inconclusive'],
      message: 'Status must be one of: Normal, Abnormal, Positive, Negative, Inconclusive'
    }
  },
  unit: {
    type: String,
    trim: true,
    maxlength: [20, 'Unit cannot exceed 20 characters']
  }
}, { _id: false });

const laboratorySchema = new mongoose.Schema({
  serialNo: { 
    type: Number, 
    required: false, // Made optional for import flexibility
    min: [0, 'Serial number cannot be negative'],
    unique: false, // Removed unique constraint for import flexibility
    default: function() { return Date.now() % 1000000; } // Auto-generate if missing
  },
  date: { 
    type: Date, 
    required: [true, 'Date is required']
    // Removed future date validation to allow flexible date entry
  },
  farmLocation: { 
    type: String, 
    required: false, 
    trim: true, 
    maxlength: [200, 'Farm location cannot exceed 200 characters'],
    default: 'غير محدد' 
  },
  sampleCode: { 
    type: String, 
    required: false, // Made optional for import flexibility
    unique: false, // Removed unique constraint for import flexibility
    trim: true, 
    maxlength: [50, 'Sample code cannot exceed 50 characters'],
    default: function() { return 'LAB-' + Date.now(); } // Auto-generate if missing
  },
  clientName: { 
    type: String, 
    required: false, // Made optional for import flexibility
    trim: true, 
    maxlength: [200, 'Client name cannot exceed 200 characters'],
    default: 'غير محدد' // Default value for missing data
  },
  clientId: { 
    type: String, 
    required: false, // Made optional for import flexibility
    trim: true,
    default: 'N/A' // Default value for missing data
  },
  clientBirthDate: { 
    type: Date 
  },
  clientPhone: { 
    type: String, 
    required: false, // Made optional for import flexibility
    trim: true,
    default: 'N/A' // Default value for missing data
  },
  client: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Client',
    required: false // Optional since we have flat client fields
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
  speciesCounts: { 
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
    },
    other: { 
      type: String, 
      trim: true, 
      maxlength: [100, 'Other species cannot exceed 100 characters'],
      default: ''
    } 
  },
  collector: { 
    type: String, 
    required: false, // Made optional for import flexibility
    trim: true, 
    maxlength: [200, 'Collector name cannot exceed 200 characters'],
    default: 'N/A' // Default value for missing data
  },
  sampleType: { 
    type: String, 
    required: false, // Made optional for import flexibility
    trim: true,
    default: 'Blood' // Default value for missing data
  },
  sampleNumber: { 
    type: String, 
    required: false, // Made optional for import flexibility
    trim: true,
    maxlength: [50, 'Collector code cannot exceed 50 characters'],
    default: 'N/A' // Default value for missing data
  },
  positiveCases: { 
    type: Number, 
    required: false, // Made optional for import flexibility
    min: [0, 'Positive cases cannot be negative'], 
    default: 0 
  },
  negativeCases: { 
    type: Number, 
    required: false, // Made optional for import flexibility
    min: [0, 'Negative cases cannot be negative'], 
    default: 0 
  },
  remarks: { 
    type: String, 
    trim: true, 
    maxlength: [1000, 'Remarks cannot exceed 1000 characters'] 
  },
  testResults: [testResultSchema],
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: false // Made optional for import flexibility
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
laboratorySchema.index({ sampleCode: 1 });
laboratorySchema.index({ date: -1 });
laboratorySchema.index({ client: 1 });
laboratorySchema.index({ collector: 1 });
laboratorySchema.index({ testType: 1 });
laboratorySchema.index({ testStatus: 1 });
laboratorySchema.index({ priority: 1 });
laboratorySchema.index({ sampleType: 1 });
laboratorySchema.index({ 'coordinates.latitude': 1, 'coordinates.longitude': 1 });

// Virtual for total samples
laboratorySchema.virtual('totalSamples').get(function() {
  return this.positiveCases + this.negativeCases;
});

// Virtual for total animals sampled
laboratorySchema.virtual('totalAnimals').get(function() {
  const counts = this.speciesCounts;
  return (counts.sheep || 0) + 
         (counts.goats || 0) + 
         (counts.camel || 0) + 
         (counts.cattle || 0) + 
         (counts.horse || 0);
});

// Virtual for positive rate percentage
laboratorySchema.virtual('positiveRate').get(function() {
  const total = this.totalSamples;
  return total > 0 ? Math.round((this.positiveCases / total) * 100) : 0;
});

// Virtual for test completion status
laboratorySchema.virtual('isCompleted').get(function() {
  return this.testStatus === 'Completed';
});

// Virtual for test duration in days
laboratorySchema.virtual('testDuration').get(function() {
  if (this.actualCompletionDate) {
    const diffTime = Math.abs(this.actualCompletionDate - this.date);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  return null;
});

// Static method to find records by date range
laboratorySchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).populate('client', 'name nationalId phone village');
};

// Static method to find records by test type
laboratorySchema.statics.findByTestType = function(testType) {
  return this.find({ testType }).populate('client', 'name nationalId phone village');
};

// Static method to find pending tests
laboratorySchema.statics.findPending = function() {
  return this.find({ testStatus: 'Pending' })
    .populate('client', 'name nationalId phone village')
    .sort({ priority: -1, date: 1 });
};

// Static method to find overdue tests
laboratorySchema.statics.findOverdue = function() {
  return this.find({
    testStatus: { $in: ['Pending', 'In Progress'] },
    expectedCompletionDate: { $lt: new Date() }
  }).populate('client', 'name nationalId phone village');
};

// Static method to get statistics
laboratorySchema.statics.getStatistics = async function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: null,
        totalRecords: { $sum: 1 },
        totalSamples: { $sum: { $add: ['$positiveCases', '$negativeCases'] } },
        totalPositive: { $sum: '$positiveCases' },
        totalNegative: { $sum: '$negativeCases' },
        pendingTests: {
          $sum: { $cond: [{ $eq: ['$testStatus', 'Pending'] }, 1, 0] }
        },
        inProgressTests: {
          $sum: { $cond: [{ $eq: ['$testStatus', 'In Progress'] }, 1, 0] }
        },
        completedTests: {
          $sum: { $cond: [{ $eq: ['$testStatus', 'Completed'] }, 1, 0] }
        },
        failedTests: {
          $sum: { $cond: [{ $eq: ['$testStatus', 'Failed'] }, 1, 0] }
        }
      }
    }
  ];
  
  const result = await this.aggregate(pipeline);
  return result[0] || {
    totalRecords: 0,
    totalSamples: 0,
    totalPositive: 0,
    totalNegative: 0,
    pendingTests: 0,
    inProgressTests: 0,
    completedTests: 0,
    failedTests: 0
  };
};

// Static method to get test type statistics
laboratorySchema.statics.getTestTypeStats = async function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: '$testType',
        count: { $sum: 1 },
        totalSamples: { $sum: { $add: ['$positiveCases', '$negativeCases'] } },
        positiveRate: {
          $avg: {
            $cond: [
              { $gt: [{ $add: ['$positiveCases', '$negativeCases'] }, 0] },
              { $multiply: [{ $divide: ['$positiveCases', { $add: ['$positiveCases', '$negativeCases'] }] }, 100] },
              0
            ]
          }
        }
      }
    },
    { $sort: { count: -1 } }
  ];
  
  return await this.aggregate(pipeline);
};

// Pre-save middleware to update updatedBy
laboratorySchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedBy = this.constructor.currentUser;
  }
  next();
});

// Pre-save validation for test results consistency
laboratorySchema.pre('save', function(next) {
  const totalCases = this.positiveCases + this.negativeCases;
  if (this.testResults && this.testResults.length > 0 && totalCases === 0) {
    return next(new Error('Test results exist but no positive/negative cases recorded'));
  }
  next();
});

// Pre-save middleware to set completion date
laboratorySchema.pre('save', function(next) {
  if (this.isModified('testStatus') && this.testStatus === 'Completed' && !this.actualCompletionDate) {
    this.actualCompletionDate = new Date();
  }
  next();
});

module.exports = mongoose.model('Laboratory', laboratorySchema);
