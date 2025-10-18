const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     Vaccination:
 *       type: object
 *       required:
 *         - serialNo
 *         - date
 *         - client
 *         - supervisor
 *         - vehicleNo
 *         - vaccineType
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
 *           description: Date of vaccination
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
 *         team:
 *           type: string
 *           description: Team assigned for vaccination
 *         vehicleNo:
 *           type: string
 *           description: Vehicle number used
 *         vaccineType:
 *           type: string
 *           description: Type of vaccine used
 *         vaccineCategory:
 *           type: string
 *           enum: [Preventive, Emergency]
 *           description: Category of vaccination
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
 *         herdHealth:
 *           type: string
 *           enum: [Healthy, Sick, Under Treatment]
 *           description: Overall herd health status
 *         animalsHandling:
 *           type: string
 *           enum: [Easy, Difficult]
 *           description: Ease of handling animals
 *         labours:
 *           type: string
 *           enum: [Available, Not Available]
 *           description: Labour availability
 *         reachableLocation:
 *           type: string
 *           enum: [Easy, Hard to reach]
 *           description: Location accessibility
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
  vaccinated: {
    type: Number,
    required: true,
    min: [0, 'Vaccinated count cannot be negative'],
    default: 0
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
    type: Date,
    validate: {
      validator: function(date) {
        return !date || date >= this.date;
      },
      message: 'Fulfilling date cannot be before request date'
    }
  }
}, { _id: false });

