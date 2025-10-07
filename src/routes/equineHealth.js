const express = require('express');
const EquineHealth = require('../models/EquineHealth');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { checkSectionAccessWithMessage } = require('../middleware/sectionAuth');
const { handleExport, handleTemplate, handleImport, findOrCreateClient } = require('../utils/importExportHelpers');

// Conditional auth middleware for development
const conditionalAuth = (req, res, next) => {
  // If user is already set by devAuth middleware, skip auth
  if (req.user) {
    return next();
  }
  // Otherwise, use real auth
  return auth(req, res, next);
};

const router = express.Router();

/**
 * @swagger
 * /api/equine-health:
 *   get:
 *     summary: Get all equine health records
 *     tags: [Equine Health]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of records per page
 *       - in: query
 *         name: interventionCategory
 *         schema:
 *           type: string
 *           enum: [Emergency, Routine, Preventive, Follow-up, Breeding, Performance]
 *         description: Filter by intervention category
 *     responses:
 *       200:
 *         description: Records retrieved successfully
 */
router.get('/',
  conditionalAuth,
  validateQuery(schemas.dateRangeQuery),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, startDate, endDate, interventionCategory, supervisor, search } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    if (interventionCategory) filter.interventionCategory = interventionCategory;
    if (supervisor) filter.supervisor = { $regex: supervisor, $options: 'i' };
    if (search) {
      filter.$or = [
        { serialNo: { $regex: search, $options: 'i' } },
        { supervisor: { $regex: search, $options: 'i' } },
        { vehicleNo: { $regex: search, $options: 'i' } },
        { farmLocation: { $regex: search, $options: 'i' } },
        { diagnosis: { $regex: search, $options: 'i' } }
      ];
    }

    // Get records
    const records = await EquineHealth.find(filter)
      .populate('client', 'name nationalId phone village')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ date: -1 });

    const total = await EquineHealth.countDocuments(filter);

    res.json({
      success: true,
      data: {
        records,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  })
);

/**
 * @swagger
 * /api/equine-health/statistics:
 *   get:
 *     summary: Get equine health statistics
 *     tags: [Equine Health]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/statistics',
  conditionalAuth,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    
    const filter = {};
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const statistics = await EquineHealth.getStatistics(filter);
    const breedStats = await EquineHealth.getBreedStats(filter);

    res.json({
      success: true,
      data: { 
        statistics,
        breedStats
      }
    });
  })
);

/**
 * @swagger
 * /api/equine-health/{id}:
 *   get:
 *     summary: Get equine health record by ID
 *     tags: [Equine Health]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Record ID
 *     responses:
 *       200:
 *         description: Record retrieved successfully
 *       404:
 *         description: Record not found
 */
router.get('/:id',
  conditionalAuth,
  asyncHandler(async (req, res) => {
    const record = await EquineHealth.findById(req.params.id)
      .populate('client', 'name nationalId phone village detailedAddress')
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Equine health record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: { record }
    });
  })
);

/**
 * @swagger
 * /api/equine-health:
 *   post:
 *     summary: Create new equine health record
 *     tags: [Equine Health]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EquineHealth'
 *     responses:
 *       201:
 *         description: Record created successfully
 *       400:
 *         description: Validation error
 */
router.post('/',
  conditionalAuth,
  asyncHandler(async (req, res) => {
    // Check if serial number already exists
    const existingRecord = await EquineHealth.findOne({ serialNo: req.body.serialNo });
    if (existingRecord) {
      return res.status(400).json({
        success: false,
        message: 'Serial number already exists',
        error: 'SERIAL_NUMBER_EXISTS'
      });
    }

    // Handle client creation/retrieval
    let clientId = req.body.client;
    
    // If client is an object, create or find the client
    if (req.body.client && typeof req.body.client === 'object') {
      const Client = require('../models/Client');
      
      // Try to find existing client by nationalId
      let client = await Client.findOne({ nationalId: req.body.client.nationalId });
      
      if (!client) {
        // Create new client
        client = new Client({
          name: req.body.client.name,
          nationalId: req.body.client.nationalId,
          phone: req.body.client.phone,
          village: req.body.client.village || '',
          detailedAddress: req.body.client.detailedAddress || ''
        });
        await client.save();
      }
      
      clientId = client._id;
    }

    const record = new EquineHealth({
      ...req.body,
      client: clientId,
      createdBy: req.user._id
    });

    await record.save();
    await record.populate('client', 'name nationalId phone village detailedAddress');

    res.status(201).json({
      success: true,
      message: 'Equine health record created successfully',
      data: { record }
    });
  })
);

