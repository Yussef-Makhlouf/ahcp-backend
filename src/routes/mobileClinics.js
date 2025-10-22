const express = require('express');
const MobileClinic = require('../models/MobileClinic');
const Client = require('../models/Client');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { checkSectionAccessWithMessage } = require('../middleware/sectionAuth');
const { findOrCreateClient, parseFileData } = require('../utils/importExportHelpers');

const router = express.Router();

/**
 * @swagger
 * /api/mobile-clinics:
 *   get:
 *     summary: Get all mobile clinic records
 *     tags: [Mobile Clinics]
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
 *           enum: [Emergency, Routine, Preventive, Follow-up]
 *         description: Filter by intervention category
 *       - in: query
 *         name: followUpRequired
 *         schema:
 *           type: boolean
 *         description: Filter by follow-up requirement
 *     responses:
 *       200:
 *         description: Records retrieved successfully
 */
router.get('/',
  auth,
  validateQuery(schemas.dateRangeQuery),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 30, startDate, endDate, interventionCategory, followUpRequired, supervisor, search } = req.query;
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
    if (followUpRequired !== undefined) filter.followUpRequired = followUpRequired === 'true';
    if (supervisor) filter.supervisor = { $regex: supervisor, $options: 'i' };
    if (search) {
      filter.$or = [
        { serialNo: { $regex: search, $options: 'i' } },
        { supervisor: { $regex: search, $options: 'i' } },
        { vehicleNo: { $regex: search, $options: 'i' } },
        { diagnosis: { $regex: search, $options: 'i' } }
      ];
    }

    // Get records with error handling
    let records;
    try {
      records = await MobileClinic.find(filter)
        .populate({
          path: 'client',
          select: 'name nationalId phone village detailedAddress birthDate',
          populate: {
            path: 'village',
            select: 'nameArabic nameEnglish sector serialNumber'
          }
        })
        .populate('holdingCode', 'code village description isActive')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ date: -1 })
        .lean(); // Use lean() for better performance
    } catch (populateError) {
      console.error('Populate error, falling back to basic query:', populateError);
      // Fallback without populate if there's an issue
      records = await MobileClinic.find(filter)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ date: -1 })
        .lean();
    }

    const total = await MobileClinic.countDocuments(filter);

    res.json({
      success: true,
      data: records,
      total: total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    });
  })
);

/**
 * @swagger
 * /api/mobile-clinics:
 *   post:
 *     summary: Create a new mobile clinic record
 *     tags: [Mobile Clinics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - serialNo
 *               - date
 *               - clientName
 *               - clientId
 *               - clientPhone
 *               - supervisor
 *               - interventionCategory
 *             properties:
 *               serialNo:
 *                 type: string
 *                 description: Serial number
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Record date
 *               clientName:
 *                 type: string
 *                 description: Client name
 *               clientId:
 *                 type: string
 *                 description: Client national ID
 *               clientPhone:
 *                 type: string
 *                 description: Client phone number
 *               clientBirthDate:
 *                 type: string
 *                 format: date
 *                 description: Client birth date
 *               farmLocation:
 *                 type: string
 *                 description: Farm location
 *               supervisor:
 *                 type: string
 *                 description: Supervisor name
 *               vehicleNo:
 *                 type: string
 *                 description: Vehicle number
 *               animalCounts:
 *                 type: object
 *                 properties:
 *                   sheep:
 *                     type: number
 *                   goats:
 *                     type: number
 *                   camel:
 *                     type: number
 *                   cattle:
 *                     type: number
 *                   horse:
 *                     type: number
 *               diagnosis:
 *                 type: string
 *                 description: Medical diagnosis
 *               interventionCategory:
 *                 type: string
 *                 enum: [Emergency, Routine, Preventive, Follow-up]
 *                 description: Type of intervention
 *               treatment:
 *                 type: string
 *                 description: Treatment provided
 *               followUpRequired:
 *                 type: boolean
 *                 description: Whether follow-up is required
 *               followUpDate:
 *                 type: string
 *                 format: date
 *                 description: Follow-up date
 *               remarks:
 *                 type: string
 *                 description: Additional remarks
 *     responses:
 *       201:
 *         description: Mobile clinic record created successfully
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Server error
 */
