const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Laboratory = require('../models/Laboratory');
const Client = require('../models/Client');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { checkSectionAccessWithMessage } = require('../middleware/sectionAuth');
const { handleExport, handleTemplate, handleImport, findOrCreateClient } = require('../utils/importExportHelpers');

const router = express.Router();
// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `import-${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB limit - increased for large files
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    const allowedExtensions = ['.csv', '.xlsx', '.xls'];
    
    const hasValidMimeType = allowedMimeTypes.includes(file.mimetype);
    const hasValidExtension = allowedExtensions.some(ext => 
      file.originalname.toLowerCase().endsWith(ext)
    );
    
    if (hasValidMimeType || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed (.csv, .xlsx, .xls)'));
    }
  }
});

/**
 * @swagger
 * /api/laboratories:
 *   get:
 *     summary: Get all laboratory records
 *     tags: [Laboratory]
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
 *         name: testStatus
 *         schema:
 *           type: string
 *           enum: [Pending, In Progress, Completed, Failed]
 *         description: Filter by test status
 *       - in: query
 *         name: testType
 *         schema:
 *           type: string
 *         description: Filter by test type
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [Low, Normal, High, Urgent]
 *         description: Filter by priority
 *     responses:
 *       200:
 *         description: Records retrieved successfully
 */
router.get('/',
  auth,
  validateQuery(schemas.paginationQuery),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 30, testStatus, testType, priority, search } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (testStatus) filter.testStatus = testStatus;
    if (testType) filter.testType = testType;
    if (priority) filter.priority = priority;
    if (search) {
      filter.$or = [
        { sampleCode: { $regex: search, $options: 'i' } },
        { collector: { $regex: search, $options: 'i' } },
        { farmLocation: { $regex: search, $options: 'i' } },
        { laboratoryTechnician: { $regex: search, $options: 'i' } }
      ];
    }

    // Get records with error handling
    let records;
    try {
      records = await Laboratory.find(filter)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ date: -1, priority: -1 })
        .lean(); // Use lean() for better performance
    } catch (populateError) {
      console.error('Populate error, falling back to basic query:', populateError);
      // Fallback without populate if there's an issue
      records = await Laboratory.find(filter)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ date: -1, priority: -1 })
        .lean();
    }

    const total = await Laboratory.countDocuments(filter);

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
 * /api/laboratories/statistics:
 *   get:
 *     summary: Get laboratory statistics
 *     tags: [Laboratory]
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
      const totalSamples = await Laboratory.countDocuments(filter);
      
      // إحصائيات هذا الشهر
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);
      const samplesThisMonth = await Laboratory.countDocuments({
        ...filter,
        date: { $gte: currentMonth }
      });

      // الحالات الإيجابية والسلبية - جمع من الحقول المباشرة
      const aggregationResult = await Laboratory.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalPositiveCases: { $sum: '$positiveCases' },
            totalNegativeCases: { $sum: '$negativeCases' },
            totalTestSamples: { $sum: { $add: ['$positiveCases', '$negativeCases'] } }
          }
        }
      ]);

      const result = aggregationResult[0] || { 
        totalPositiveCases: 0, 
        totalNegativeCases: 0, 
        totalTestSamples: 0 
      };

      const positiveCases = result.totalPositiveCases;
      const negativeCases = result.totalNegativeCases;
      const totalTestSamples = result.totalTestSamples;
      
      const positivityRate = totalTestSamples > 0 ? 
        parseFloat(((positiveCases / totalTestSamples) * 100).toFixed(2)) : 0;

      // إحصائيات إضافية
      const pendingTests = await Laboratory.countDocuments({
        ...filter,
        testStatus: 'Pending'
      });

      const completedTests = await Laboratory.countDocuments({
        ...filter,
        testStatus: 'Completed'
      });

      const inProgressTests = await Laboratory.countDocuments({
        ...filter,
        testStatus: 'In Progress'
      });

      const statistics = {
        totalSamples,
        samplesThisMonth,
        positiveCases,
        negativeCases,
        positivityRate,
        pendingTests,
        completedTests,
        inProgressTests,
        totalTestSamples
      };

      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      console.error('Error getting laboratory statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving statistics',
        error: error.message
      });
    }
  })
);

/**
 * @swagger
 * /api/laboratories/pending:
 *   get:
 *     summary: Get pending laboratory tests
 *     tags: [Laboratory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending tests retrieved successfully
 */
router.get('/pending',
  auth,
  asyncHandler(async (req, res) => {
    const pendingTests = await Laboratory.find({
      testStatus: { $in: ['Pending', 'In Progress'] }
    });

    res.json({
      success: true,
      data: pendingTests
    });
  })
);

