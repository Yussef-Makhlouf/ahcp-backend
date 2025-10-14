const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ParasiteControl = require('../models/ParasiteControl');
const Client = require('../models/Client');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
// Import/Export functionality moved to import-export routes

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
 * /api/parasite-control:
 *   get:
 *     summary: Get all parasite control records
 *     tags: [Parasite Control]
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
 *       - in: query
 *         name: supervisor
 *         schema:
 *           type: string
 *         description: Filter by supervisor
 *     responses:
 *       200:
 *         description: Records retrieved successfully
 */
router.get('/',
  auth,
  validateQuery(schemas.dateRangeQuery),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 30, startDate, endDate, supervisor, search } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    if (supervisor) {
      filter.supervisor = { $regex: supervisor, $options: 'i' };
    }
    if (search) {
      filter.$or = [
        { serialNo: { $regex: search, $options: 'i' } },
        { supervisor: { $regex: search, $options: 'i' } },
        { vehicleNo: { $regex: search, $options: 'i' } },
        { herdLocation: { $regex: search, $options: 'i' } }
      ];
    }

    // Get records with error handling
    let records;
    try {
      records = await ParasiteControl.find(filter)
        .populate('client', 'name nationalId phone village detailedAddress')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ date: -1 })
        .lean(); // Use lean() for better performance and avoid virtual issues
    } catch (populateError) {
      console.error('Populate error, falling back to basic query:', populateError);
      // Fallback without populate if there's an issue
      records = await ParasiteControl.find(filter)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ date: -1 })
        .lean();
    }

    const total = await ParasiteControl.countDocuments(filter);

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
 * /api/parasite-control/statistics:
 *   get:
 *     summary: Get parasite control statistics
 *     tags: [Parasite Control]
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
      const statistics = await ParasiteControl.getStatistics(filter);
      
      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      console.error('Error getting parasite control statistics:', error);
      
      // Return default statistics if method fails
      const defaultStats = {
        totalRecords: await ParasiteControl.countDocuments(filter),
        recordsThisMonth: 0,
        totalAnimalsProcessed: 0,
        totalVolumeUsed: 0
      };
      
      res.json({
        success: true,
        data: defaultStats
      });
    }
  })
);