router.post('/',
  auth,
  checkSectionAccessWithMessage('mobile_clinics'),
  validate(schemas.mobileClinicCreate),
  asyncHandler(async (req, res) => {
    try {
      console.log('📝 Creating mobile clinic record with data:', JSON.stringify(req.body, null, 2));
      console.log('🔍 Validation passed, proceeding with creation...');
      console.log('👤 Client data check:');
      console.log('  - req.body.client:', req.body.client);
      console.log('  - req.body.clientName:', req.body.clientName);
      console.log('  - req.body.clientId:', req.body.clientId);
      console.log('  - req.body.interventionCategory:', req.body.interventionCategory);

      // Handle client data - support both flat structure and client reference
      let clientData = null;
      if (req.body.client && typeof req.body.client === 'object') {
        // Client reference provided
        clientData = req.body.client;
      } else if (req.body.clientName && req.body.clientId) {
        // Flat client data provided - try to find or create client
        try {
          clientData = await findOrCreateClient({
            name: req.body.clientName,
            nationalId: req.body.clientId,
            phone: req.body.clientPhone,
            birthDate: req.body.clientBirthDate,
            village: req.body.clientVillage || '',
            detailedAddress: req.body.clientDetailedAddress || ''
          });
        } catch (clientError) {
          console.log('⚠️ Client creation failed, using flat structure:', clientError.message);
          // Continue with flat structure if client creation fails
        }
      }

      // Prepare mobile clinic data
      const mobileClinicData = {
        serialNo: req.body.serialNo,
        date: req.body.date || new Date(),
        supervisor: req.body.supervisor,
        vehicleNo: req.body.vehicleNo,
        
        // Animal counts
        animalCounts: {
          sheep: req.body.animalCounts?.sheep || req.body.sheep || 0,
          goats: req.body.animalCounts?.goats || req.body.goats || 0,
          camel: req.body.animalCounts?.camel || req.body.camel || 0,
          cattle: req.body.animalCounts?.cattle || req.body.cattle || 0,
          horse: req.body.animalCounts?.horse || req.body.horse || 0
        },

        // Medical information
        diagnosis: req.body.diagnosis,
        interventionCategory: req.body.interventionCategory,
        treatment: req.body.treatment,

        // Medication information
        medication: {
          name: req.body.medication?.name || req.body.medicationName,
          dosage: req.body.medication?.dosage || req.body.dosage,
          quantity: req.body.medication?.quantity || req.body.quantity,
          administrationRoute: req.body.medication?.administrationRoute || req.body.administrationRoute
        },

        // Request information
        request: {
          date: req.body.request?.date || req.body.requestDate,
          situation: req.body.request?.situation || req.body.requestSituation,
          fulfillingDate: req.body.request?.fulfillingDate || req.body.requestFulfillingDate
        },

        // Follow-up information
        followUpRequired: req.body.followUpRequired || false,
        followUpDate: req.body.followUpDate,

        // Location coordinates
        coordinates: {
          latitude: req.body.coordinates?.latitude || req.body.latitude,
          longitude: req.body.coordinates?.longitude || req.body.longitude
        },

        // Additional information
        remarks: req.body.remarks,
        createdBy: req.user._id
      };

      // Add client reference or flat client data
      if (clientData && clientData._id) {
        mobileClinicData.client = clientData._id;
      } else {
        // Use flat structure for client data
        mobileClinicData.clientName = req.body.clientName;
        mobileClinicData.clientId = req.body.clientId;
        mobileClinicData.clientPhone = req.body.clientPhone;
        mobileClinicData.clientBirthDate = req.body.clientBirthDate;
        mobileClinicData.clientVillage = req.body.clientVillage;
        mobileClinicData.clientDetailedAddress = req.body.clientDetailedAddress;
      }

      // Process holding code if provided
      let holdingCodeId = null;
      if (req.body.holdingCode && req.body.holdingCode.trim() !== '') {
        const mongoose = require('mongoose');
        if (mongoose.Types.ObjectId.isValid(req.body.holdingCode)) {
          holdingCodeId = req.body.holdingCode;
        } else {
          // If it's a code string, find the holding code by code
          const HoldingCode = require('../models/HoldingCode');
          const holdingCode = await HoldingCode.findOne({ code: req.body.holdingCode.trim() });
          if (holdingCode) {
            holdingCodeId = holdingCode._id;
          }
        }
      }
      console.log('🔍 Holding code processing:', req.body.holdingCode, '→', holdingCodeId);
      
      // Add holding code to mobile clinic data
      mobileClinicData.holdingCode = holdingCodeId;

      console.log('💾 Saving mobile clinic data:', mobileClinicData);

      // Create the mobile clinic record
      const mobileClinic = new MobileClinic(mobileClinicData);
      const savedRecord = await mobileClinic.save();

      // Populate holding code for proper display
      await savedRecord.populate('holdingCode', 'code village description isActive');

      console.log('✅ Mobile clinic record created successfully:', savedRecord._id);

      res.status(201).json({
        success: true,
        message: 'Mobile clinic record created successfully',
        data: savedRecord
      });

    } catch (error) {
      console.error('❌ Error creating mobile clinic record:', error);
      
      // Handle validation errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }));
        
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: validationErrors
        });
      }

      // Handle duplicate key errors
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return res.status(400).json({
          success: false,
          message: `${field} already exists`,
          field: field
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error creating mobile clinic record',
        error: error.message
      });
    }
  })
);

