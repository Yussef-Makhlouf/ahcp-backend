const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ParasiteControl = require('../models/ParasiteControl');
const Client = require('../models/Client');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const queryLogger = require('../utils/queryLogger');
const filterBuilder = require('../utils/filterBuilder');
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
 *       - in: query
 *         name: insecticide.method
 *         schema:
 *           type: string
 *         description: Filter by insecticide method (comma-separated)
 *       - in: query
 *         name: insecticide.category
 *         schema:
 *           type: string
 *         description: Filter by insecticide category (comma-separated)
 *       - in: query
 *         name: insecticide.status
 *         schema:
 *           type: string
 *         description: Filter by insecticide status (comma-separated)
 *       - in: query
 *         name: insecticide.type
 *         schema:
 *           type: string
 *         description: Filter by insecticide type (comma-separated)
 *       - in: query
 *         name: herdHealthStatus
 *         schema:
 *           type: string
 *         description: Filter by herd health status (comma-separated)
 *       - in: query
 *         name: complyingToInstructions
 *         schema:
 *           type: string
 *         description: Filter by compliance status
 *       - in: query
 *         name: parasiteControlStatus
 *         schema:
 *           type: string
 *         description: Filter by parasite control status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by serial number, supervisor, vehicle number, client name, client national ID, or client phone
 *     responses:
 *       200:
 *         description: Records retrieved successfully
 */