/**
 * @swagger
 * /api/parasite-control/export:
 *   get:
 *     summary: Export parasite control records
 *     tags: [Parasite Control]
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
    const { format = 'json', startDate, endDate } = req.query;
    
    const filter = {};
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const records = await ParasiteControl.find(filter)
      .populate('client', 'name nationalId phone village detailedAddress birthDate')
      .sort({ date: -1 });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      
      // Transform data for the new column structure
      const transformedRecords = records.map(record => {
        const herdCounts = record.herdCounts || {};
        const totalYoung = (herdCounts.sheep?.young || 0) + (herdCounts.goats?.young || 0) + 
                          (herdCounts.camel?.young || 0) + (herdCounts.cattle?.young || 0) + 
                          (herdCounts.horse?.young || 0);
        const totalFemale = (herdCounts.sheep?.female || 0) + (herdCounts.goats?.female || 0) + 
                           (herdCounts.camel?.female || 0) + (herdCounts.cattle?.female || 0) + 
                           (herdCounts.horse?.female || 0);
        
        return {
          'Serial No': record.serialNo,
          'Date': record.date ? record.date.toISOString().split('T')[0] : '',
          'Name': record.client?.name || '',
          'ID': record.client?.nationalId || '',
          'Date of Birth': record.client?.birthDate ? record.client.birthDate.toISOString().split('T')[0] : '',
          'Phone': record.client?.phone || '',
          'E': record.coordinates?.latitude || '',
          'N': record.coordinates?.longitude || '',
          'Supervisor': record.supervisor || '',
          'Vehicle No.': record.vehicleNo || '',
          'Total Sheep': herdCounts.sheep?.total || 0,
          'Young sheep': herdCounts.sheep?.young || 0,
          'Female Sheep': herdCounts.sheep?.female || 0,
          'Treated Sheep': herdCounts.sheep?.treated || 0,
          'Total Goats': herdCounts.goats?.total || 0,
          'Young Goats': herdCounts.goats?.young || 0,
          'Female Goats': herdCounts.goats?.female || 0,
          'Treated Goats': herdCounts.goats?.treated || 0,
          'Total Camel': herdCounts.camel?.total || 0,
          'Young Camels': herdCounts.camel?.young || 0,
          'Female Camels': herdCounts.camel?.female || 0,
          'Treated Camels': herdCounts.camel?.treated || 0,
          'Total Cattle': herdCounts.cattle?.total || 0,
          'Young Cattle': herdCounts.cattle?.young || 0,
          'Female Cattle': herdCounts.cattle?.female || 0,
          'Treated Cattle': herdCounts.cattle?.treated || 0,
          'Total Herd': record.totalHerdCount || 0,
          'Total Young': totalYoung,
          'Total Female': totalFemale,
          'Total Treated': record.totalTreated || 0,
          'Insecticide Used': record.insecticide?.type || '',
          'Type': record.insecticide?.method || '',
          'Volume (ml)': record.insecticide?.volumeMl || 0,
          'Category': record.insecticide?.category || '',
          'Status': record.insecticide?.status || '',
          'Size (sqM)': record.animalBarnSizeSqM || 0,
          'Insecticide': record.parasiteControlStatus || '',
          'Volume': record.parasiteControlVolume || 0,
          'Status': record.herdHealthStatus || '',
          'Herd Health Status': record.herdHealthStatus || '',
          'Complying to instructions': record.complyingToInstructions ? 'Yes' : 'No',
          'Request Date': record.request?.date ? record.request.date.toISOString().split('T')[0] : '',
          'Request Situation': record.request?.situation || '',
          'Request Fulfilling Date': record.request?.fulfillingDate ? record.request.fulfillingDate.toISOString().split('T')[0] : '',
          'Category': record.insecticide?.category || '',
          'Remarks': record.remarks || ''
        };
      });
      
      const parser = new Parser();
      const csv = parser.parse(transformedRecords);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=parasite-control-records.csv');
      res.send(csv);
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
 * /api/parasite-control/{id}:
 *   get:
 *     summary: Get parasite control record by ID
 *     tags: [Parasite Control]
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
    const record = await ParasiteControl.findById(req.params.id)
      .populate('client', 'name nationalId phone village detailedAddress')
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Parasite control record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: {
        records: [record],
        pagination: {
          page: 1,
          limit: 1,
          total: 1,
          pages: 1
        }
      }
    });
  })
);

/**
 * @swagger
 * /api/parasite-control:
 *   post:
 *     summary: Create new parasite control record
 *     tags: [Parasite Control]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ParasiteControl'
 *     responses:
 *       201:
 *         description: Record created successfully
 *       400:
 *         description: Validation error
 */
router.post('/',
  auth,
  validate(schemas.parasiteControlCreate),
  asyncHandler(async (req, res) => {
    // Check if serial number already exists
    const existingRecord = await ParasiteControl.findOne({ serialNo: req.body.serialNo });
    if (existingRecord) {
      return res.status(400).json({
        success: false,
        message: 'Serial number already exists',
        error: 'SERIAL_NUMBER_EXISTS'
      });
    }

    // Handle client - find or create
    console.log('🔍 Client data received:', req.body.client);
    console.log('🔍 Client type:', typeof req.body.client);
    
    let clientId;
    if (typeof req.body.client === 'object' && req.body.client.name) {
      // Client object provided, find or create
      const Client = require('../models/Client');
      
      // Try to find existing client by nationalId
      let client = null;
      if (req.body.client.nationalId) {
        client = await Client.findOne({ nationalId: req.body.client.nationalId });
      }
      
      // If not found, create new client
      if (!client) {
        client = new Client({
          name: req.body.client.name,
          nationalId: req.body.client.nationalId || `AUTO_${Date.now()}`,
          phone: req.body.client.phone || '',
          village: req.body.client.village || '',
          detailedAddress: req.body.client.detailedAddress || '',
          status: 'نشط',
          animals: [],
          availableServices: [],
          createdBy: req.user._id
        });
        await client.save();
      }
      
      clientId = client._id;
      console.log('✅ Client created/found with ID:', clientId);
    } else if (typeof req.body.client === 'string' && req.body.client.trim()) {
      // Client name provided, create simple client
      const Client = require('../models/Client');
      const client = new Client({
        name: req.body.client.trim(),
        nationalId: `AUTO_${Date.now()}`,
        phone: '',
        village: '',
        detailedAddress: '',
        status: 'نشط',
        animals: [],
        availableServices: [],
        createdBy: req.user._id
      });
      await client.save();
      clientId = client._id;
      console.log('✅ Simple client created with ID:', clientId);
    } else {
      // Client ID provided (ObjectId)
      clientId = req.body.client;
      console.log('✅ Using existing client ID:', clientId);
    }
    
    console.log('🔍 Final clientId before saving:', clientId);

    const record = new ParasiteControl({
      ...req.body,
      client: clientId,
      createdBy: req.user._id
    });

    await record.save();
    await record.populate('client', 'name nationalId phone village detailedAddress');

    res.status(201).json({
      success: true,
      message: 'Parasite control record created successfully',
      data: {
        records: [record],
        pagination: {
          page: 1,
          limit: 1,
          total: 1,
          pages: 1
        }
      }
    });
  })
);