/**
 * @swagger
 * /api/mobile-clinics/statistics:
 *   get:
 *     summary: Get mobile clinic statistics
 *     tags: [Mobile Clinics]
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
  auth,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    
    const filter = {};
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    try {
      // إحصائيات أساسية
      const totalRecords = await MobileClinic.countDocuments(filter);
      
      // إحصائيات هذا الشهر
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);
      const recordsThisMonth = await MobileClinic.countDocuments({
        ...filter,
        date: { $gte: currentMonth }
      });

      // إجمالي الحيوانات المفحوصة
      let totalAnimalsExamined = 0;
      try {
        const animalStats = await MobileClinic.aggregate([
          { $match: filter },
          {
            $group: {
              _id: null,
              totalAnimals: {
                $sum: {
                  $add: [
                    { $ifNull: ['$animalCounts.sheep', 0] },
                    { $ifNull: ['$animalCounts.goats', 0] },
                    { $ifNull: ['$animalCounts.camel', 0] },
                    { $ifNull: ['$animalCounts.horse', 0] },
                    { $ifNull: ['$animalCounts.cattle', 0] }
                  ]
                }
              }
            }
          }
        ]);
        totalAnimalsExamined = animalStats.length > 0 ? animalStats[0].totalAnimals : 0;
      } catch (aggregationError) {
        console.warn('Animal stats aggregation failed, using fallback:', aggregationError.message);
        // Fallback: get basic count without aggregation
        totalAnimalsExamined = 0;
      }

      // الحالات الطارئة
      const emergencyCases = await MobileClinic.countDocuments({
        ...filter,
        interventionCategory: 'Emergency'
      });

      const statistics = {
        totalRecords,
        recordsThisMonth,
        totalAnimalsExamined,
        emergencyCases
      };

      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      console.error('Error getting mobile clinic statistics:', error);
      
      // Return basic statistics if complex queries fail
      try {
        const basicStats = {
          totalRecords: await MobileClinic.countDocuments(filter),
          recordsThisMonth: 0,
          totalAnimalsExamined: 0,
          emergencyCases: 0
        };
        
        res.json({
          success: true,
          data: basicStats
        });
      } catch (fallbackError) {
        res.status(500).json({
          success: false,
          message: 'Error retrieving statistics',
          error: error.message
        });
      }
    }
  })
);

/**
 * @swagger
 * /api/mobile-clinics/follow-up:
 *   get:
 *     summary: Get records requiring follow-up
 *     tags: [Mobile Clinics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Follow-up records retrieved successfully
 */