/**
 * @swagger
 * /api/laboratories/overdue:
 *   get:
 *     summary: Get overdue laboratory tests
 *     tags: [Laboratory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Overdue tests retrieved successfully
 */
router.get('/overdue',
  auth,
  asyncHandler(async (req, res) => {
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 7); // 7 days overdue

    const overdueTests = await Laboratory.find({
      testStatus: { $in: ['Pending', 'In Progress'] },
      date: { $lt: overdueDate }
    });

    res.json({
      success: true,
      data: overdueTests
    });
  })
);

/**
 * @swagger
 * /api/laboratories/export:
 *   get:
 *     summary: Export laboratory records
 *     tags: [Laboratory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *         description: Export format
 *       - in: query
 *         name: testStatus
 *         schema:
 *           type: string
 *           enum: [Pending, In Progress, Completed, Failed]
 *         description: Filter by test status
 *     responses:
 *       200:
 *         description: Data exported successfully
 */
router.get('/export',
  asyncHandler(async (req, res) => {
    // Add default user for export
    req.user = { _id: 'system', role: 'super_admin', name: 'System Export' };
    const { format = 'json', testStatus } = req.query;
    
    const filter = {};
    if (testStatus) filter.testStatus = testStatus;

    const records = await Laboratory.find(filter)
      .sort({ date: -1 });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const fields = [
        'sampleCode',
        'sampleType',
        'collector',
        'date',
        'client.name',
        'client.nationalId',
        'farmLocation',
        'testType',
        'totalSamples',
        'positiveCases',
        'negativeCases',
        'positiveRate',
        'testStatus',
        'priority',
        'laboratoryTechnician'
      ];
      
      const parser = new Parser({ fields });
      const csv = parser.parse(records);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=laboratory-records.csv');
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: records
      });
    }
  })
);

/**
 * @swagger
 * /api/laboratories/{id}:
 *   get:
 *     summary: Get laboratory record by ID
 *     tags: [Laboratory]
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
  auth,
  asyncHandler(async (req, res) => {
    const record = await Laboratory.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Laboratory record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: record
    });
  })
);

/**
 * @swagger
 * /api/laboratories:
 *   post:
 *     summary: Create new laboratory record
 *     tags: [Laboratory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Laboratory'
 *     responses:
 *       201:
 *         description: Record created successfully
 *       400:
 *         description: Validation error
 */
router.post('/',
  auth,
  validate(schemas.laboratoryCreate),
  asyncHandler(async (req, res) => {
    // Check if sample code already exists
    const existingRecord = await Laboratory.findOne({ sampleCode: req.body.sampleCode });
    if (existingRecord) {
      return res.status(400).json({
        success: false,
        message: 'Sample code already exists',
        error: 'SAMPLE_CODE_EXISTS'
      });
    }

    const record = new Laboratory({
      ...req.body,
      createdBy: req.user._id
    });

    await record.save();
    await record;

    res.status(201).json({
      success: true,
      message: 'Laboratory record created successfully',
      data: { record }
    });
  })
);

/**
 * @swagger
 * /api/laboratories/{id}:
 *   put:
 *     summary: Update laboratory record
 *     tags: [Laboratory]
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
 *             $ref: '#/components/schemas/Laboratory'
 *     responses:
 *       200:
 *         description: Record updated successfully
 *       404:
 *         description: Record not found
 */
router.put('/:id',
  auth,
  authorize('super_admin', 'section_supervisor'),
  checkSectionAccessWithMessage('المختبرات'),
  validate(schemas.laboratoryCreate),
  asyncHandler(async (req, res) => {
    const record = await Laboratory.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Laboratory record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    // Check if sample code is being changed and if it already exists
    if (req.body.sampleCode !== record.sampleCode) {
      const existingRecord = await Laboratory.findOne({ 
        sampleCode: req.body.sampleCode,
        _id: { $ne: req.params.id }
      });
      if (existingRecord) {
        return res.status(400).json({
          success: false,
          message: 'Sample code already exists',
          error: 'SAMPLE_CODE_EXISTS'
        });
      }
    }

    // Update record
    Object.assign(record, req.body);
    record.updatedBy = req.user._id;
    await record.save();
    await record;

    res.json({
      success: true,
      message: 'Laboratory record updated successfully',
      data: { record }
    });
  })
);