/**
 * @swagger
 * /api/parasite-control/{id}:
 *   put:
 *     summary: Update parasite control record
 *     tags: [Parasite Control]
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
 *             $ref: '#/components/schemas/ParasiteControl'
 *     responses:
 *       200:
 *         description: Record updated successfully
 *       404:
 *         description: Record not found
 */
router.put('/:id',
  auth,
  validate(schemas.parasiteControlUpdate),
  asyncHandler(async (req, res) => {
    const record = await ParasiteControl.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Parasite control record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    // Check if serial number is being changed and if it already exists
    if (req.body.serialNo !== record.serialNo) {
      const existingRecord = await ParasiteControl.findOne({ 
        serialNo: req.body.serialNo,
        _id: { $ne: req.params.id }
      });
      if (existingRecord) {
        return res.status(400).json({
          success: false,
          message: 'Serial number already exists',
          error: 'SERIAL_NUMBER_EXISTS'
        });
      }
    }

    // Handle client - find or create
    console.log('🔍 PUT - Client data received:', req.body.client);
    console.log('🔍 PUT - Client type:', typeof req.body.client);
    
    let updateData = { ...req.body };
    let clientId;
    
    if (typeof req.body.client === 'object' && req.body.client.name) {
      // Client object provided, find or create
      const Client = require('../models/Client');
      
      // Try to find existing client by nationalId
      let client = null;
      if (req.body.client.nationalId) {
        client = await Client.findOne({ nationalId: req.body.client.nationalId });
      }
      
      // If not found, create new client
      if (!client) {
        client = new Client({
          name: req.body.client.name,
          nationalId: req.body.client.nationalId || `AUTO_${Date.now()}`,
          phone: req.body.client.phone || '',
          village: req.body.client.village || '',
          detailedAddress: req.body.client.detailedAddress || '',
          status: 'نشط',
          animals: [],
          availableServices: [],
          createdBy: req.user._id
        });
        await client.save();
      }
      
      clientId = client._id;
      updateData.client = clientId;
      console.log('✅ PUT - Client created/found with ID:', clientId);
    } else if (typeof req.body.client === 'string' && req.body.client.trim()) {
      // Client name provided, create simple client
      const Client = require('../models/Client');
      const client = new Client({
        name: req.body.client.trim(),
        nationalId: `AUTO_${Date.now()}`,
        phone: '',
        village: '',
        detailedAddress: '',
        status: 'نشط',
        animals: [],
        availableServices: [],
        createdBy: req.user._id
      });
      await client.save();
      clientId = client._id;
      updateData.client = clientId;
      console.log('✅ PUT - Simple client created with ID:', clientId);
    } else {
      // Client ID provided (ObjectId)
      clientId = req.body.client;
      updateData.client = clientId;
      console.log('✅ PUT - Using existing client ID:', clientId);
    }
    
    console.log('🔍 PUT - Final clientId before updating:', clientId);

    // Update record
    Object.assign(record, updateData);
    record.updatedBy = req.user._id;
    await record.save();
    await record.populate('client', 'name nationalId phone village detailedAddress');

    res.json({
      success: true,
      message: 'Parasite control record updated successfully',
      data: {
        records: [record],
        pagination: {
          page: 1,
          limit: 1,
          total: 1,
          pages: 1
        }
      }
    });
  })
);

