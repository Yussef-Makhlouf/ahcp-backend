const express = require('express');
const ParasiteControl = require('../models/ParasiteControl');
const Client = require('../models/Client');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { handleTemplate, handleImport, findOrCreateClient } = require('../utils/importExportHelpers');

const router = express.Router();

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
    const { page = 1, limit = 10, startDate, endDate, supervisor, search } = req.query;
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
  auth,
  asyncHandler(async (req, res) => {
    const { format = 'json', startDate, endDate } = req.query;
    
    const filter = {};
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const records = await ParasiteControl.find(filter)
      .populate('client', 'name nationalId phone village')
      .sort({ date: -1 });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const fields = [
        'serialNo',
        'date',
        'client.name',
        'client.nationalId',
        'herdLocation',
        'supervisor',
        'vehicleNo',
        'totalHerdCount',
        'totalTreated',
        'treatmentEfficiency',
        'herdHealthStatus',
        'insecticide.type',
        'insecticide.volumeMl'
      ];
      
      const parser = new Parser({ fields });
      const csv = parser.parse(records);
      
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
  auth,
  handleTemplate([
    {
      serialNo: 'PC001',
      date: '2024-01-15',
      clientName: 'محمد أحمد الشمري',
      clientNationalId: '1234567890',
      clientPhone: '+966501234567',
      clientVillage: 'قرية النور',
      herdLocation: 'مزرعة الشمري',
      supervisor: 'د. محمد علي',
      vehicleNo: 'PC1',
      sheepTotal: 100,
      sheepYoung: 20,
      sheepFemale: 60,
      sheepTreated: 100,
      goatsTotal: 50,
      goatsYoung: 10,
      goatsFemale: 30,
      goatsTreated: 50,
      camelTotal: 5,
      camelYoung: 1,
      camelFemale: 3,
      camelTreated: 5,
      cattleTotal: 10,
      cattleYoung: 2,
      cattleFemale: 6,
      cattleTreated: 10,
      horseTotal: 3,
      horseYoung: 0,
      horseFemale: 2,
      horseTreated: 3,
      herdHealthStatus: 'Healthy',
      insecticideType: 'Ivermectin',
      insecticideMethod: 'Injection',
      insecticideVolumeMl: 500,
      insecticideStatus: 'Effective',
      insecticideCategory: 'Antiparasitic',
      requestDate: '2024-01-15',
      requestSituation: 'Open',
      remarks: 'ملاحظات إضافية'
    }
  ], 'parasite-control-template')
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
  authorize('super_admin', 'section_supervisor'),
  handleImport(ParasiteControl, Client, async (row, user, ClientModel, ParasiteControlModel, errors) => {
    // Validate required fields
    if (!row.serialNo || !row.date || !row.clientName) {
      errors.push({
        row: row.rowNumber,
        field: 'required',
        message: 'Missing required fields: serialNo, date, or clientName'
      });
      return;
    }
    
    // Find or create client
    const client = await findOrCreateClient(row, user._id, ClientModel);
    if (!client) {
      errors.push({
        row: row.rowNumber,
        field: 'client',
        message: 'Could not create or find client'
      });
      return;
    }
    
    // Create parasite control record
    const parasiteControlData = {
      serialNo: row.serialNo,
      date: new Date(row.date),
      client: client._id,
      herdLocation: row.herdLocation || '',
      supervisor: row.supervisor || '',
      vehicleNo: row.vehicleNo || '',
      herdCounts: {
        sheep: {
          total: parseInt(row.sheepTotal) || 0,
          young: parseInt(row.sheepYoung) || 0,
          female: parseInt(row.sheepFemale) || 0,
          treated: parseInt(row.sheepTreated) || 0
        },
        goats: {
          total: parseInt(row.goatsTotal) || 0,
          young: parseInt(row.goatsYoung) || 0,
          female: parseInt(row.goatsFemale) || 0,
          treated: parseInt(row.goatsTreated) || 0
        },
        camel: {
          total: parseInt(row.camelTotal) || 0,
          young: parseInt(row.camelYoung) || 0,
          female: parseInt(row.camelFemale) || 0,
          treated: parseInt(row.camelTreated) || 0
        },
        cattle: {
          total: parseInt(row.cattleTotal) || 0,
          young: parseInt(row.cattleYoung) || 0,
          female: parseInt(row.cattleFemale) || 0,
          treated: parseInt(row.cattleTreated) || 0
        },
        horse: {
          total: parseInt(row.horseTotal) || 0,
          young: parseInt(row.horseYoung) || 0,
          female: parseInt(row.horseFemale) || 0,
          treated: parseInt(row.horseTreated) || 0
        }
      },
      herdHealthStatus: row.herdHealthStatus || 'Healthy',
      insecticide: {
        type: row.insecticideType || '',
        method: row.insecticideMethod || '',
        volumeMl: parseInt(row.insecticideVolumeMl) || 0,
        status: row.insecticideStatus || '',
        category: row.insecticideCategory || ''
      },
      request: {
        date: new Date(row.requestDate || row.date),
        situation: row.requestSituation || 'Open'
      },
      remarks: row.remarks || '',
      createdBy: user._id
    };
    
    const parasiteControl = new ParasiteControlModel(parasiteControlData);
    await parasiteControl.save();
    
    // Populate client data for response
    await parasiteControl.populate('client', 'name nationalId phone village detailedAddress');
    return parasiteControl;
  })
);

module.exports = router;