/**
 * @swagger
 * /api/laboratories/{id}/results:
 *   put:
 *     summary: Update test results
 *     tags: [Laboratory]
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
 *             type: object
 *             properties:
 *               testResults:
 *                 type: array
 *                 items:
 *                   type: object
 *               positiveCases:
 *                 type: number
 *               negativeCases:
 *                 type: number
 *               testStatus:
 *                 type: string
 *                 enum: [Pending, In Progress, Completed, Failed]
 *     responses:
 *       200:
 *         description: Results updated successfully
 *       404:
 *         description: Record not found
 */
router.put('/:id/results',
  auth,
  authorize('super_admin', 'section_supervisor', 'field_worker'),
  asyncHandler(async (req, res) => {
    const record = await Laboratory.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Laboratory record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    const { testResults, positiveCases, negativeCases, testStatus } = req.body;

    // Update results
    if (testResults) record.testResults = testResults;
    if (positiveCases !== undefined) record.positiveCases = positiveCases;
    if (negativeCases !== undefined) record.negativeCases = negativeCases;
    if (testStatus) record.testStatus = testStatus;
    
    record.updatedBy = req.user._id;
    await record.save();

    res.json({
      success: true,
      message: 'Test results updated successfully',
      data: { record }
    });
  })
);

/**
 * @swagger
 * /api/laboratories/bulk-delete:
 *   delete:
 *     summary: Delete multiple laboratory records
 *     tags: [Laboratory]
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
 *                 description: Array of record IDs to delete
 *     responses:
 *       200:
 *         description: Records deleted successfully
 *       400:
 *         description: Invalid request
 */
router.delete('/bulk-delete',
  auth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'IDs array is required and must not be empty',
        error: 'INVALID_REQUEST'
      });
    }

    // Validate ObjectIds
    const mongoose = require('mongoose');
    const invalidIds = ids.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ObjectId format',
        error: 'INVALID_OBJECT_ID',
        invalidIds
      });
    }

    try {
      // Check if records exist before deletion
      const existingRecords = await Laboratory.find({ _id: { $in: ids } });
      const existingIds = existingRecords.map(record => record._id.toString());
      const notFoundIds = ids.filter(id => !existingIds.includes(id));
      
      // If no records found at all, return error
      if (existingIds.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No laboratory records found to delete',
          error: 'RESOURCE_NOT_FOUND',
          notFoundIds: ids,
          foundCount: 0,
          requestedCount: ids.length
        });
      }

      const result = await Laboratory.deleteMany({ _id: { $in: existingIds } });
      
      // Prepare response with details about what was deleted and what wasn't found
      const response = {
        success: true,
        message: `${result.deletedCount} laboratory records deleted successfully`,
        deletedCount: result.deletedCount,
        requestedCount: ids.length,
        foundCount: existingIds.length
      };

      // Add warning if some records were not found
      if (notFoundIds.length > 0) {
        response.warning = `${notFoundIds.length} records were not found and could not be deleted`;
        response.notFoundIds = notFoundIds;
        response.notFoundCount = notFoundIds.length;
      }

      res.json(response);
    } catch (error) {
      console.error('Bulk delete error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error deleting laboratory records',
        error: 'DELETE_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/laboratories/delete-all:
 *   delete:
 *     summary: Delete all laboratory records
 *     tags: [Laboratory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All records deleted successfully
 */
router.delete('/delete-all',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const result = await Laboratory.deleteMany({});
    
    res.json({
      success: true,
      message: `All laboratory records deleted successfully`,
      deletedCount: result.deletedCount
    });
  })
);

/**
 * @swagger
 * /api/laboratories/{id}:
 *   delete:
 *     summary: Delete laboratory record
 *     tags: [Laboratory]
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
  auth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const record = await Laboratory.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Laboratory record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    await Laboratory.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Laboratory record deleted successfully'
    });
  })
);


/**
 * @swagger
 * /api/laboratories/template:
 *   get:
 *     summary: Download laboratory import template
 *     tags: [Laboratory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Template downloaded successfully
 */
router.get('/template',
  asyncHandler(async (req, res) => {
    // Add default user for template
    req.user = { _id: 'system', role: 'super_admin', name: 'System Template' };
    
    // Call handleTemplate with proper context
    await handleTemplate(req, res, [
    {
      sampleCode: 'LAB-001',
      sampleType: 'Blood',
      collector: 'د. أحمد محمد',
      date: '2024-01-15',
      clientName: 'محمد أحمد الشمري',
      clientNationalId: '1234567890',
      clientPhone: '+966501234567',
      farmLocation: 'مزرعة الشمري',
      testType: 'Parasitology',
      positiveCases: 2,
      negativeCases: 8,
      testStatus: 'Completed',
      priority: 'Normal',
      remarks: 'فحص روتيني للطفيليات'
    }
  ], 'laboratories-template');
  })
);

// Import route moved to centralized import-export.js

module.exports = router;