router.get('/follow-up',
  auth,
  asyncHandler(async (req, res) => {
    const followUpRecords = await MobileClinic.find({
      followUpRequired: true,
      followUpCompleted: { $ne: true }
    }).populate('client', 'name nationalId phone village birthDate')
      .populate('holdingCode', 'code village description isActive');

    res.json({
      success: true,
      data: followUpRecords
    });
  })
);

/**
 * @swagger
 * /api/mobile-clinics/export:
 *   get:
 *     summary: Export mobile clinic records
 *     tags: [Mobile Clinics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json, excel]
 *         description: Export format
 *       - in: query
 *         name: interventionCategory
 *         schema:
 *           type: string
 *           enum: [Emergency, Routine, Preventive, Follow-up]
 *         description: Filter by intervention category
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
 *         description: Data exported successfully
 */
router.get('/export',
  asyncHandler(async (req, res) => {
    // Add default user for export
    req.user = { _id: 'system', role: 'super_admin', name: 'System Export' };
    const { format = 'json', interventionCategory, startDate, endDate } = req.query;
    
    const filter = {};
    if (interventionCategory) filter.interventionCategory = interventionCategory;
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const records = await MobileClinic.find(filter)
      .populate('client', 'name nationalId phone village detailedAddress birthDate')
      .populate('holdingCode', 'code village description isActive')
      .sort({ date: -1 });

    // Transform data for export
    const transformedRecords = records.map(record => {
      // تحويل animalCounts إلى object بسيط
      const animalCounts = record.animalCounts || {};
      
      // تحويل client إلى object بسيط
      const client = record.client || {};
      
      // تحويل coordinates إلى object بسيط
      const coordinates = record.coordinates || {};
      
      // تحويل request إلى object بسيط
      const request = record.request || {};
      
      return {
        'Serial No': record.serialNo || '',
        'Date': record.date ? record.date.toISOString().split('T')[0] : '',
        'Name': client.name || '',
        'ID': client.nationalId || '',
        'Birth Date': client.birthDate ? new Date(client.birthDate).toISOString().split('T')[0] : '',
        'Phone': client.phone || '',
        'Holding Code': record.holdingCode?.code || '',
        'N Coordinate': coordinates.latitude || '',
        'E Coordinate': coordinates.longitude || '',
        'Supervisor': record.supervisor || '',
        'Vehicle No.': record.vehicleNo || '',
        'Sheep': animalCounts.sheep || 0,
        'Goats': animalCounts.goats || 0,
        'Camel': animalCounts.camel || 0,
        'Horse': animalCounts.horse || 0,
        'Cattle': animalCounts.cattle || 0,
        'Diagnosis': record.diagnosis || '',
        'Intervention Category': record.interventionCategory || '',
        'Treatment': record.treatment || '',
        'Request Date': request.date ? new Date(request.date).toISOString().split('T')[0] : '',
        'Request Status': request.situation || '',
        'Request Fulfilling Date': request.fulfillingDate ? new Date(request.fulfillingDate).toISOString().split('T')[0] : '',
        'Category': record.category || '',
        'Remarks': record.remarks || ''
      };
    });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(transformedRecords);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=mobile-clinics.csv');
      res.send(csv);
    } else if (format === 'excel') {
      const XLSX = require('xlsx');
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(transformedRecords);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Mobile Clinics');
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=mobile-clinics.xlsx');
      res.send(excelBuffer);
    } else {
      res.json({
        success: true,
        data: records
      });
    }
  })
);