router.get('/',
  auth,
  validateQuery(schemas.dateRangeQuery),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    console.log('🔍 ParasiteControl Backend - Received query params:', req.query);
    
    // Build advanced filter using FilterBuilder
    const filter = filterBuilder.buildParasiteControlFilter(req.query);
    const paginationParams = filterBuilder.buildPaginationParams(req.query);
    const sortParams = filterBuilder.buildSortParams(req.query);

    console.log('📋 Built filter object:', JSON.stringify(filter, null, 2));
    console.log('📄 Pagination params:', paginationParams);

    // Execute query with performance tracking
    const queryStartTime = Date.now();
    
    let records, total;
    try {
      // Execute both queries in parallel for better performance
      [records, total] = await Promise.all([
        ParasiteControl.find(filter)
          .populate({
            path: 'client',
            select: 'name nationalId phone village detailedAddress birthDate',
            populate: {
              path: 'village',
              select: 'nameArabic nameEnglish sector serialNumber'
            }
          })
          .populate('holdingCode', 'code village description isActive')
          .sort(sortParams)
          .skip(paginationParams.skip)
          .limit(paginationParams.limit)
          .lean(), // Use lean() for better performance
        ParasiteControl.countDocuments(filter)
      ]);
    } catch (populateError) {
      console.error('🚨 Populate error, falling back to basic query:', populateError);
      // Fallback with basic populate if there's an issue
      [records, total] = await Promise.all([
        ParasiteControl.find(filter)
          .populate('client', 'name nationalId phone village detailedAddress birthDate')
          .populate('holdingCode', 'code village description isActive')
          .sort(sortParams)
          .skip(paginationParams.skip)
          .limit(paginationParams.limit)
          .lean(),
        ParasiteControl.countDocuments(filter)
      ]);
    }

    const queryExecutionTime = Date.now() - queryStartTime;
    const totalExecutionTime = Date.now() - startTime;

    // Log performance with detailed metrics
    queryLogger.log(
      'ParasiteControl Query',
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
        const explanation = await queryLogger.explainQuery(ParasiteControl, filter);
        if (explanation) {
          console.log('🔍 Query Performance Analysis:', {
            indexesUsed: explanation.indexesUsed,
            documentsExamined: explanation.documentsExamined,
            keysExamined: explanation.keysExamined,
            efficiency: explanation.keysExamined > 0 ? 
              (explanation.documentsExamined / explanation.keysExamined).toFixed(2) : 'N/A'
          });
        }
      } catch (explainError) {
        console.warn('⚠️ Could not explain query:', explainError.message);
      }
    }

    console.log(`📊 Query results: Found ${records.length} records out of ${total} total matching filter`);

    res.json({
      success: true,
      data: {
        records,
        pagination: {
          page: paginationParams.page,
          limit: paginationParams.limit,
          total,
          pages: Math.ceil(total / paginationParams.limit),
          hasNextPage: paginationParams.page < Math.ceil(total / paginationParams.limit),
          hasPrevPage: paginationParams.page > 1
        }
      },
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
 * /api/parasite-control/detailed-statistics:
 *   get:
 *     summary: Get detailed parasite control statistics for charts
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
 *         description: Detailed statistics retrieved successfully
 */
router.get('/detailed-statistics',
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
      // Get treatment type statistics
      const treatmentStats = await ParasiteControl.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            sprayedAnimals: {
              $sum: {
                $cond: [
                  { $eq: ['$insecticide.status', 'Sprayed'] },
                  {
                    $add: [
                      '$herdCounts.sheep.treated',
                      '$herdCounts.goats.treated',
                      '$herdCounts.camel.treated',
                      '$herdCounts.cattle.treated',
                      '$herdCounts.horse.treated'
                    ]
                  },
                  0
                ]
              }
            },
            sprayedBarns: {
              $sum: {
                $cond: [
                  { $eq: ['$insecticide.status', 'Sprayed'] },
                  1,
                  0
                ]
              }
            },
            pourOnAnimals: {
              $sum: {
                $cond: [
                  { $eq: ['$insecticide.method', 'Pour on'] },
                  {
                    $add: [
                      '$herdCounts.sheep.treated',
                      '$herdCounts.goats.treated',
                      '$herdCounts.camel.treated',
                      '$herdCounts.cattle.treated',
                      '$herdCounts.horse.treated'
                    ]
                  },
                  0
                ]
              }
            },
            oralDrenching: {
              $sum: {
                $cond: [
                  { $eq: ['$insecticide.method', 'Oral Drenching'] },
                  {
                    $add: [
                      '$herdCounts.sheep.treated',
                      '$herdCounts.goats.treated',
                      '$herdCounts.camel.treated',
                      '$herdCounts.cattle.treated',
                      '$herdCounts.horse.treated'
                    ]
                  },
                  0
                ]
              }
            }
          }
        }
      ]);

      // Get species statistics
      const speciesStats = await ParasiteControl.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            sheepTreated: { $sum: '$herdCounts.sheep.treated' },
            goatsTreated: { $sum: '$herdCounts.goats.treated' },
            cattleTreated: { $sum: '$herdCounts.cattle.treated' },
            camelTreated: { $sum: '$herdCounts.camel.treated' },
            horseTreated: { $sum: '$herdCounts.horse.treated' }
          }
        }
      ]);

      const treatmentData = treatmentStats[0] || {};
      const speciesData = speciesStats[0] || {};

      const detailedStats = {
        ...treatmentData,
        ...speciesData
      };
      
      res.json({
        success: true,
        data: detailedStats
      });
    } catch (error) {
      console.error('Error getting detailed parasite control statistics:', error);
      
      // Return default detailed statistics if method fails
      const defaultStats = {
        sprayedAnimals: 0,
        sprayedBarns: 0,
        pourOnAnimals: 0,
        oralDrenching: 0,
        sheepTreated: 0,
        goatsTreated: 0,
        cattleTreated: 0,
        camelTreated: 0,
        horseTreated: 0
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
    const { 
      format = 'json', 
      startDate, 
      endDate,
      'insecticide.method': method,
      'insecticide.category': category,
      'insecticide.status': status,
      'insecticide.type': type,
      herdHealthStatus,
      complyingToInstructions
    } = req.query;
    
    console.log('🔍 Export - Received query params:', req.query);
    
    const filter = {};
    
    // Date filter
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
      console.log('📅 Export - Date filter applied:', filter.date);
    }
    
    // Insecticide method filter
    if (method && method !== '__all__') {
      filter['insecticide.method'] = { $in: method.split(',') };
      console.log('🧪 Export - Method filter applied:', filter['insecticide.method']);
    }
    
    // Insecticide category filter
    if (category && category !== '__all__') {
      filter['insecticide.category'] = { $in: category.split(',') };
      console.log('🏷️ Export - Category filter applied:', filter['insecticide.category']);
    }
    
    // Insecticide status filter
    if (status && status !== '__all__') {
      filter['insecticide.status'] = { $in: status.split(',') };
      console.log('📊 Export - Status filter applied:', filter['insecticide.status']);
    }
    
    // Insecticide type filter
    if (type && type !== '__all__') {
      filter['insecticide.type'] = { $in: type.split(',') };
      console.log('🔬 Export - Type filter applied:', filter['insecticide.type']);
    }
    
    // Herd health status filter
    if (herdHealthStatus && herdHealthStatus !== '__all__') {
      filter.herdHealthStatus = { $in: herdHealthStatus.split(',') };
      console.log('🐑 Export - Herd health filter applied:', filter.herdHealthStatus);
    }
    
    // Complying to instructions filter
    if (complyingToInstructions && complyingToInstructions !== '__all__') {
      filter.complyingToInstructions = { $in: complyingToInstructions.split(',') };
      console.log('✅ Export - Complying filter applied:', filter.complyingToInstructions);
    }
    
    console.log('🔍 Export - Final MongoDB filter object:', JSON.stringify(filter, null, 2));

    const records = await ParasiteControl.find(filter)
      .populate('client', 'name nationalId phone village detailedAddress birthDate')
      .populate('holdingCode', 'code village description isActive')
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
          'Client Birth Date': (() => {
            const birthDate = record.client?.birthDate;
            if (birthDate) {
              try {
                return new Date(birthDate).toISOString().split('T')[0];
              } catch (e) {
                return '';
              }
            }
            return '';
          })(),
          'Village': (() => {
            if (record.client && typeof record.client === 'object' && record.client.village) {
              if (typeof record.client.village === 'string') {
                return record.client.village;
              } else if (record.client.village.nameArabic || record.client.village.nameEnglish) {
                return record.client.village.nameArabic || record.client.village.nameEnglish;
              }
            }
            return 'غير محدد';
          })(),
          'Phone': record.client?.phone || '',
          'Holding Code': record.holdingCode?.code || '',
          'Holding Code Village': record.holdingCode?.village || '',
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
          'Insecticide Type': record.insecticide?.type || '',
          'Insecticide Method': record.insecticide?.method || '',
          'Insecticide Volume (ml)': record.insecticide?.volumeMl || 0,
          'Insecticide Status': record.insecticide?.status || '',
          'Insecticide Category': record.insecticide?.category || '',
          'Insecticide Summary': record.insecticide ? 
            `${record.insecticide.type || ''} - ${record.insecticide.method || ''} - ${record.insecticide.volumeMl || 0}ml - ${record.insecticide.status || ''}` : 
            '',
          'Animal Barn Size (sqM)': record.animalBarnSizeSqM || 0,
          'Breeding Sites': record.breedingSites || '',
          'Herd Health Status': record.herdHealthStatus || '',
          'Complying to Instructions': record.complyingToInstructions || 'Comply',
          'Request Date': record.request?.date ? record.request.date.toISOString().split('T')[0] : '',
          'Request Situation': record.request?.situation || '',
          'Request Fulfilling Date': record.request?.fulfillingDate ? record.request.fulfillingDate.toISOString().split('T')[0] : '',
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
      .populate({
        path: 'client',
        select: 'name nationalId phone village detailedAddress birthDate',
        populate: {
          path: 'village',
          select: 'nameArabic nameEnglish sector serialNumber'
        }
      })
      .populate('holdingCode', 'code village description isActive')
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

    // Handle holding code - convert to ObjectId if provided
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
    console.log('🔍 Holding code type:', typeof req.body.holdingCode);
    const mongoose = require('mongoose');
    console.log('🔍 Holding code is valid ObjectId:', mongoose.Types.ObjectId.isValid(req.body.holdingCode));

    const record = new ParasiteControl({
      ...req.body,
      client: clientId,
      holdingCode: holdingCodeId,
      createdBy: req.user._id
    });

    await record.save();
    await record.populate({
      path: 'client',
      select: 'name nationalId phone village detailedAddress',
      populate: {
        path: 'village',
        select: 'nameArabic nameEnglish sector serialNumber'
      }
    });
    await record.populate('holdingCode', 'code village description isActive');

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
    console.log('🔄 PUT /parasite-control/:id - Update request received');
    console.log('📋 Request params:', req.params);
    console.log('📤 Request body:', JSON.stringify(req.body, null, 2));
    console.log('👤 User:', req.user?.email);
    console.log('🚨 HOLDING CODE DETAILED DEBUG:');
    console.log('req.body.holdingCode:', req.body.holdingCode);
    console.log('Type:', typeof req.body.holdingCode);
    console.log('Is undefined?', req.body.holdingCode === undefined);
    console.log('Is null?', req.body.holdingCode === null);
    console.log('Is empty string?', req.body.holdingCode === '');
    console.log('All body keys:', Object.keys(req.body));
    
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
        // Handle village - find or create village if provided
        let villageId = null;
        if (req.body.client.village && req.body.client.village.trim() !== '') {
          const Village = require('../models/Village');
          let village = await Village.findOne({
            $or: [
              { nameArabic: req.body.client.village.trim() },
              { nameEnglish: req.body.client.village.trim() }
            ]
          });

          if (!village) {
            village = new Village({
              serialNumber: `AUTO${Date.now().toString().slice(-6)}`,
              sector: 'Unknown Sector',
              nameArabic: req.body.client.village.trim(),
              nameEnglish: req.body.client.village.trim(),
              createdBy: req.user._id
            });
            await village.save();
          }
          villageId = village._id;
        }

        client = new Client({
          name: req.body.client.name,
          nationalId: req.body.client.nationalId || `AUTO_${Date.now()}`,
          phone: req.body.client.phone || '',
          village: villageId, // Use village ObjectId instead of string
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

    // Handle holding code - convert to ObjectId if provided
    let holdingCodeId = null;
    console.log('🔍 PUT - Raw holdingCode from request:', {
      value: req.body.holdingCode,
      type: typeof req.body.holdingCode,
      isNull: req.body.holdingCode === null,
      isUndefined: req.body.holdingCode === undefined,
      isEmpty: req.body.holdingCode === '',
      length: req.body.holdingCode?.length
    });
    
    if (req.body.holdingCode && req.body.holdingCode !== null && typeof req.body.holdingCode === 'string' && req.body.holdingCode.trim() !== '') {
      const mongoose = require('mongoose');
      const trimmedCode = req.body.holdingCode.trim();
      console.log('🔍 PUT - Trimmed holdingCode:', trimmedCode);
      console.log('🔍 PUT - Is valid ObjectId?', mongoose.Types.ObjectId.isValid(trimmedCode));
      
      if (mongoose.Types.ObjectId.isValid(trimmedCode)) {
        holdingCodeId = trimmedCode;
        console.log('✅ PUT - Using holdingCode as ObjectId:', holdingCodeId);
      } else {
        // If it's a code string, find the holding code by code
        console.log('🔍 PUT - Searching for holdingCode by code:', trimmedCode);
        const HoldingCode = require('../models/HoldingCode');
        const holdingCode = await HoldingCode.findOne({ code: trimmedCode });
        if (holdingCode) {
          holdingCodeId = holdingCode._id;
          console.log('✅ PUT - Found holdingCode by code:', holdingCodeId);
        } else {
          console.log('❌ PUT - No holdingCode found with code:', trimmedCode);
        }
      }
    } else {
      console.log('⚠️ PUT - holdingCode is null, undefined, or empty - will be set to null');
    }
    
    console.log('🎯 PUT - Final holdingCodeId to save:', holdingCodeId);
    updateData.holdingCode = holdingCodeId;

    // Update record
    Object.assign(record, updateData);
    record.updatedBy = req.user._id;
    await record.save();
    await record.populate({
      path: 'client',
      select: 'name nationalId phone village detailedAddress',
      populate: {
        path: 'village',
        select: 'nameArabic nameEnglish sector serialNumber'
      }
    });
    await record.populate('holdingCode', 'code village description isActive');

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
    // Get all unique client IDs from parasite control records before deletion
    const uniqueClientIds = await ParasiteControl.distinct('client');
    console.log(`🔍 Found ${uniqueClientIds.length} unique client IDs in parasite control records`);
    
    // Delete all parasite control records
    const parasiteResult = await ParasiteControl.deleteMany({});
    console.log(`🗑️ Deleted ${parasiteResult.deletedCount} parasite control records`);
    
    // Delete associated clients (only those that were created from parasite control imports)
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
      message: `All parasite control records and associated clients deleted successfully`,
      deletedCount: parasiteResult.deletedCount,
      clientsDeleted: clientsDeleted,
      details: {
        parasiteControlRecords: parasiteResult.deletedCount,
        clientRecords: clientsDeleted
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
      'Holding Code': 'HC123',
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

// Import route moved to centralized import-export.js

module.exports = router;
