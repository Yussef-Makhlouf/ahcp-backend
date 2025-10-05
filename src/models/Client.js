const mongoose = require('mongoose');

/**
 * @swagger
 * components:
 *   schemas:
 *     Animal:
 *       type: object
 *       properties:
 *         animalType:
 *           type: string
 *           description: Type of animal (sheep, goats, camel, cattle, horse)
 *         breed:
 *           type: string
 *           description: Animal breed
 *         age:
 *           type: number
 *           description: Animal age in years
 *         gender:
 *           type: string
 *           enum: [ذكر, أنثى]
 *           description: Animal gender
 *         healthStatus:
 *           type: string
 *           enum: [سليم, مريض, تحت العلاج]
 *           description: Current health status
 *         identificationNumber:
 *           type: string
 *           description: Unique identification number
 *         animalCount:
 *           type: number
 *           description: Number of animals of this type
 *     
 *     Client:
 *       type: object
 *       required:
 *         - name
 *         - nationalId
 *         - phone
 *       properties:
 *         _id:
 *           type: string
 *           description: Client ID
 *         name:
 *           type: string
 *           description: Client full name
 *         nationalId:
 *           type: string
 *           description: National ID number
 *         birthDate:
 *           type: string
 *           format: date
 *           description: Date of birth
 *         phone:
 *           type: string
 *           description: Phone number
 *         email:
 *           type: string
 *           format: email
 *           description: Email address
 *         village:
 *           type: string
 *           description: Village name
 *         detailedAddress:
 *           type: string
 *           description: Detailed address
 *         coordinates:
 *           type: object
 *           properties:
 *             latitude:
 *               type: number
 *             longitude:
 *               type: number
 *         status:
 *           type: string
 *           enum: [نشط, غير نشط]
 *           description: Client status
 *         animals:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Animal'
 *         availableServices:
 *           type: array
 *           items:
 *             type: string
 *           description: Services available to this client
 *         totalAnimals:
 *           type: number
 *           description: Total number of animals owned
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

const animalSchema = new mongoose.Schema({
  animalType: {
    type: String,
    required: [true, 'Animal type is required'],
    enum: {
      values: ['sheep', 'goats', 'camel', 'cattle', 'horse'],
      message: 'Animal type must be one of: sheep, goats, camel, cattle, horse'
    }
  },
  breed: {
    type: String,
    required: [true, 'Breed is required'],
    trim: true,
    maxlength: [50, 'Breed name cannot exceed 50 characters']
  },
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: [0, 'Age cannot be negative'],
    max: [50, 'Age seems unrealistic']
  },
  gender: {
    type: String,
    required: [true, 'Gender is required'],
    enum: {
      values: ['ذكر', 'أنثى'],
      message: 'Gender must be either ذكر or أنثى'
    }
  },
  healthStatus: {
    type: String,
    required: [true, 'Health status is required'],
    enum: {
      values: ['سليم', 'مريض', 'تحت العلاج'],
      message: 'Health status must be one of: سليم, مريض, تحت العلاج'
    },
    default: 'سليم'
  },
  identificationNumber: {
    type: String,
    trim: true,
    maxlength: [20, 'Identification number cannot exceed 20 characters']
  },
  animalCount: {
    type: Number,
    required: [true, 'Animal count is required'],
    min: [1, 'Animal count must be at least 1'],
    default: 1
  }
}, {
  _id: false // Don't create separate _id for subdocuments
});

const clientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  nationalId: {
    type: String,
    required: [true, 'National ID is required'],
    unique: true,
    trim: true,
    match: [/^\d{10,14}$/, 'National ID must be between 10-14 digits']
  },
  birthDate: {
    type: Date,
    validate: {
      validator: function(date) {
        return date <= new Date();
      },
      message: 'Birth date cannot be in the future'
    }
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^[\+]?[0-9\s\-\(\)]{10,15}$/, 'Please enter a valid phone number']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
    sparse: true // Allow multiple documents with null email
  },
  village: {
    type: String,
    trim: true,
    maxlength: [100, 'Village name cannot exceed 100 characters']
  },
  detailedAddress: {
    type: String,
    trim: true,
    maxlength: [500, 'Address cannot exceed 500 characters']
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
  status: {
    type: String,
    enum: {
      values: ['نشط', 'غير نشط'],
      message: 'Status must be either نشط or غير نشط'
    },
    default: 'نشط'
  },
  animals: [animalSchema],
  availableServices: [{
    type: String,
    enum: {
      values: ['parasite_control', 'vaccination', 'mobile_clinic', 'equine_health', 'laboratory'],
      message: 'Invalid service type'
    }
  }],
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
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
clientSchema.index({ nationalId: 1 });
clientSchema.index({ name: 1 });
clientSchema.index({ village: 1 });
clientSchema.index({ status: 1 });
clientSchema.index({ phone: 1 });
clientSchema.index({ 'coordinates.latitude': 1, 'coordinates.longitude': 1 });

// Virtual for total animals count
clientSchema.virtual('totalAnimals').get(function() {
  if (!this.animals || !Array.isArray(this.animals)) {
    return 0;
  }
  return this.animals.reduce((total, animal) => {
    return total + (animal.animalCount || 0);
  }, 0);
});

// Virtual for animals by type
clientSchema.virtual('animalsByType').get(function() {
  const animalTypes = {};
  if (!this.animals || !Array.isArray(this.animals)) {
    return animalTypes;
  }
  
  this.animals.forEach(animal => {
    if (animal.animalType && animal.animalCount) {
      if (animalTypes[animal.animalType]) {
        animalTypes[animal.animalType] += animal.animalCount;
      } else {
        animalTypes[animal.animalType] = animal.animalCount;
      }
    }
  });
  return animalTypes;
});

// Virtual for healthy animals count
clientSchema.virtual('healthyAnimalsCount').get(function() {
  if (!this.animals || !Array.isArray(this.animals)) {
    return 0;
  }
  return this.animals
    .filter(animal => animal.healthStatus === 'سليم')
    .reduce((total, animal) => total + (animal.animalCount || 0), 0);
});

// Static method to find active clients
clientSchema.statics.findActive = function() {
  return this.find({ status: 'نشط' });
};

// Static method to find clients by village
clientSchema.statics.findByVillage = function(village) {
  return this.find({ village, status: 'نشط' });
};

// Static method to find clients with specific animal type
clientSchema.statics.findByAnimalType = function(animalType) {
  return this.find({ 
    'animals.animalType': animalType,
    status: 'نشط'
  });
};

// Method to add animal
clientSchema.methods.addAnimal = function(animalData) {
  this.animals.push(animalData);
  return this.save();
};

// Method to update animal
clientSchema.methods.updateAnimal = function(animalIndex, animalData) {
  if (this.animals[animalIndex]) {
    Object.assign(this.animals[animalIndex], animalData);
    return this.save();
  }
  throw new Error('Animal not found');
};

// Method to remove animal
clientSchema.methods.removeAnimal = function(animalIndex) {
  if (this.animals[animalIndex]) {
    this.animals.splice(animalIndex, 1);
    return this.save();
  }
  throw new Error('Animal not found');
};

// Pre-save middleware to update updatedBy
clientSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedBy = this.constructor.currentUser;
  }
  next();
});

module.exports = mongoose.model('Client', clientSchema);