// Specific routes must come before parameterized routes
// Export route
router.get('/export',
  asyncHandler(async (req, res) => {
    // Add default user for export
    req.user = { _id: 'system', role: 'super_admin', name: 'System Export' };
    const { format = 'json', interventionCategory, startDate, endDate } = req.query;
    
    const filter = {};
    if (interventionCategory) filter.interventionCategory = interventionCategory;
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const records = await MobileClinic.find(filter)
      .populate('client', 'name nationalId phone village detailedAddress birthDate')
      .populate('holdingCode', 'code village description isActive')
      .sort({ date: -1 });

    // Transform data for export
    const transformedRecords = records.map(record => {
      // تحويل animalCounts إلى object بسيط
      const animalCounts = record.animalCounts || {};
      
      // تحويل client إلى object بسيط
      const client = record.client || {};
      
      // تحويل coordinates إلى object بسيط
      const coordinates = record.coordinates || {};
      
      // تحويل request إلى object بسيط
      const request = record.request || {};
      
      return {
        'Serial No': record.serialNo || '',
        'Date': record.date ? record.date.toISOString().split('T')[0] : '',
        'Name': client.name || '',
        'ID': client.nationalId || '',
        'Birth Date': client.birthDate ? new Date(client.birthDate).toISOString().split('T')[0] : '',
        'Phone': client.phone || '',
        'Holding Code': record.holdingCode?.code || '',
        'N Coordinate': coordinates.latitude || '',
        'E Coordinate': coordinates.longitude || '',
        'Supervisor': record.supervisor || '',
        'Vehicle No.': record.vehicleNo || '',
        'Sheep': animalCounts.sheep || 0,
        'Goats': animalCounts.goats || 0,
        'Camel': animalCounts.camel || 0,
        'Horse': animalCounts.horse || 0,
        'Cattle': animalCounts.cattle || 0,
        'Diagnosis': record.diagnosis || '',
        'Intervention Category': record.interventionCategory || '',
        'Treatment': record.treatment || '',
        'Request Date': request.date ? new Date(request.date).toISOString().split('T')[0] : '',
        'Request Status': request.situation || '',
        'Request Fulfilling Date': request.fulfillingDate ? new Date(request.fulfillingDate).toISOString().split('T')[0] : '',
        'Category': record.category || '',
        'Remarks': record.remarks || ''
      };
    });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(transformedRecords);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=mobile-clinics.csv');
      res.send(csv);
    } else if (format === 'excel') {
      const XLSX = require('xlsx');
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(transformedRecords);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Mobile Clinics');
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=mobile-clinics.xlsx');
      res.send(excelBuffer);
    } else {
      res.json({
        success: true,
        data: records
      });
    }
  })
);

// Template route
router.get('/template',
  asyncHandler(async (req, res) => {
    // Add default user for template
    req.user = { _id: 'system', role: 'super_admin', name: 'System Template' };
    const { Parser } = require('json2csv');
    
    // Template with sample data and required columns
    const templateData = [
      {
        serialNo: 'MC-001',
        date: '2024-01-15',
        clientName: 'محمد أحمد الشمري',
        clientNationalId: '1234567890',
        clientPhone: '+966501234567',
        clientVillage: 'قرية النور',
        supervisor: 'د. محمد علي',
        vehicleNo: 'MC1',
        sheep: 50,
        goats: 30,
        camel: 5,
        cattle: 10,
        horse: 2,
        diagnosis: 'التهاب رئوي',
        interventionCategory: 'Emergency',
        treatment: 'مضادات حيوية وأدوية مضادة للالتهاب',
        requestDate: '2024-01-15',
        requestSituation: 'Open',
        followUpRequired: 'true',
        remarks: 'ملاحظات إضافية'
      }
    ];
    
    const fields = Object.keys(templateData[0]);
    const parser = new Parser({ fields });
    const csv = parser.parse(templateData);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=mobile-clinics-template.csv');
    res.send(csv);
  })
);

// Import route moved to centralized import-export.js