const vaccinationSchema = new mongoose.Schema({
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
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Client reference is required']
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
  team: {
    type: String,
    required: [true, 'Team is required'],
    trim: true,
    maxlength: [100, 'Team name cannot exceed 100 characters']
  },
  vehicleNo: {
    type: String,
    required: [true, 'Vehicle number is required'],
    trim: true,
    maxlength: [20, 'Vehicle number cannot exceed 20 characters']
  },
  vaccineType: {
    type: String,
    required: [true, 'Vaccine type is required'],
    trim: true,
    maxlength: [100, 'Vaccine type cannot exceed 100 characters']
  },
  vaccineCategory: {
    type: String,
    required: [true, 'Vaccine category is required'],
    enum: {
      values: ['Preventive', 'Emergency'],
      message: 'Vaccine category must be either Preventive or Emergency'
    }
  },
  herdCounts: {
    sheep: herdCountSchema,
    goats: herdCountSchema,
    camel: herdCountSchema,
    cattle: herdCountSchema,
    horse: herdCountSchema
  },
  herdHealth: {
    type: String,
    required: [true, 'Herd health status is required'],
    enum: {
      values: ['Healthy', 'Sick', 'Under Treatment'],
      message: 'Health status must be one of: Healthy, Sick, Under Treatment'
    }
  },
  animalsHandling: {
    type: String,
    required: [true, 'Animals handling status is required'],
    enum: {
      values: ['Easy', 'Difficult'],
      message: 'Animals handling must be either Easy or Difficult'
    }
  },
  labours: {
    type: String,
    required: [true, 'Labour availability is required'],
    enum: {
      values: ['Available', 'Not Available'],
      message: 'Labour status must be either Available or Not Available'
    }
  },
  reachableLocation: {
    type: String,
    required: [true, 'Location reachability is required'],
    enum: {
      values: ['Easy', 'Hard to reach'],
      message: 'Location reachability must be either Easy or Hard to reach'
    }
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
  // createdBy: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: 'User',
  //   required: true
  // },
  // updatedBy: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: 'User'
  // }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
vaccinationSchema.index({ serialNo: 1 });
vaccinationSchema.index({ date: -1 });
vaccinationSchema.index({ client: 1 });
vaccinationSchema.index({ supervisor: 1 });
vaccinationSchema.index({ vaccineType: 1 });
vaccinationSchema.index({ vaccineCategory: 1 });
vaccinationSchema.index({ 'request.situation': 1 });
vaccinationSchema.index({ herdHealth: 1 });
vaccinationSchema.index({ 'coordinates.latitude': 1, 'coordinates.longitude': 1 });

// Virtual for total herd count
vaccinationSchema.virtual('totalHerdCount').get(function() {
  const counts = this.herdCounts;
  return (counts.sheep?.total || 0) + 
         (counts.goats?.total || 0) + 
         (counts.camel?.total || 0) + 
         (counts.cattle?.total || 0) + 
         (counts.horse?.total || 0);
});

// Virtual for total vaccinated animals
vaccinationSchema.virtual('totalVaccinated').get(function() {
  const counts = this.herdCounts;
  return (counts.sheep?.vaccinated || 0) + 
         (counts.goats?.vaccinated || 0) + 
         (counts.camel?.vaccinated || 0) + 
         (counts.cattle?.vaccinated || 0) + 
         (counts.horse?.vaccinated || 0);
});

// Virtual for vaccination coverage percentage
vaccinationSchema.virtual('vaccinationCoverage').get(function() {
  const total = this.totalHerdCount;
  const vaccinated = this.totalVaccinated;
  return total > 0 ? Math.round((vaccinated / total) * 100) : 0;
});

// Static method to find records by date range
vaccinationSchema.statics.findByDateRange = function(startDate, endDate) {
  return this.find({
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).populate('client', 'name nationalId phone village');
};

// Static method to find records by vaccine type
vaccinationSchema.statics.findByVaccineType = function(vaccineType) {
  return this.find({ vaccineType }).populate('client', 'name nationalId phone village');
};

// Static method to find records by supervisor
vaccinationSchema.statics.findBySupervisor = function(supervisor) {
  return this.find({ supervisor }).populate('client', 'name nationalId phone village');
};

// Static method to get vaccination statistics
vaccinationSchema.statics.getStatistics = async function(filters = {}) {
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
        totalVaccinated: { 
          $sum: { 
            $add: [
              '$herdCounts.sheep.vaccinated',
              '$herdCounts.goats.vaccinated',
              '$herdCounts.camel.vaccinated',
              '$herdCounts.cattle.vaccinated',
              '$herdCounts.horse.vaccinated'
            ]
          }
        },
        preventiveVaccinations: {
          $sum: { $cond: [{ $eq: ['$vaccineCategory', 'Preventive'] }, 1, 0] }
        },
        emergencyVaccinations: {
          $sum: { $cond: [{ $eq: ['$vaccineCategory', 'Emergency'] }, 1, 0] }
        },
        healthyHerds: {
          $sum: { $cond: [{ $eq: ['$herdHealth', 'Healthy'] }, 1, 0] }
        },
        sickHerds: {
          $sum: { $cond: [{ $eq: ['$herdHealth', 'Sick'] }, 1, 0] }
        }
      }
    }
  ];
  
  const result = await this.aggregate(pipeline);
  return result[0] || {
    totalRecords: 0,
    totalAnimals: 0,
    totalVaccinated: 0,
    preventiveVaccinations: 0,
    emergencyVaccinations: 0,
    healthyHerds: 0,
    sickHerds: 0
  };
};

// Static method to get vaccine type statistics
vaccinationSchema.statics.getVaccineTypeStats = async function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: '$vaccineType',
        count: { $sum: 1 },
        totalAnimalsVaccinated: { 
          $sum: { 
            $add: [
              '$herdCounts.sheep.vaccinated',
              '$herdCounts.goats.vaccinated',
              '$herdCounts.camel.vaccinated',
              '$herdCounts.cattle.vaccinated',
              '$herdCounts.horse.vaccinated'
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
vaccinationSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedBy = this.constructor.currentUser;
  }
  next();
});

// Pre-save validation for herd counts
vaccinationSchema.pre('save', function(next) {
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
      if (herd.vaccinated > herd.total) {
        return next(new Error(`Vaccinated ${type} count cannot exceed total count`));
      }
    }
  }
  next();
});

module.exports = mongoose.model('Vaccination', vaccinationSchema);