/**
 * @swagger
 * /api/equine-health/{id}:
 *   put:
 *     summary: Update equine health record
 *     tags: [Equine Health]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EquineHealth'
 *     responses:
 *       200:
 *         description: Record updated successfully
 *       404:
 *         description: Record not found
 */
router.put('/:id',
  auth,
  authorize('super_admin', 'section_supervisor'),
  checkSectionAccessWithMessage('صحة الخيول'),
  asyncHandler(async (req, res) => {
    const record = await EquineHealth.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Equine health record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    // Handle client update
    let clientId = req.body.client;
    
    // If client is an object, create or find the client
    if (req.body.client && typeof req.body.client === 'object') {
      const Client = require('../models/Client');
      
      // Try to find existing client by nationalId
      let client = await Client.findOne({ nationalId: req.body.client.nationalId });
      
      if (!client) {
        // Create new client
        client = new Client({
          name: req.body.client.name,
          nationalId: req.body.client.nationalId,
          phone: req.body.client.phone,
          village: req.body.client.village || '',
          detailedAddress: req.body.client.detailedAddress || ''
        });
        await client.save();
      }
      
      clientId = client._id;
    }

    // Update record
    Object.assign(record, req.body);
    if (clientId) {
      record.client = clientId;
    }
    record.updatedBy = req.user._id;
    await record.save();
    await record.populate('client', 'name nationalId phone village detailedAddress');

    res.json({
      success: true,
      message: 'Equine health record updated successfully',
      data: { record }
    });
  })
);

/**
 * @swagger
 * /api/equine-health/{id}:
 *   delete:
 *     summary: Delete equine health record
 *     tags: [Equine Health]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Record ID
 *     responses:
 *       200:
 *         description: Record deleted successfully
 *       404:
 *         description: Record not found
 */
router.delete('/:id',
  conditionalAuth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const record = await EquineHealth.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Equine health record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    await EquineHealth.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Equine health record deleted successfully'
    });
  })
);

/**
 * @swagger
 * /api/equine-health/statistics:
 *   get:
 *     summary: Get equine health statistics
 *     tags: [Equine Health]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/statistics',
  conditionalAuth,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    
    const filter = {};
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const statistics = await EquineHealth.getStatistics(filter);
    const breedStats = await EquineHealth.getBreedStats(filter);

    res.json({
      success: true,
      data: { 
        statistics,
        breedStats
      }
    });
  })
);

/**
 * @swagger
 * /api/equine-health/export:
 *   get:
 *     summary: Export equine health records to CSV
 *     tags: [Equine Health]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get('/export',
  conditionalAuth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(handleExport(EquineHealth, {}, [
    'serialNo', 'date', 'farmLocation', 'supervisor', 'vehicleNo', 'horseCount',
    'client.name', 'client.nationalId', 'client.phone', 'client.village',
    'diagnosis', 'interventionCategory', 'treatment', 'followUpRequired',
    'request.situation', 'remarks'
  ], 'equine-health-export'))
);

/**
 * @swagger
 * /api/equine-health/template:
 *   get:
 *     summary: Download CSV template for equine health import
 *     tags: [Equine Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV template file
 */