/**
 * @swagger
 * /api/parasite-control/bulk-delete:
 *   delete:
 *     summary: Delete multiple parasite control records
 *     tags: [Parasite Control]
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
      const existingRecords = await ParasiteControl.find({ _id: { $in: ids } });
      const existingIds = existingRecords.map(record => record._id.toString());
      const notFoundIds = ids.filter(id => !existingIds.includes(id));
      
      // If no records found at all, return error
      if (existingIds.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No parasite control records found to delete',
          error: 'RESOURCE_NOT_FOUND',
          notFoundIds: ids,
          foundCount: 0,
          requestedCount: ids.length
        });
      }

      const result = await ParasiteControl.deleteMany({ _id: { $in: existingIds } });
      
      // Prepare response with details about what was deleted and what wasn't found
      const response = {
        success: true,
        message: `${result.deletedCount} parasite control records deleted successfully`,
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
        message: 'Error deleting parasite control records',
        error: 'DELETE_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/parasite-control/delete-all:
 *   delete:
 *     summary: Delete all parasite control records
 *     tags: [Parasite Control]
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
    const result = await ParasiteControl.deleteMany({});
    
    res.json({
      success: true,
      message: `All parasite control records deleted successfully`,
      deletedCount: result.deletedCount
    });
  })
);

/**
 * @swagger
 * /api/parasite-control/{id}:
 *   delete:
 *     summary: Delete parasite control record
 *     tags: [Parasite Control]
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
    const record = await ParasiteControl.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Parasite control record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    await ParasiteControl.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Parasite control record deleted successfully'
    });
  })
);

/**
 * @swagger
 * /api/parasite-control/statistics:
 *   get:
 *     summary: Get parasite control statistics
 *     tags: [Parasite Control]
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

/**
 * @swagger
 * /api/parasite-control/template:
 *   get:
 *     summary: Download import template for parasite control records
 *     tags: [Parasite Control]
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
    await handleTemplate([
    {
      'Serial No': `PC${Date.now().toString().slice(-6)}`, // Generate unique serial number
      'Date': '2024-01-15',
      'Name': 'محمد أحمد الشمري',
      'ID': '1234567890',
      'Date of Birth': '1980-01-01',
      'Phone': '+966501234567',
      'E': '24.7136',
      'N': '46.6753',
      'Supervisor': 'د. محمد علي',
      'Vehicle No.': 'PC1',
      'Total Sheep': 100,
      'Young sheep': 20,
      'Female Sheep': 60,
      'Treated Sheep': 100,
      'Total Goats': 50,
      'Young Goats': 10,
      'Female Goats': 30,
      'Treated Goats': 50,
      'Total Camel': 5,
      'Young Camels': 1,
      'Female Camels': 3,
      'Treated Camels': 5,
      'Total Cattle': 10,
      'Young Cattle': 2,
      'Female Cattle': 6,
      'Treated Cattle': 10,
      'Total Herd': 168,
      'Total Young': 33,
      'Total Female': 102,
      'Total Treated': 168,
      'Insecticide Used': 'Ivermectin',
      'Type': 'Injection',
      'Volume (ml)': 500,
      'Category': 'Antiparasitic',
      'Status': 'Sprayed',
      'Size (sqM)': 1000,
      'Insecticide': 'Effective',
      'Volume': 500,
      'Herd Health Status': 'Healthy',
      'Complying to instructions': 'Yes',
      'Request Date': '2024-01-15',
      'Request Situation': 'Open',
      'Request Fulfilling Date': '2024-01-16',
      'Remarks': 'ملاحظات إضافية'
    }
  ], 'parasite-control-template');
  })
);

/**
 * @swagger
 * /api/parasite-control/import:
 *   post:
 *     summary: Import parasite control records from CSV
 *     tags: [Parasite Control]
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
 *         description: Import completed
 */
