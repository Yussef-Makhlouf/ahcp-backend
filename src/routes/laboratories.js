const express = require('express');
const Laboratory = require('../models/Laboratory');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

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
    const { page = 1, limit = 10, testStatus, testType, priority, search } = req.query;
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
        .populate('client', 'name nationalId phone village detailedAddress')
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

      // الحالات الإيجابية والسلبية
      const positiveCases = await Laboratory.countDocuments({
        ...filter,
        'testResults.result': 'Positive'
      });

      const negativeCases = await Laboratory.countDocuments({
        ...filter,
        'testResults.result': 'Negative'
      });

      const positivityRate = totalSamples > 0 ? ((positiveCases / totalSamples) * 100).toFixed(2) : 0;

      const statistics = {
        totalSamples,
        samplesThisMonth,
        positiveCases,
        negativeCases,
        positivityRate: parseFloat(positivityRate)
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
    }).populate('client', 'name nationalId phone village');

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
    }).populate('client', 'name nationalId phone village');

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
  auth,
  asyncHandler(async (req, res) => {
    const { format = 'json', testStatus } = req.query;
    
    const filter = {};
    if (testStatus) filter.testStatus = testStatus;

    const records = await Laboratory.find(filter)
      .populate('client', 'name nationalId phone village')
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
      .populate('client', 'name nationalId phone village detailedAddress')
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
    await record.populate('client', 'name nationalId phone village');

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
    await record.populate('client', 'name nationalId phone village');

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


module.exports = router;