router.get('/template',
  conditionalAuth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(handleTemplate([{
    serialNo: 'EH001',
    date: '2024-01-15',
    clientName: 'محمد أحمد الشمري',
    clientNationalId: '1234567890',
    clientPhone: '+966501234567',
    clientVillage: 'الرياض',
    clientDetailedAddress: 'مزرعة الشمري، طريق الخرج',
    farmLocation: 'مزرعة الخيول الملكية',
    supervisor: 'د. أحمد محمد',
    vehicleNo: 'EH1',
    horseCount: 5,
    diagnosis: 'فحص دوري للخيول',
    interventionCategory: 'Clinical Examination',
    treatment: 'تطعيمات وقائية',
    followUpRequired: 'false',
    requestSituation: 'Open',
    remarks: 'فحص روتيني للخيول'
  }], 'equine-health-template'))
);

/**
 * @swagger
 * /api/equine-health/import:
 *   post:
 *     summary: Import equine health records from CSV
 *     tags: [Equine Health]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Import results
 */
router.post('/import',
  conditionalAuth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(handleImport(EquineHealth, require('../models/Client'), async (row, userId, ClientModel, EquineHealthModel, errors) => {
    try {
      // Required fields validation
      const requiredFields = ['serialNo', 'date', 'clientName', 'farmLocation', 'supervisor', 'vehicleNo', 'horseCount', 'diagnosis'];
      for (const field of requiredFields) {
        if (!row[field] || row[field].toString().trim() === '') {
          errors.push(`الحقل "${field}" مطلوب`);
          return null;
        }
      }

      // Validate date format
      const date = new Date(row.date);
      if (isNaN(date.getTime())) {
        errors.push('تنسيق التاريخ غير صحيح. استخدم YYYY-MM-DD');
        return null;
      }

      // Validate intervention category
      const validCategories = ['Clinical Examination', 'Surgical Operation', 'Ultrasonography', 'Lab Analysis', 'Farriery'];
      if (row.interventionCategory && !validCategories.includes(row.interventionCategory)) {
        errors.push(`فئة التدخل يجب أن تكون إحدى: ${validCategories.join(', ')}`);
        return null;
      }

      // Validate horse count
      const horseCount = parseInt(row.horseCount);
      if (isNaN(horseCount) || horseCount < 1) {
        errors.push('عدد الخيول يجب أن يكون رقماً أكبر من صفر');
        return null;
      }

      // Check if serial number already exists
      const existingRecord = await EquineHealthModel.findOne({ serialNo: row.serialNo });
      if (existingRecord) {
        errors.push(`رقم السجل "${row.serialNo}" موجود مسبقاً`);
        return null;
      }

      // Find or create client
      const client = await findOrCreateClient(ClientModel, {
        name: row.clientName?.trim(),
        nationalId: row.clientNationalId?.trim(),
        phone: row.clientPhone?.trim(),
        village: row.clientVillage?.trim() || '',
        detailedAddress: row.clientDetailedAddress?.trim() || ''
      });

      // Create equine health record
      const equineHealthData = {
        serialNo: row.serialNo.trim(),
        date: date,
        client: client._id,
        farmLocation: row.farmLocation.trim(),
        coordinates: {
          latitude: parseFloat(row.latitude) || 0,
          longitude: parseFloat(row.longitude) || 0
        },
        supervisor: row.supervisor.trim(),
        vehicleNo: row.vehicleNo.trim(),
        horseCount: horseCount,
        diagnosis: row.diagnosis.trim(),
        interventionCategory: row.interventionCategory || 'Clinical Examination',
        treatment: row.treatment?.trim() || '',
        followUpRequired: row.followUpRequired === 'true' || row.followUpRequired === '1',
        request: {
          date: date,
          situation: row.requestSituation || 'Open',
          fulfillingDate: row.requestFulfillingDate ? new Date(row.requestFulfillingDate) : undefined
        },
        remarks: row.remarks?.trim() || '',
        createdBy: userId
      };

      const record = new EquineHealthModel(equineHealthData);
      await record.save();
      await record.populate('client', 'name nationalId phone village detailedAddress');

      return record;
    } catch (error) {
      errors.push(`خطأ في إنشاء السجل: ${error.message}`);
      return null;
    }
  }))
);

module.exports = router;