/**
 * @swagger
 * /api/mobile-clinics/bulk-delete:
 *   delete:
 *     summary: Delete multiple mobile clinic records
 *     tags: [Mobile Clinics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of mobile clinic IDs to delete
 *             required:
 *               - ids
 *     responses:
 *       200:
 *         description: Records deleted successfully
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Server error
 */
router.delete('/bulk-delete',
  auth,
  authorize(['super_admin', 'admin']),
  validate(schemas.bulkDeleteSchema),
  asyncHandler(async (req, res) => {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'IDs array is required and must not be empty'
      });
    }

    try {
      // Check if all IDs exist
      const existingRecords = await MobileClinic.find({ _id: { $in: ids } });
      
      if (existingRecords.length !== ids.length) {
        return res.status(400).json({
          success: false,
          message: 'Some records not found',
          found: existingRecords.length,
          requested: ids.length
        });
      }

      // Delete the records
      const result = await MobileClinic.deleteMany({ _id: { $in: ids } });

      res.json({
        success: true,
        message: `${result.deletedCount} mobile clinic records deleted successfully`,
        deletedCount: result.deletedCount
      });
    } catch (error) {
      console.error('Error in bulk delete mobile clinics:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting mobile clinic records',
        error: error.message
      });
    }
  })
);

/**
 * @swagger
 * /api/mobile-clinics/delete-all:
 *   delete:
 *     summary: Delete all mobile clinic records
 *     tags: [Mobile Clinics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All records deleted successfully
 *       500:
 *         description: Server error
 */
router.delete('/delete-all',
  auth,
  authorize(['super_admin']),
  asyncHandler(async (req, res) => {
    try {
      // Get all unique client IDs from mobile clinic records before deletion
      const uniqueClientIds = await MobileClinic.distinct('client');
      console.log(`🔍 Found ${uniqueClientIds.length} unique client IDs in mobile clinic records`);
      
      // Get count before deletion for response
      const totalCount = await MobileClinic.countDocuments();
      
      if (totalCount === 0) {
        return res.json({
          success: true,
          message: 'No mobile clinic records found to delete',
          deletedCount: 0,
          clientsDeleted: 0
        });
      }

      // Delete all mobile clinic records
      const mobileResult = await MobileClinic.deleteMany({});
      console.log(`🗑️ Deleted ${mobileResult.deletedCount} mobile clinic records`);
      
      // Delete associated clients (only those that were created from mobile clinic imports)
      let clientsDeleted = 0;
      if (uniqueClientIds.length > 0) {
        const clientResult = await Client.deleteMany({ 
          _id: { $in: uniqueClientIds.filter(id => id) } // Filter out null/undefined IDs
        });
        clientsDeleted = clientResult.deletedCount;
        console.log(`🗑️ Deleted ${clientsDeleted} associated client records`);
      }

      res.json({
        success: true,
        message: `All mobile clinic records and associated clients deleted successfully`,
        deletedCount: mobileResult.deletedCount,
        clientsDeleted: clientsDeleted,
        details: {
          mobileClinicRecords: mobileResult.deletedCount,
          clientRecords: clientsDeleted
        }
      });
    } catch (error) {
      console.error('Error in delete all mobile clinics:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting all mobile clinic records',
        error: error.message
      });
    }
  })
);

/**
 * @swagger
 * /api/mobile-clinics/{id}:
 *   get:
 *     summary: Get a mobile clinic record by ID
 *     tags: [Mobile Clinics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Mobile clinic record ID
 *     responses:
 *       200:
 *         description: Record retrieved successfully
 *       404:
 *         description: Record not found
 *       500:
 *         description: Server error
 */
router.get('/:id',
  auth,
  asyncHandler(async (req, res) => {
    try {
      const record = await MobileClinic.findById(req.params.id)
        .populate('client', 'name nationalId phone village detailedAddress birthDate')
        .populate('holdingCode', 'code village description isActive');

      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Mobile clinic record not found'
        });
      }

      res.json({
        success: true,
        data: record
      });
    } catch (error) {
      console.error('Error getting mobile clinic record:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving mobile clinic record',
        error: error.message
      });
    }
  })
);

