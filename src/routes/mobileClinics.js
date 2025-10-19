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
        { farmLocation: { $regex: search, $options: 'i' } },
        { diagnosis: { $regex: search, $options: 'i' } }
      ];
    }

    // Get records with error handling
    let records;
    try {
      records = await MobileClinic.find(filter)
        .populate('client', 'name nationalId phone village detailedAddress birthDate')
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
    }).populate('client', 'name nationalId phone village birthDate');

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
        'Location': record.farmLocation || '',
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
        'Location': record.farmLocation || '',
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
        farmLocation: 'مزرعة الشمري',
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

module.exports = router;
