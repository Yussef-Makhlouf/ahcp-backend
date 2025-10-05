const Joi = require('joi');

/**
 * Validation middleware factory
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { 
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: 'VALIDATION_ERROR',
        errors
      });
    }

    next();
  };
};

/**
 * Query validation middleware
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.query, { 
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      return res.status(400).json({
        success: false,
        message: 'Query validation failed',
        error: 'QUERY_VALIDATION_ERROR',
        errors
      });
    }

    next();
  };
};

/**
 * Common validation schemas
 */
const schemas = {
  // User schemas
  userRegistration: Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('super_admin', 'section_supervisor', 'field_worker').default('field_worker'),
    section: Joi.string().max(100).optional()
  }),

  userLogin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  userUpdate: Joi.object({
    name: Joi.string().min(2).max(50).optional(),
    email: Joi.string().email().optional(),
    role: Joi.string().valid('super_admin', 'section_supervisor', 'field_worker').optional(),
    section: Joi.string().max(100).optional(),
    isActive: Joi.boolean().optional()
  }),

  // Client schemas
  clientCreate: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    nationalId: Joi.string().pattern(/^\d{10,14}$/).required(),
    birthDate: Joi.date().max('now').optional(),
    phone: Joi.string().pattern(/^[\+]?[0-9\s\-\(\)]{10,15}$/).required(),
    email: Joi.string().email().optional(),
    village: Joi.string().max(100).optional(),
    detailedAddress: Joi.string().max(500).optional(),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90).optional(),
      longitude: Joi.number().min(-180).max(180).optional()
    }).optional(),
    status: Joi.string().valid('نشط', 'غير نشط').default('نشط'),
    animals: Joi.array().items(Joi.object({
      animalType: Joi.string().valid('sheep', 'goats', 'camel', 'cattle', 'horse').required(),
      breed: Joi.string().max(50).required(),
      age: Joi.number().min(0).max(50).required(),
      gender: Joi.string().valid('ذكر', 'أنثى').required(),
      healthStatus: Joi.string().valid('سليم', 'مريض', 'تحت العلاج').default('سليم'),
      identificationNumber: Joi.string().max(20).optional(),
      animalCount: Joi.number().min(1).default(1)
    })).optional(),
    availableServices: Joi.array().items(
      Joi.string().valid('parasite_control', 'vaccination', 'mobile_clinic', 'equine_health', 'laboratory')
    ).optional(),
    notes: Joi.string().max(1000).optional()
  }),

  // Parasite Control schemas
  parasiteControlCreate: Joi.object({
    serialNo: Joi.string().max(20).required(),
    date: Joi.date().max('now').required(),
    client: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    herdLocation: Joi.string().max(200).required(),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90).optional(),
      longitude: Joi.number().min(-180).max(180).optional()
    }).optional(),
    supervisor: Joi.string().max(100).required(),
    vehicleNo: Joi.string().max(20).required(),
    herdCounts: Joi.object({
      sheep: Joi.object({
        total: Joi.number().min(0).default(0),
        young: Joi.number().min(0).default(0),
        female: Joi.number().min(0).default(0),
        treated: Joi.number().min(0).default(0)
      }).optional(),
      goats: Joi.object({
        total: Joi.number().min(0).default(0),
        young: Joi.number().min(0).default(0),
        female: Joi.number().min(0).default(0),
        treated: Joi.number().min(0).default(0)
      }).optional(),
      camel: Joi.object({
        total: Joi.number().min(0).default(0),
        young: Joi.number().min(0).default(0),
        female: Joi.number().min(0).default(0),
        treated: Joi.number().min(0).default(0)
      }).optional(),
      cattle: Joi.object({
        total: Joi.number().min(0).default(0),
        young: Joi.number().min(0).default(0),
        female: Joi.number().min(0).default(0),
        treated: Joi.number().min(0).default(0)
      }).optional(),
      horse: Joi.object({
        total: Joi.number().min(0).default(0),
        young: Joi.number().min(0).default(0),
        female: Joi.number().min(0).default(0),
        treated: Joi.number().min(0).default(0)
      }).optional()
    }).required(),
    insecticide: Joi.object({
      type: Joi.string().max(100).required(),
      method: Joi.string().max(100).required(),
      volumeMl: Joi.number().min(0).required(),
      status: Joi.string().valid('Sprayed', 'Not Sprayed').required(),
      category: Joi.string().max(50).required()
    }).required(),
    animalBarnSizeSqM: Joi.number().min(0).required(),
    breedingSites: Joi.string().max(500).optional(),
    parasiteControlVolume: Joi.number().min(0).required(),
    parasiteControlStatus: Joi.string().max(100).required(),
    herdHealthStatus: Joi.string().valid('Healthy', 'Sick', 'Under Treatment').required(),
    complyingToInstructions: Joi.boolean().default(true),
    request: Joi.object({
      date: Joi.date().required(),
      situation: Joi.string().valid('Open', 'Closed', 'Pending').required(),
      fulfillingDate: Joi.date().optional()
    }).required(),
    remarks: Joi.string().max(1000).optional()
  }),

  // Vaccination schemas
  vaccinationCreate: Joi.object({
    serialNo: Joi.string().max(20).required(),
    date: Joi.date().max('now').required(),
    client: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    farmLocation: Joi.string().max(200).required(),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90).optional(),
      longitude: Joi.number().min(-180).max(180).optional()
    }).optional(),
    supervisor: Joi.string().max(100).required(),
    team: Joi.string().max(100).required(),
    vehicleNo: Joi.string().max(20).required(),
    vaccineType: Joi.string().max(100).required(),
    vaccineCategory: Joi.string().valid('Preventive', 'Emergency').required(),
    herdCounts: Joi.object({
      sheep: Joi.object({
        total: Joi.number().min(0).default(0),
        young: Joi.number().min(0).default(0),
        female: Joi.number().min(0).default(0),
        vaccinated: Joi.number().min(0).default(0)
      }).optional(),
      goats: Joi.object({
        total: Joi.number().min(0).default(0),
        young: Joi.number().min(0).default(0),
        female: Joi.number().min(0).default(0),
        vaccinated: Joi.number().min(0).default(0)
      }).optional(),
      camel: Joi.object({
        total: Joi.number().min(0).default(0),
        young: Joi.number().min(0).default(0),
        female: Joi.number().min(0).default(0),
        vaccinated: Joi.number().min(0).default(0)
      }).optional(),
      cattle: Joi.object({
        total: Joi.number().min(0).default(0),
        young: Joi.number().min(0).default(0),
        female: Joi.number().min(0).default(0),
        vaccinated: Joi.number().min(0).default(0)
      }).optional(),
      horse: Joi.object({
        total: Joi.number().min(0).default(0),
        young: Joi.number().min(0).default(0),
        female: Joi.number().min(0).default(0),
        vaccinated: Joi.number().min(0).default(0)
      }).optional()
    }).required(),
    herdHealth: Joi.string().valid('Healthy', 'Sick', 'Under Treatment').required(),
    animalsHandling: Joi.string().valid('Easy', 'Difficult').required(),
    labours: Joi.string().valid('Available', 'Not Available').required(),
    reachableLocation: Joi.string().valid('Easy', 'Hard to reach').required(),
    request: Joi.object({
      date: Joi.date().required(),
      situation: Joi.string().valid('Open', 'Closed', 'Pending').required(),
      fulfillingDate: Joi.date().optional()
    }).required(),
    remarks: Joi.string().max(1000).optional()
  }),

  // Laboratory schemas
  laboratoryCreate: Joi.object({
    sampleCode: Joi.string().max(20).required(),
    sampleType: Joi.string().valid('Blood', 'Serum', 'Urine', 'Feces', 'Milk', 'Tissue', 'Swab', 'Hair', 'Skin').required(),
    collector: Joi.string().max(100).required(),
    date: Joi.date().max('now').required(),
    client: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    farmLocation: Joi.string().max(200).required(),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90).optional(),
      longitude: Joi.number().min(-180).max(180).optional()
    }).optional(),
    speciesCounts: Joi.object({
      sheep: Joi.number().min(0).default(0),
      goats: Joi.number().min(0).default(0),
      camel: Joi.number().min(0).default(0),
      cattle: Joi.number().min(0).default(0),
      horse: Joi.number().min(0).default(0)
    }).optional(),
    testType: Joi.string().valid('Parasitology', 'Bacteriology', 'Virology', 'Serology', 'Biochemistry', 'Hematology', 'Pathology').required(),
    positiveCases: Joi.number().min(0).default(0),
    negativeCases: Joi.number().min(0).default(0),
    priority: Joi.string().valid('Low', 'Normal', 'High', 'Urgent').default('Normal'),
    expectedCompletionDate: Joi.date().optional(),
    laboratoryTechnician: Joi.string().max(100).optional(),
    equipment: Joi.string().max(100).optional(),
    remarks: Joi.string().max(1000).optional()
  }),

  // Common query schemas
  paginationQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().optional(),
    search: Joi.string().optional()
  }),

  dateRangeQuery: Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10)
  })
};

module.exports = {
  validate,
  validateQuery,
  schemas
};