/**
 * @swagger
 * /api/mobile-clinics/{id}:
 *   put:
 *     summary: Update a mobile clinic record
 *     tags: [Mobile Clinics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Mobile clinic record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serialNo:
 *                 type: string
 *                 description: Serial number
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Record date
 *               clientName:
 *                 type: string
 *                 description: Client name
 *               clientId:
 *                 type: string
 *                 description: Client national ID
 *               clientPhone:
 *                 type: string
 *                 description: Client phone number
 *               clientBirthDate:
 *                 type: string
 *                 format: date
 *                 description: Client birth date
 *               farmLocation:
 *                 type: string
 *                 description: Farm location
 *               supervisor:
 *                 type: string
 *                 description: Supervisor name
 *               vehicleNo:
 *                 type: string
 *                 description: Vehicle number
 *               animalCounts:
 *                 type: object
 *                 properties:
 *                   sheep:
 *                     type: number
 *                   goats:
 *                     type: number
 *                   camel:
 *                     type: number
 *                   cattle:
 *                     type: number
 *                   horse:
 *                     type: number
 *               diagnosis:
 *                 type: string
 *                 description: Medical diagnosis
 *               interventionCategory:
 *                 type: string
 *                 enum: [Emergency, Routine, Preventive, Follow-up]
 *                 description: Type of intervention
 *               treatment:
 *                 type: string
 *                 description: Treatment provided
 *               followUpRequired:
 *                 type: boolean
 *                 description: Whether follow-up is required
 *               followUpDate:
 *                 type: string
 *                 format: date
 *                 description: Follow-up date
 *               remarks:
 *                 type: string
 *                 description: Additional remarks
 *     responses:
 *       200:
 *         description: Record updated successfully
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: Record not found
 *       500:
 *         description: Server error
 */
