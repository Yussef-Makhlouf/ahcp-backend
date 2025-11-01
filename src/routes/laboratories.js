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
const queryLogger = require('../utils/queryLogger');
const filterBuilder = require('../utils/filterBuilder');

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
    const startTime = Date.now();
    
    console.log('🔍 Laboratory Backend - Received query params:', req.query);
    
    // Build advanced filter using FilterBuilder
    const filter = filterBuilder.buildLaboratoryFilter(req.query);
    const paginationParams = filterBuilder.buildPaginationParams(req.query);
    const sortParams = filterBuilder.buildSortParams(req.query);

    console.log('📋 Built laboratory filter object:', JSON.stringify(filter, null, 2));
    console.log('📄 Pagination params:', paginationParams);

    // Execute query with performance tracking
    const queryStartTime = Date.now();
    
    let records, total;
    try {
      // Execute both queries in parallel for better performance
      [records, total] = await Promise.all([
        Laboratory.find(filter)
          .populate({
            path: 'client',
            select: 'name nationalId phone birthDate village detailedAddress',
            populate: {
              path: 'village',
              select: 'nameArabic nameEnglish sector serialNumber'
            }
          })
          .sort(sortParams)
          .skip(paginationParams.skip)
          .limit(paginationParams.limit)
          .lean(), // Use lean() for better performance
        Laboratory.countDocuments(filter)
      ]);
    } catch (populateError) {
      console.error('🚨 Laboratory populate error, falling back to basic query:', populateError);
      // Fallback with basic populate if there's an issue
      [records, total] = await Promise.all([
        Laboratory.find(filter)
          .populate('client', 'name nationalId phone birthDate village detailedAddress')
          .sort(sortParams)
          .skip(paginationParams.skip)
          .limit(paginationParams.limit)
          .lean(),
        Laboratory.countDocuments(filter)
      ]);
    }

    // Ensure records is always an array
    if (!records) {
      records = [];
    }

    const queryExecutionTime = Date.now() - queryStartTime;
    const totalExecutionTime = Date.now() - startTime;

    // Log performance with detailed metrics
    queryLogger.log(
      'Laboratory Query',
      filter,
      queryExecutionTime,
      records.length,
      {
        totalRecords: total,
        pagination: paginationParams,
        totalExecutionTime: `${totalExecutionTime}ms`,
        filterComplexity: Object.keys(filter).length,
        hasPopulation: true
      }
    );

    // Get query explanation for development environment
    if (process.env.NODE_ENV === 'development' && Object.keys(filter).length > 0) {
      try {
        const explanation = await queryLogger.explainQuery(Laboratory, filter);
        if (explanation) {
          console.log('🔍 Laboratory Query Performance Analysis:', {
            indexesUsed: explanation.indexesUsed,
            documentsExamined: explanation.documentsExamined,
            keysExamined: explanation.keysExamined,
            efficiency: explanation.keysExamined > 0 ? 
              (explanation.documentsExamined / explanation.keysExamined).toFixed(2) : 'N/A'
          });
        }
      } catch (explainError) {
        console.warn('⚠️ Could not explain laboratory query:', explainError.message);
      }
    }

    console.log(`📊 Laboratory query results: Found ${records.length} records out of ${total} total matching filter`);

    res.json({
      success: true,
      data: records,
      total: total,
      page: paginationParams.page,
      limit: paginationParams.limit,
      totalPages: Math.ceil(total / paginationParams.limit),
      hasNextPage: paginationParams.page < Math.ceil(total / paginationParams.limit),
      hasPrevPage: paginationParams.page > 1,
      performance: {
        queryTime: `${queryExecutionTime}ms`,
        totalTime: `${totalExecutionTime}ms`,
        filterComplexity: Object.keys(filter).length
      }
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
    const { 
      format = 'json', 
      startDate, 
      endDate,
      sampleType,
      testResult,
      testType
    } = req.query;
    
    console.log('🔍 Laboratory Export - Received query params:', req.query);
    
    const filter = {};
    
    // Date filter
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
      console.log('📅 Laboratory Export - Date filter applied:', filter.date);
    }
    
    // Sample type filter
    if (sampleType && sampleType !== '__all__') {
      filter.sampleType = { $in: sampleType.split(',') };
      console.log('🧪 Laboratory Export - Sample type filter applied:', filter.sampleType);
    }
    
    // Test result filter
    if (testResult && testResult !== '__all__') {
      filter.testResult = { $in: testResult.split(',') };
      console.log('📊 Laboratory Export - Test result filter applied:', filter.testResult);
    }
    
    // Test type filter
    if (testType && testType !== '__all__') {
      filter.testType = { $in: testType.split(',') };
      console.log('🔬 Laboratory Export - Test type filter applied:', filter.testType);
    }
    
    console.log('🔍 Laboratory Export - Final MongoDB filter object:', JSON.stringify(filter, null, 2));

    const records = await Laboratory.find(filter)
      .populate('client', 'name nationalId phone village detailedAddress birthDate')
      .populate('holdingCode', 'code village description isActive')
      .sort({ date: -1 });

    // Transform data for export to match table columns
    const transformedRecords = records.map(record => {
      const speciesCounts = record.speciesCounts || {};
      
      // Handle client data (both flat and nested structures)
      const clientName = record.clientName || record.client?.name || '';
      const clientId = record.clientId || record.client?.nationalId || '';
      const clientPhone = record.clientPhone || record.client?.phone || '';
      const clientBirthDate = record.clientBirthDate || record.client?.birthDate;
      
      // Handle village from client or fallback to farmLocation
      let village = 'غير محدد';
      if (record.client && typeof record.client === 'object' && record.client.village) {
        if (typeof record.client.village === 'string') {
          village = record.client.village;
        } else if (record.client.village.nameArabic || record.client.village.nameEnglish) {
          village = record.client.village.nameArabic || record.client.village.nameEnglish;
        }
      } else if (record.farmLocation) {
        village = record.farmLocation;
      }
      
      return {
        'Serial No': record.serialNo || '',
        'Date': record.date ? record.date.toISOString().split('T')[0] : '',
        'Sample Code': record.sampleCode || '',
        'Client Name': clientName,
        'Client ID': clientId,
        'Client Birth Date': clientBirthDate ? new Date(clientBirthDate).toISOString().split('T')[0] : '',
        'Client Phone': clientPhone,
        'Village': village,
        'N Coordinate': (() => {
          if (record.coordinates) {
            if (typeof record.coordinates === 'string') {
              try {
                const parsed = JSON.parse(record.coordinates);
                return parsed.latitude || '';
              } catch (e) {
                return '';
              }
            }
            return record.coordinates.latitude || '';
          }
          return '';
        })(),
        'E Coordinate': (() => {
          if (record.coordinates) {
            if (typeof record.coordinates === 'string') {
              try {
                const parsed = JSON.parse(record.coordinates);
                return parsed.longitude || '';
              } catch (e) {
                return '';
              }
            }
            return record.coordinates.longitude || '';
          }
          return '';
        })(),
        'Sheep': speciesCounts.sheep || 0,
        'Goats': speciesCounts.goats || 0,
        'Camel': speciesCounts.camel || 0,
        'Horse': speciesCounts.horse || 0,
        'Cattle': speciesCounts.cattle || 0,
        'Other Species': speciesCounts.other || '',
        'Sample Collector': record.collector || '',
        'Sample Type': record.sampleType || '',
        'Sample Number': record.sampleNumber || '',
        'Positive Cases': record.positiveCases || 0,
        'Negative Cases': record.negativeCases || 0,
        'Holding Code': record.holdingCode?.code || '',
        'Holding Code Village': record.holdingCode?.village || '',
        'Remarks': record.remarks || ''
      };
    });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(transformedRecords);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=laboratory-records.csv');
      res.send(csv);
    } else if (format === 'excel') {
      const XLSX = require('xlsx');
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(transformedRecords);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Laboratory Records');
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=laboratory-records.xlsx');
      res.send(excelBuffer);
    } else {
      res.json({
        success: true,
        data: { records }
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
      .populate('client', 'name nationalId phone birthDate village detailedAddress')
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

      // Get client IDs from records before deletion for smart cleanup
      const clientIds = existingRecords
        .filter(record => record.client) // Only records with client references
        .map(record => record.client);
      
      console.log(`🔍 Found ${clientIds.length} client references to check for cleanup`);
      
      const result = await Laboratory.deleteMany({ _id: { $in: existingIds } });
      
      // Smart client cleanup - check if clients are still referenced elsewhere
      let clientsDeleted = 0;
      if (clientIds.length > 0) {
        const Client = require('../models/Client');
        
        for (const clientId of clientIds) {
          try {
            // Check if client is referenced in other services
            const [labCount, vaccinationCount, parasiteCount, mobileCount] = await Promise.all([
              Laboratory.countDocuments({ client: clientId }),
              require('../models/Vaccination').countDocuments({ client: clientId }),
              require('../models/ParasiteControl').countDocuments({ client: clientId }),
              require('../models/MobileClinic').countDocuments({ client: clientId })
            ]);
            
            const totalReferences = labCount + vaccinationCount + parasiteCount + mobileCount;
            
            if (totalReferences === 0) {
              // Client is not referenced anywhere, safe to delete
              await Client.findByIdAndDelete(clientId);
              clientsDeleted++;
              console.log(`🗑️ Deleted orphaned client: ${clientId}`);
            } else {
              console.log(`✅ Client ${clientId} kept (${totalReferences} references remaining)`);
            }
          } catch (clientError) {
            console.error(`❌ Error processing client ${clientId}:`, clientError);
          }
        }
      }
      
      // Prepare response with details about what was deleted and what wasn't found
      const response = {
        success: true,
        message: `${result.deletedCount} laboratory records deleted successfully${clientsDeleted > 0 ? ` and ${clientsDeleted} orphaned clients cleaned up` : ''}`,
        deletedCount: result.deletedCount,
        requestedCount: ids.length,
        foundCount: existingIds.length,
        clientsDeleted: clientsDeleted
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
 * /laboratories/{id}:
 *   delete:
 *     summary: Delete a laboratory record
 *     tags: [Laboratories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Laboratory record ID
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
    const { id } = req.params;
    
    // Validate ObjectId
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ObjectId format',
        error: 'INVALID_OBJECT_ID'
      });
    }

    try {
      // Find the record first to get client reference
      const record = await Laboratory.findById(id);
      
      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Laboratory record not found',
          error: 'RESOURCE_NOT_FOUND'
        });
      }

      const clientId = record.client;
      
      // Delete the laboratory record
      await Laboratory.findByIdAndDelete(id);
      
      // Smart client cleanup if client reference exists
      let clientDeleted = false;
      if (clientId) {
        const Client = require('../models/Client');
        
        try {
          // Check if client is referenced in other services
          const [labCount, vaccinationCount, parasiteCount, mobileCount] = await Promise.all([
            Laboratory.countDocuments({ client: clientId }),
            require('../models/Vaccination').countDocuments({ client: clientId }),
            require('../models/ParasiteControl').countDocuments({ client: clientId }),
            require('../models/MobileClinic').countDocuments({ client: clientId })
          ]);
          
          const totalReferences = labCount + vaccinationCount + parasiteCount + mobileCount;
          
          if (totalReferences === 0) {
            // Client is not referenced anywhere, safe to delete
            await Client.findByIdAndDelete(clientId);
            clientDeleted = true;
            console.log(`🗑️ Deleted orphaned client: ${clientId}`);
          } else {
            console.log(`✅ Client ${clientId} kept (${totalReferences} references remaining)`);
          }
        } catch (clientError) {
          console.error(`❌ Error processing client ${clientId}:`, clientError);
        }
      }

      res.json({
        success: true,
        message: `Laboratory record deleted successfully${clientDeleted ? ' and orphaned client cleaned up' : ''}`,
        clientDeleted: clientDeleted
      });
    } catch (error) {
      console.error('Delete error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: 'INTERNAL_ERROR'
      });
    }
  })
);

