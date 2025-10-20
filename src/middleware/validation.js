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
  }),

  userLogin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  userUpdate: Joi.object({
    name: Joi.string().min(2).max(50).optional(),
    email: Joi.string().email().optional(),
    role: Joi.string().valid('super_admin', 'section_supervisor', 'field_worker').optional(),
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
    date: Joi.date().max('now').optional(),
    client: Joi.alternatives().try(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/), // ObjectId string
      Joi.object({
        name: Joi.string().required(),
        nationalId: Joi.string().required(),
        phone: Joi.string().optional(),
        village: Joi.string().optional()
      }) // Client object for create/update
    ).required(),
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
    holdingCode: Joi.string().optional(),
    herdHealthStatus: Joi.string().valid('Healthy', 'Sick', 'ٍSporadic Cases').required(),
    complyingToInstructions: Joi.string().valid('Comply', 'Not Comply', 'Partially Comply').default('Comply'),
    request: Joi.object({
      date: Joi.date().optional(),
      situation: Joi.string().valid('Ongoing', 'Closed').required(),
      fulfillingDate: Joi.date().optional()
    }).required(),
    remarks: Joi.string().max(1000).optional()
  }),

  // Vaccination schemas
  vaccinationCreate: Joi.object({
    serialNo: Joi.string().max(20).required(),
    date: Joi.date().max('now').optional(),
    client: Joi.alternatives().try(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/), // ObjectId string
      Joi.object({
        _id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
        name: Joi.string().required(),
        nationalId: Joi.string().required(),
        phone: Joi.string().allow('').optional(),
        village: Joi.string().allow('').optional(),
        birthDate: Joi.date().optional()
      }), // Full client object
      Joi.string().valid('temp-client-id') // Temporary ID for client creation
    ).required(),
    clientData: Joi.object({
      name: Joi.string().required(),
      nationalId: Joi.string().required(),
      phone: Joi.string().required(),
      village: Joi.string().optional(),
      birthDate: Joi.date().optional()
    }).optional(),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90).optional(),
      longitude: Joi.number().min(-180).max(180).optional()
    }).optional(),
    supervisor: Joi.string().max(100).required(),
    vehicleNo: Joi.string().max(20).required(),
    vaccineType: Joi.string().max(100).required(),
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
    herdHealth: Joi.string().valid('Healthy', 'Sick', 'Sporadic Cases').required(),
    animalsHandling: Joi.string().valid('Easy', 'Difficult').required(),
    labours: Joi.string().valid('Available', 'Not Available', 'Not Helpful').required(),
    reachableLocation: Joi.string().valid('Easy', 'Hard to reach' , 'Moderate').required(),
    request: Joi.object({
      date: Joi.date().optional(),
      situation: Joi.string().valid('Ongoing', 'Closed').required(),
      fulfillingDate: Joi.date().optional()
    }).required(),
    remarks: Joi.string().max(1000).optional()
  }),

  // Laboratory schemas - Updated to match table structure
  laboratoryCreate: Joi.object({
    serialNo: Joi.number().integer().min(0).required(),
    date: Joi.date().max('now').optional(),
    sampleCode: Joi.string().max(20).required(),
    clientName: Joi.string().min(2).max(100).required(),
    clientId: Joi.string().pattern(/^\d{9,10}$/).required(),
    clientBirthDate: Joi.date().optional(),
    clientPhone: Joi.string().pattern(/^05\d{8}$/).required(),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90).optional(),
      longitude: Joi.number().min(-180).max(180).optional()
    }).optional(),
    speciesCounts: Joi.object({
      sheep: Joi.number().min(0).default(0),
      goats: Joi.number().min(0).default(0),
      camel: Joi.number().min(0).default(0),
      cattle: Joi.number().min(0).default(0),
      horse: Joi.number().min(0).default(0),
      other: Joi.string().max(100).allow('').optional()
    }).required(),
    collector: Joi.string().max(100).required(),
    sampleType: Joi.string().valid('Serum', 'Whole Blood', 'Fecal Sample', 'Skin Scrape').required(),
    sampleNumber: Joi.string().max(20).required(),
    positiveCases: Joi.number().min(0).default(0),
    negativeCases: Joi.number().min(0).default(0),
    remarks: Joi.string().max(1000).optional()
  }),

  // Mobile Clinic schemas
  mobileClinicCreate: Joi.object({
    serialNo: Joi.string().max(20).required(),
    date: Joi.date().max('now').optional(),
    // Client data can be provided as flat fields or as client object
    client: Joi.alternatives().try(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/), // ObjectId string
      Joi.object({
        name: Joi.string().required(),
        nationalId: Joi.string().required(),
        phone: Joi.string().allow('').optional(),
        village: Joi.string().allow('').optional(),
        birthDate: Joi.date().optional()
      }) // Client object for create/update
    ).optional(),
    // Flat client fields (alternative to client object)
    clientName: Joi.string().min(2).max(100).optional(),
    clientId: Joi.string().pattern(/^\d{9,10}$/).optional(),
    clientPhone: Joi.string().pattern(/^05\d{8}$/).allow('').optional(),
    clientBirthDate: Joi.date().optional(),
    clientVillage: Joi.string().max(100).allow('').optional(),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90).optional(),
      longitude: Joi.number().min(-180).max(180).optional()
    }).optional(),
    supervisor: Joi.string().max(100).required(),
    vehicleNo: Joi.string().max(20).optional(),
    animalCounts: Joi.object({
      sheep: Joi.number().min(0).default(0),
      goats: Joi.number().min(0).default(0),
      camel: Joi.number().min(0).default(0),
      cattle: Joi.number().min(0).default(0),
      horse: Joi.number().min(0).default(0)
    }).optional(),
    diagnosis: Joi.string().min(2).max(500).optional(),
    interventionCategory: Joi.string().valid('Clinical Examination', 'Surgical Operation', 'Ultrasonography', 'Lab Analysis', 'Farriery').required(),
    treatment: Joi.string().min(2).max(1000).optional(),
    medication: Joi.object({
      name: Joi.string().max(100).optional(),
      dosage: Joi.string().max(50).optional(),
      quantity: Joi.number().min(0).optional(),
      administrationRoute: Joi.string().max(50).optional()
    }).optional(),
    request: Joi.object({
      date: Joi.date().optional(),
      situation: Joi.string().valid('Ongoing', 'Closed').optional(),
      fulfillingDate: Joi.date().optional()
    }).optional(),
    followUpRequired: Joi.boolean().default(false),
    followUpDate: Joi.date().allow(null).optional(),
    remarks: Joi.string().max(1000).optional()
  }).custom((value, helpers) => {
    // Ensure either client object or flat client fields are provided
    const hasClientObject = value.client;
    const hasFlatClientFields = value.clientName && value.clientId;
    
    if (!hasClientObject && !hasFlatClientFields) {
      return helpers.error('any.custom', {
        message: 'Either client object or flat client fields (clientName, clientId) must be provided'
      });
    }
    
    return value;
  }),

  mobileClinicUpdate: Joi.object({
    serialNo: Joi.string().max(20).optional(),
    date: Joi.date().max('now').optional(),
    // Client data can be provided as flat fields or as client object
    client: Joi.alternatives().try(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/), // ObjectId string
      Joi.object({
        name: Joi.string().required(),
        nationalId: Joi.string().required(),
        phone: Joi.string().allow('').optional(),
        village: Joi.string().allow('').optional(),
        birthDate: Joi.date().optional()
      }) // Client object for create/update
    ).optional(),
    // Flat client fields (alternative to client object)
    clientName: Joi.string().min(2).max(100).optional(),
    clientId: Joi.string().pattern(/^\d{9,10}$/).optional(),
    clientPhone: Joi.string().pattern(/^05\d{8}$/).allow('').optional(),
    clientBirthDate: Joi.date().optional(),
    clientVillage: Joi.string().max(100).allow('').optional(),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90).optional(),
      longitude: Joi.number().min(-180).max(180).optional()
    }).optional(),
    supervisor: Joi.string().max(100).optional(),
    vehicleNo: Joi.string().max(20).optional(),
    animalCounts: Joi.object({
      sheep: Joi.number().min(0).default(0),
      goats: Joi.number().min(0).default(0),
      camel: Joi.number().min(0).default(0),
      cattle: Joi.number().min(0).default(0),
      horse: Joi.number().min(0).default(0)
    }).optional(),
    diagnosis: Joi.string().min(2).max(500).optional(),
    interventionCategory: Joi.string().valid('Clinical Examination', 'Surgical Operation', 'Ultrasonography', 'Lab Analysis', 'Farriery').optional(),
    treatment: Joi.string().min(2).max(1000).optional(),
    medication: Joi.object({
      name: Joi.string().max(100).optional(),
      dosage: Joi.string().max(50).optional(),
      quantity: Joi.number().min(0).optional(),
      administrationRoute: Joi.string().max(50).optional()
    }).optional(),
    request: Joi.object({
      date: Joi.date().optional(),
      situation: Joi.string().valid('Ongoing', 'Closed').optional(),
      fulfillingDate: Joi.date().optional()
    }).optional(),
    followUpRequired: Joi.boolean().optional(),
    followUpDate: Joi.date().allow(null).optional(),
    remarks: Joi.string().max(1000).optional(),
    holdingCode: Joi.string().optional()
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
  }),

  // Parasite Control update schema (all fields optional)
  parasiteControlUpdate: Joi.object({
    serialNo: Joi.string().max(20).optional(),
    date: Joi.date().max('now').optional(),
    client: Joi.alternatives().try(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
      Joi.object({
        name: Joi.string().required(),
        nationalId: Joi.string().required(),
        phone: Joi.string().optional(),
        village: Joi.string().optional()
      })
    ).optional(),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90).optional(),
      longitude: Joi.number().min(-180).max(180).optional()
    }).optional(),
    supervisor: Joi.string().max(100).optional(),
    vehicleNo: Joi.string().max(20).optional(),
    herdCounts: Joi.object().pattern(Joi.string(), Joi.object({
      total: Joi.number().min(0).default(0),
      young: Joi.number().min(0).default(0),
      female: Joi.number().min(0).default(0),
      treated: Joi.number().min(0).default(0)
    })).optional(),
    insecticide: Joi.object({
      type: Joi.string().max(100).optional(),
      method: Joi.string().max(100).optional(),
      volumeMl: Joi.number().min(0).optional(),
      status: Joi.string().valid('Sprayed', 'Not Sprayed').optional(),
      category: Joi.string().max(50).optional()
    }).optional(),
    animalBarnSizeSqM: Joi.number().min(0).optional(),
    breedingSites: Joi.string().max(500).optional(),
    holdingCode: Joi.string().optional(),
    herdHealthStatus: Joi.string().valid('Healthy', 'Sick', 'Sporadic Cases').optional(),
    complyingToInstructions: Joi.string().valid('Comply', 'Not Comply', 'Partially Comply').optional(),
    request: Joi.object({
      date: Joi.date().optional(),
      situation: Joi.string().valid('Ongoing', 'Closed').optional(),
      fulfillingDate: Joi.date().optional()
    }).optional(),
    remarks: Joi.string().max(1000).optional()
  }),

  // Village schemas
  villageCreate: Joi.object({
    serialNumber: Joi.string().min(1).max(50).required(),
    sector: Joi.string().min(2).max(100).required(),
    nameArabic: Joi.string().min(2).max(100).required(),
    nameEnglish: Joi.string().min(2).max(100).required(),
    isActive: Joi.boolean().default(true)
  }),

  villageUpdate: Joi.object({
    serialNumber: Joi.string().min(1).max(50).optional(),
    sector: Joi.string().min(2).max(100).optional(),
    nameArabic: Joi.string().min(2).max(100).optional(),
    nameEnglish: Joi.string().min(2).max(100).optional(),
    isActive: Joi.boolean().optional()
  }),

  villageQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
    search: Joi.string().optional(),
    sector: Joi.string().optional(),
    isActive: Joi.boolean().optional()
  }),

  // Equine Health schemas
  equineHealthCreate: Joi.object({
    serialNo: Joi.string().max(20).optional(),
    date: Joi.date().max('now').optional(),
    client: Joi.object({
      name: Joi.string().min(2).max(100).required(),
      nationalId: Joi.string().pattern(/^\d{10,14}$/).required(),
      birthDate: Joi.date().optional(),
      phone: Joi.string().pattern(/^(\+966|0)?[5][0-9]{8}$/).required(),
      village: Joi.string().min(2).max(100).required(),
    }).required(),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90).optional(),
      longitude: Joi.number().min(-180).max(180).optional()
    }).optional(),
    supervisor: Joi.string().min(2).max(100).required(),
    vehicleNo: Joi.string().min(1).max(20).required(),
    horseCount: Joi.number().integer().min(1).required(),
    horseDetails: Joi.array().items(
      Joi.object({
        id: Joi.string().max(20).required(),
        breed: Joi.string().max(50).required(),
        age: Joi.number().integer().min(0).max(50).required(),
        gender: Joi.string().valid('ذكر', 'أنثى', 'مخصي').required(),
        color: Joi.string().max(30).required(),
        healthStatus: Joi.string().valid('سليم', 'مريض', 'تحت العلاج', 'متعافي').required(),
        weight: Joi.number().min(0).max(2000).optional(),
        temperature: Joi.number().min(35).max(45).optional(),
        heartRate: Joi.number().min(20).max(100).optional(),
        respiratoryRate: Joi.number().min(5).max(50).optional()
      })
    ).optional(),
    diagnosis: Joi.string().min(2).max(500).required(),
    interventionCategory: Joi.string().valid('Clinical Examination', 'Ultrasonography', 'Lab Analysis', 'Surgical Operation', 'Farriery').required(),
    treatment: Joi.string().min(2).max(1000).required(),
    medicationsUsed: Joi.array().items(
      Joi.object({
        name: Joi.string().max(100).required(),
        dosage: Joi.string().max(50).optional(),
        quantity: Joi.number().min(0).optional(),
        route: Joi.string().max(50).optional(),
        frequency: Joi.string().max(50).optional(),
        duration: Joi.string().max(50).optional()
      })
    ).optional(),
    request: Joi.object({
      date: Joi.date().required(),
      situation: Joi.string().valid('Ongoing', 'Closed').required(),
      fulfillingDate: Joi.date().optional()
    }).required(),
    followUpRequired: Joi.boolean().default(false),
    followUpDate: Joi.date().optional(),
    vaccinationStatus: Joi.string().valid('Up to date', 'Overdue', 'Not applicable', 'Partial').optional(),
    dewormingStatus: Joi.string().valid('Recent', 'Overdue', 'Not applicable').optional(),
    remarks: Joi.string().max(1000).optional()
  }),

  // Bulk delete schema - accepts serial numbers instead of ObjectIds
  bulkDeleteSchema: Joi.object({
    ids: Joi.array().items(Joi.string().min(1).max(50)).min(1).required()
  })
};

// Village validation functions
const validateVillage = validate(schemas.villageCreate);
const validateVillageUpdate = validate(schemas.villageUpdate);
const validateVillageQuery = validateQuery(schemas.villageQuery);

module.exports = {
  validate,
  validateQuery,
  schemas,
  validateVillage,
  validateVillageUpdate,
  validateVillageQuery
};