router.put('/:id',
  auth,
  checkSectionAccessWithMessage('mobile_clinics'),
  validate(schemas.mobileClinicUpdate),
  asyncHandler(async (req, res) => {
    try {
      console.log('📝 Updating mobile clinic record:', req.params.id);
      console.log('📝 Update data:', JSON.stringify(req.body, null, 2));

      // Check if record exists
      const existingRecord = await MobileClinic.findById(req.params.id);
      if (!existingRecord) {
        return res.status(404).json({
          success: false,
          message: 'Mobile clinic record not found'
        });
      }

      // Handle client data - support both flat structure and client reference
      let clientData = null;
      if (req.body.client && typeof req.body.client === 'object') {
        // Client reference provided
        clientData = req.body.client;
      } else if (req.body.clientName && req.body.clientId) {
        // Flat client data provided - try to find or create client
        try {
          clientData = await findOrCreateClient({
            name: req.body.clientName,
            nationalId: req.body.clientId,
            phone: req.body.clientPhone,
            birthDate: req.body.clientBirthDate,
            village: req.body.clientVillage || '',
            detailedAddress: req.body.clientDetailedAddress || ''
          });
        } catch (clientError) {
          console.log('⚠️ Client creation failed, using flat structure:', clientError.message);
          // Continue with flat structure if client creation fails
        }
      }

      // Prepare update data
      const updateData = {
        serialNo: req.body.serialNo,
        date: req.body.date,
        supervisor: req.body.supervisor,
        vehicleNo: req.body.vehicleNo,
        
        // Animal counts
        animalCounts: {
          sheep: req.body.animalCounts?.sheep || req.body.sheep || 0,
          goats: req.body.animalCounts?.goats || req.body.goats || 0,
          camel: req.body.animalCounts?.camel || req.body.camel || 0,
          cattle: req.body.animalCounts?.cattle || req.body.cattle || 0,
          horse: req.body.animalCounts?.horse || req.body.horse || 0
        },

        // Medical information
        diagnosis: req.body.diagnosis,
        interventionCategory: req.body.interventionCategory,
        treatment: req.body.treatment,

        // Medication information
        medication: {
          name: req.body.medication?.name || req.body.medicationName,
          dosage: req.body.medication?.dosage || req.body.dosage,
          quantity: req.body.medication?.quantity || req.body.quantity,
          administrationRoute: req.body.medication?.administrationRoute || req.body.administrationRoute
        },

        // Request information
        request: {
          date: req.body.request?.date || req.body.requestDate,
          situation: req.body.request?.situation || req.body.requestSituation,
          fulfillingDate: req.body.request?.fulfillingDate || req.body.requestFulfillingDate
        },

        // Follow-up information
        followUpRequired: req.body.followUpRequired || false,
        followUpDate: req.body.followUpDate,

        // Location coordinates
        coordinates: {
          latitude: req.body.coordinates?.latitude || req.body.latitude,
          longitude: req.body.coordinates?.longitude || req.body.longitude
        },

        // Additional information
        remarks: req.body.remarks,
        updatedBy: req.user._id,
        updatedAt: new Date()
      };

      // Process holding code if provided
      let holdingCodeId = null;
      if (req.body.holdingCode && req.body.holdingCode.trim() !== '') {
        const mongoose = require('mongoose');
        if (mongoose.Types.ObjectId.isValid(req.body.holdingCode)) {
          holdingCodeId = req.body.holdingCode;
        } else {
          // If it's a code string, find the holding code by code
          const HoldingCode = require('../models/HoldingCode');
          const holdingCode = await HoldingCode.findOne({ code: req.body.holdingCode.trim() });
          if (holdingCode) {
            holdingCodeId = holdingCode._id;
          }
        }
      }
      console.log('🔍 Holding code processing (update):', req.body.holdingCode, '→', holdingCodeId);
      
      // Add holding code to update data
      updateData.holdingCode = holdingCodeId;

      // Add client reference or flat client data
      if (clientData && clientData._id) {
        updateData.client = clientData._id;
      } else {
        // Use flat structure for client data
        updateData.clientName = req.body.clientName;
        updateData.clientId = req.body.clientId;
        updateData.clientPhone = req.body.clientPhone;
        updateData.clientBirthDate = req.body.clientBirthDate;
        updateData.clientVillage = req.body.clientVillage;
        updateData.clientDetailedAddress = req.body.clientDetailedAddress;
      }

      console.log('💾 Updating mobile clinic with data:', updateData);

      // Update the record
      const updatedRecord = await MobileClinic.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      ).populate('client', 'name nationalId phone village detailedAddress birthDate')
       .populate('holdingCode', 'code village description isActive');

      console.log('✅ Mobile clinic record updated successfully:', updatedRecord._id);

      res.json({
        success: true,
        message: 'Mobile clinic record updated successfully',
        data: updatedRecord
      });

    } catch (error) {
      console.error('❌ Error updating mobile clinic record:', error);
      
      // Handle validation errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }));
        
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: validationErrors
        });
      }

      // Handle duplicate key errors
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return res.status(400).json({
          success: false,
          message: `${field} already exists`,
          field: field
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error updating mobile clinic record',
        error: error.message
      });
    }
  })
);

/**
 * @swagger
 * /api/mobile-clinics/{id}:
 *   delete:
 *     summary: Delete a mobile clinic record
 *     tags: [Mobile Clinics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Mobile clinic record ID
 *     responses:
 *       200:
 *         description: Record deleted successfully
 *       404:
 *         description: Record not found
 *       500:
 *         description: Server error
 */
router.delete('/:id',
  auth,
  authorize(['super_admin', 'admin']),
  asyncHandler(async (req, res) => {
    try {
      const record = await MobileClinic.findById(req.params.id);
      
      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Mobile clinic record not found'
        });
      }

      await MobileClinic.findByIdAndDelete(req.params.id);

      res.json({
        success: true,
        message: 'Mobile clinic record deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting mobile clinic record:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting mobile clinic record',
        error: error.message
      });
    }
  })
);

module.exports = router;