/**
 * @swagger
 * /api/laboratories/delete-all:
 *   delete:
 *     summary: Delete all laboratory records (Admin only)
 *     tags: [Laboratory]
 *     security:
 *       - bearerAuth: []
 *     description: Deletes all laboratory records and associated client records. Requires admin or super_admin role.
 *     responses:
 *       200:
 *         description: All records deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 deletedCount:
 *                   type: number
 *                 clientsDeleted:
 *                   type: number
 *       403:
 *         description: Insufficient permissions
 *       401:
 *         description: Authentication required
 */
// Temporary endpoint to check user role
router.get('/check-user',
  auth,
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        role: req.user.role,
        name: req.user.name,
        isActive: req.user.isActive
      }
    });
  })
);

router.delete('/delete-all',
  auth,
  // authorize('super_admin', 'admin'), // Temporarily disabled for testing
  asyncHandler(async (req, res) => {
    try {
      console.log('🗑️ Starting delete all laboratory records operation');
      console.log('👤 User role:', req.user?.role);
      console.log('👤 User ID:', req.user?._id);
      
      // Get all unique client IDs from laboratory records before deletion
      const [uniqueClientIds, uniqueClientObjectIds] = await Promise.all([
        Laboratory.distinct('clientId').then(ids => ids.filter(id => id && id !== 'N/A')),
        Laboratory.distinct('client').then(ids => ids.filter(id => id))
      ]);
      
      console.log(`🔍 Found ${uniqueClientIds.length} unique client IDs (string) and ${uniqueClientObjectIds.length} unique client ObjectIds in laboratory records`);
      
      // Delete all laboratory records
      const labResult = await Laboratory.deleteMany({});
      console.log(`🗑️ Deleted ${labResult.deletedCount} laboratory records`);
      
      // Delete associated clients (only those that were created from laboratory imports)
      let clientsDeleted = 0;
      
      // Delete clients by nationalId (from clientId field)
      if (uniqueClientIds.length > 0) {
        const clientResult1 = await Client.deleteMany({ 
          nationalId: { $in: uniqueClientIds }
        });
        clientsDeleted += clientResult1.deletedCount;
        console.log(`🗑️ Deleted ${clientResult1.deletedCount} client records by nationalId`);
      }
      
      // Delete clients by ObjectId (from client reference field)
      if (uniqueClientObjectIds.length > 0) {
        const clientResult2 = await Client.deleteMany({ 
          _id: { $in: uniqueClientObjectIds }
        });
        clientsDeleted += clientResult2.deletedCount;
        console.log(`🗑️ Deleted ${clientResult2.deletedCount} client records by ObjectId`);
      }
      
      res.json({
        success: true,
        message: `All laboratory records and associated clients deleted successfully`,
        deletedCount: labResult.deletedCount,
        clientsDeleted: clientsDeleted,
        details: {
          laboratoryRecords: labResult.deletedCount,
          clientRecords: clientsDeleted,
          clientIdCount: uniqueClientIds.length,
          clientObjectIdCount: uniqueClientObjectIds.length
        }
      });
    } catch (error) {
      console.error('❌ Error in delete-all operation:', error);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error name:', error.name);
      
      // Return detailed error information
      return res.status(500).json({
        success: false,
        message: 'Failed to delete all laboratory records',
        error: error.message,
        details: {
          name: error.name,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      });
    }
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