router.post('/import',
  auth,
  asyncHandler(async (req, res) => {
    // Use authenticated user for import
    // req.user is already set by auth middleware
    
    // Call handleImport with proper context
    await handleImport(req, res, ParasiteControl, Client, async (row, user, ClientModel, ParasiteControlModel, errors) => {
    // Validate required fields - using flexible field names
    const serialNo = row['Serial No'] || row.serialNo || row['Serial'] || row.serial;
    const date = row['Date'] || row.date || row.DATE;
    const name = row['Name'] || row.name || row.clientName || row['Client Name'];
    
    if (!serialNo || !date || !name) {
      errors.push({
        row: row.rowNumber,
        field: 'required',
        message: 'Missing required fields: Serial No, Date, or Name'
      });
      return;
    }
    
    // Check if serial number already exists and generate unique one if needed
    let finalSerialNo = serialNo;
    const existingRecord = await ParasiteControlModel.findOne({ serialNo: finalSerialNo });
    if (existingRecord) {
      // Generate a unique serial number by appending timestamp
      const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
      finalSerialNo = `${serialNo}-${timestamp}`;
      
      // Double check the new serial number doesn't exist
      const duplicateCheck = await ParasiteControlModel.findOne({ serialNo: finalSerialNo });
      if (duplicateCheck) {
        // If still duplicate, add random number
        finalSerialNo = `${serialNo}-${timestamp}-${Math.floor(Math.random() * 1000)}`;
      }
      
      console.log(`⚠️  Serial number '${serialNo}' already exists. Generated new serial: '${finalSerialNo}'`);
    }
    
    // Create client data object for findOrCreateClient function
    const clientData = {
      clientName: name,
      clientNationalId: row['ID'] || row.id || row.ID,
      clientPhone: row['Phone'] || row.phone || row.Phone,
      clientVillage: '', // Will be set from detailedAddress if needed
      clientDetailedAddress: ''
    };
    
    // Find or create client
    const client = await findOrCreateClient(clientData, user._id, ClientModel);
    if (!client) {
      errors.push({
        row: row.rowNumber,
        field: 'client',
        message: 'Could not create or find client'
      });
      return;
    }
    
    // Update client with birth date if provided
    if (row['Date of Birth'] && client) {
      try {
        client.birthDate = new Date(row['Date of Birth']);
        await client.save();
      } catch (birthDateError) {
        console.warn('Could not set birth date:', birthDateError.message);
      }
    }
    
    // Parse coordinates
    const coordinates = {};
    if (row['E'] && !isNaN(parseFloat(row['E']))) {
      coordinates.latitude = parseFloat(row['E']);
    }
    if (row['N'] && !isNaN(parseFloat(row['N']))) {
      coordinates.longitude = parseFloat(row['N']);
    }
    
    // Create parasite control record with new column mapping
    const parasiteControlData = {
      serialNo: serialNo, // Use the potentially modified serial number
      date: new Date(row['Date']),
      client: client._id,
      herdLocation: row['Supervisor'] || '', // Using supervisor as location for now
      coordinates: Object.keys(coordinates).length > 0 ? coordinates : undefined,
      supervisor: row['Supervisor'] || '',
      vehicleNo: row['Vehicle No.'] || '',
      herdCounts: {
        sheep: {
          total: parseInt(row['Total Sheep']) || 0,
          young: parseInt(row['Young sheep']) || 0,
          female: parseInt(row['Female Sheep']) || 0,
          treated: parseInt(row['Treated Sheep']) || 0
        },
        goats: {
          total: parseInt(row['Total Goats']) || 0,
          young: parseInt(row['Young Goats']) || 0,
          female: parseInt(row['Female Goats']) || 0,
          treated: parseInt(row['Treated Goats']) || 0
        },
        camel: {
          total: parseInt(row['Total Camel']) || 0,
          young: parseInt(row['Young Camels']) || 0,
          female: parseInt(row['Female Camels']) || 0,
          treated: parseInt(row['Treated Camels']) || 0
        },
        cattle: {
          total: parseInt(row['Total Cattle']) || 0,
          young: parseInt(row['Young Cattle']) || 0,
          female: parseInt(row['Female Cattle']) || 0,
          treated: parseInt(row['Treated Cattle']) || 0
        },
        horse: {
          total: 0, // Not included in new format
          young: 0,
          female: 0,
          treated: 0
        }
      },
      animalBarnSizeSqM: parseInt(row['Size (sqM)']) || 0,
      parasiteControlVolume: parseInt(row['Volume']) || 0,
      parasiteControlStatus: row['Insecticide'] || '',
      herdHealthStatus: ['Healthy', 'Sick', 'Under Treatment'].includes(row['Herd Health Status']) 
        ? row['Herd Health Status'] 
        : 'Healthy', // تحويل القيم للصيغة المطلوبة
      complyingToInstructions: row['Complying to instructions'] === 'Yes' || row['Complying to instructions'] === 'true',
      insecticide: {
        type: row['Insecticide Used'] || '',
        method: row['Type'] || '',
        volumeMl: parseInt(row['Volume (ml)']) || 0,
        status: row['Status'] === 'Sprayed' ? 'Sprayed' : 'Not Sprayed', // تحويل القيم للصيغة المطلوبة
        category: row['Category'] || ''
      },
      request: {
        date: new Date(row['Request Date'] || row['Date']),
        situation: ['Open', 'Closed', 'Pending'].includes(row['Request Situation']) 
          ? row['Request Situation'] 
          : 'Open', // تحويل القيم للصيغة المطلوبة
        fulfillingDate: row['Request Fulfilling Date'] ? new Date(row['Request Fulfilling Date']) : undefined
      },
      remarks: row['Remarks'] || '',
      createdBy: user._id
    };
    
    const parasiteControl = new ParasiteControlModel(parasiteControlData);
    await parasiteControl.save();
    
    // Populate client data for response
    await parasiteControl.populate('client', 'name nationalId phone village detailedAddress birthDate');
    return parasiteControl;
  });
  })
);

module.exports = router;
