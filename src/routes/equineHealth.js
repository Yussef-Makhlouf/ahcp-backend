const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const EquineHealth = require('../models/EquineHealth');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { checkSectionAccessWithMessage } = require('../middleware/sectionAuth');
const { handleExport, handleTemplate, handleImport, findOrCreateClient } = require('../utils/importExportHelpers');
const filterBuilder = require('../utils/filterBuilder');
const { normalizeEquineInterventionCategory } = require('../utils/interventionCategories');

const logger = require('../utils/logger');
const clientServiceManager = require('../utils/clientServiceManager');
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
 *           enum: [Clinical Examination, Ultrasonography, Lab Analysis, Surgical Operation, Farriery]
 *         description: Filter by intervention category
 *       - in: query
 *         name: request.situation
 *         schema:
 *           type: string
 *           enum: [Ongoing, Closed]
 *         description: Filter by request status
 *     responses:
 *       200:
 *         description: Records retrieved successfully
 */
router.get('/',
  validateQuery(schemas.dateRangeQuery),
  asyncHandler(async (req, res) => {
    const paginationParams = filterBuilder.buildPaginationParams(req.query);
    const sortParams = filterBuilder.buildSortParams(req.query);
    const filter = filterBuilder.buildEquineHealthFilter(req.query);

    const records = await EquineHealth.find(filter)
      .populate('holdingCode', 'code village description isActive')
      .skip(paginationParams.skip)
      .limit(paginationParams.limit)
      .sort(sortParams);

    // Transform records to ensure village is properly displayed
    const transformedRecords = records.map(record => {
      const recordObj = record.toObject ? record.toObject() : record;
      
      // Ensure client.village is properly extracted
      if (recordObj.client && typeof recordObj.client === 'object') {
        // If client is embedded object with village as string
        if (recordObj.client.village && typeof recordObj.client.village === 'string') {
          // Keep it as is - ensure it's not empty or 'N/A'
          if (!recordObj.client.village || recordObj.client.village === 'N/A') {
            recordObj.client.village = recordObj.farmLocation || 'غير محدد';
          }
        } else if (!recordObj.client.village || recordObj.client.village === 'N/A') {
          // Try to get from farmLocation as fallback
          recordObj.client.village = recordObj.farmLocation || 'غير محدد';
        }
      } else if (!recordObj.client) {
        // If no client at all, set default
        recordObj.client = { village: recordObj.farmLocation || 'غير محدد' };
      }
      
      return recordObj;
    });

    const total = await EquineHealth.countDocuments(filter);

    res.json({
      success: true,
      data: {
        records: transformedRecords,
        pagination: {
          page: paginationParams.page,
          limit: paginationParams.limit,
          total,
          pages: Math.ceil(total / paginationParams.limit)
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
 *             type: object
 *             required:
 *               - serialNo
 *               - date
 *               - client
 *               - supervisor
 *               - vehicleNo
 *               - diagnosis
 *               - interventionCategory
 *               - treatment
 *               - request
 *             properties:
 *               serialNo:
 *                 type: string
 *                 maxLength: 20
 *               date:
 *                 type: string
 *                 format: date
 *               client:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   nationalId:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   village:
 *                     type: string
 *                   detailedAddress:
 *                     type: string
 *               supervisor:
 *                 type: string
 *               vehicleNo:
 *                 type: string
 *               diagnosis:
 *                 type: string
 *               interventionCategory:
 *                 type: string
 *                 enum: [Clinical Examination, Ultrasonography, Lab Analysis, Surgical Operation, Farriery]
 *               treatment:
 *                 type: string
 *               request:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                     format: date
 *                   situation:
 *                     type: string
 *                     enum: [Ongoing, Closed, Pending]
 *     responses:
 *       201:
 *         description: Record created successfully
 *       400:
 *         description: Validation error
 */
router.post('/',
  auth,
  validate(schemas.equineHealthCreate),
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

    const normalizedCategory = normalizeEquineInterventionCategory(
      req.body.interventionCategory,
      { fallback: 'Clinical Examination' }
    );

    const record = new EquineHealth({
      ...req.body,
      interventionCategory: normalizedCategory,
      updatedBy: req.user._id
    });

    await record.save();
    await record.populate('client', 'name nationalId phone village detailedAddress');

    // Update client's availableServices if client exists
    if (record.client && typeof record.client === 'object' && record.client._id) {
      const Client = require('../models/Client');
      const client = await Client.findById(record.client._id);
      if (client) {
        if (!client.availableServices.includes('equine_health')) {
          client.availableServices.push('equine_health');
          await client.save();
          console.log(`✅ Added 'equine_health' service to client ${client._id}`);
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Equine health record created successfully',
      data: { record }
    });
  })
);

/**
 * @swagger
 * /api/equine-health/bulk-delete:
 *   delete:
 *     summary: Delete multiple equine health records
 *     tags: [Equine Health]
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
 *                 description: Array of equine health IDs to delete
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
  authorize('super_admin', 'admin'),
  validate(schemas.bulkDeleteSchema),
  asyncHandler(async (req, res) => {
    const { ids } = req.body;

    logger.info('EquineHealth bulk delete request payload:', { data: req.body });

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'IDs array is required and must not be empty'
      });
    }

    // Separate Mongo ObjectIds and serial numbers
    const objectIdValues = [];
    const serialNumbers = [];

    ids.forEach((identifier) => {
      if (!identifier && identifier !== 0) {
        return;
      }

      const value = identifier.toString().trim();
      if (!value) {
        return;
      }

      if (mongoose.Types.ObjectId.isValid(value)) {
        objectIdValues.push(value);
      } else {
        serialNumbers.push(value);
      }
    });

    if (objectIdValues.length === 0 && serialNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid IDs or serial numbers were provided'
      });
    }

    const deletionCriteria = [];
    if (objectIdValues.length > 0) {
      deletionCriteria.push({ _id: { $in: objectIdValues } });
    }
    if (serialNumbers.length > 0) {
      deletionCriteria.push({ serialNo: { $in: serialNumbers } });
    }

    try {
      // Ensure all requested identifiers exist before deleting
      const existingRecords = await EquineHealth.find({
        $or: deletionCriteria
      }).select(['_id', 'serialNo', 'client']);

      logger.info('EquineHealth bulk delete lookup result:', { data: existingRecords.map(record => ({
        _id: record._id.toString(),
        serialNo: record.serialNo,
        client: record.client
      }))});

      const foundIdentifiers = new Set();
      existingRecords.forEach(record => {
        foundIdentifiers.add(record._id.toString());
        if (record.serialNo) {
          foundIdentifiers.add(record.serialNo.toString());
        }
      });

      const missingIdentifiers = ids.filter((identifier) => {
        const value = identifier?.toString().trim();
        return !value || !foundIdentifiers.has(value);
      });

      if (missingIdentifiers.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Some records were not found',
          missing: missingIdentifiers,
          found: existingRecords.length,
          requested: ids.length
        });
      }

      // Get unique client IDs from records before deletion
      const clientIds = [...new Set(existingRecords
        .filter(record => record.client)
        .map(record => record.client.toString()))];

      const result = await EquineHealth.deleteMany({
        $or: deletionCriteria
      });

      logger.info('EquineHealth bulk delete result:', { data: result });

      // Update client's availableServices
      let clientsUpdated = 0;
      if (clientIds.length > 0) {
        const Client = require('../models/Client');
        
        for (const clientId of clientIds) {
          try {
            const equineCount = await EquineHealth.countDocuments({ client: clientId });
            if (equineCount === 0) {
              const client = await Client.findById(clientId);
              if (client) {
                client.availableServices = client.availableServices.filter(s => s !== 'equine_health');
                await client.save();
                clientsUpdated++;
                console.log(`✅ Removed 'equine_health' service from client ${clientId}`);
              }
            }
          } catch (clientError) {
            console.error(`❌ Error processing client ${clientId}:`, clientError);
          }
        }
      }

      res.json({
        success: true,
        message: `${result.deletedCount} equine health records deleted successfully${clientsUpdated > 0 ? ` and ${clientsUpdated} client services updated` : ''}`,
        deletedCount: result.deletedCount,
        clientsUpdated: clientsUpdated
      });
    } catch (error) {
      logger.error('Error in bulk delete equine health:', { error: error });
      res.status(500).json({
        success: false,
        message: 'Error deleting equine health records',
        error: error.message
      });
    }
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
  auth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // تحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid record ID format',
        error: 'INVALID_ID_FORMAT'
      });
    }
    
    const record = await EquineHealth.findById(id)
      .populate('holdingCode', 'code village description isActive');
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Equine health record not found'
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
 *       400:
 *         description: Validation error
 */
router.put('/:id',
  auth,
  validate(schemas.equineHealthCreate),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // تحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid record ID format',
        error: 'INVALID_ID_FORMAT'
      });
    }
    
    // Check if serial number already exists (excluding current record)
    if (req.body.serialNo) {
      const existingRecord = await EquineHealth.findOne({ 
        serialNo: req.body.serialNo,
        _id: { $ne: id }
      });
      if (existingRecord) {
        return res.status(400).json({
          success: false,
          message: 'Serial number already exists',
          error: 'SERIAL_NUMBER_EXISTS'
        });
      }
    }

    if (req.body.interventionCategory !== undefined) {
      req.body.interventionCategory = normalizeEquineInterventionCategory(
        req.body.interventionCategory,
        { fallback: 'Clinical Examination' }
      );
    }

    // Get old record to check client before update
    const oldRecord = await EquineHealth.findById(id);
    if (!oldRecord) {
      return res.status(404).json({
        success: false,
        message: 'Equine health record not found'
      });
    }

    const oldClientId = oldRecord.client;

    const record = await EquineHealth.findByIdAndUpdate(
      id,
      { ...req.body, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Equine health record not found'
      });
    }

    await record.populate('client', 'name nationalId phone village detailedAddress');

    // Update client's availableServices
    const Client = require('../models/Client');
    
    // Remove service from old client if client changed
    if (oldClientId && oldClientId.toString() !== record.client?._id?.toString()) {
      const oldClient = await Client.findById(oldClientId);
      if (oldClient) {
        const equineCount = await EquineHealth.countDocuments({ client: oldClientId });
        if (equineCount === 0) {
          // No more equine health records for this client, remove service
          oldClient.availableServices = oldClient.availableServices.filter(s => s !== 'equine_health');
          await oldClient.save();
          console.log(`✅ Removed 'equine_health' service from old client ${oldClientId}`);
        }
      }
    }

    // Add service to new client if client exists
    if (record.client && typeof record.client === 'object' && record.client._id) {
      const newClient = await Client.findById(record.client._id);
      if (newClient) {
        if (!newClient.availableServices.includes('equine_health')) {
          newClient.availableServices.push('equine_health');
          await newClient.save();
          console.log(`✅ Added 'equine_health' service to new client ${record.client._id}`);
        }
      }
    }

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
  auth,
  authorize('super_admin', 'admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // تحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid record ID format',
        error: 'INVALID_ID_FORMAT'
      });
    }
    
    const record = await EquineHealth.findById(id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Equine health record not found'
      });
    }

    const clientId = record.client;

    // Delete the equine health record
    await EquineHealth.findByIdAndDelete(id);

    // Update client's availableServices (NEVER delete the client)
    let clientUpdateResult = null;
    if (clientId) {
      console.log(`🔄 Updating client ${clientId} services after equine health record deletion`);
      clientUpdateResult = await clientServiceManager.handleRecordDeletion(clientId, 'equine_health');
      
      if (clientUpdateResult.success) {
        console.log(`✅ Client update result:`, clientUpdateResult.message);
      } else {
        console.error(`❌ Failed to update client services:`, clientUpdateResult.message);
      }
    }

    res.json({
      success: true,
      message: 'Equine health record deleted successfully',
      clientUpdated: clientUpdateResult?.success || false,
      serviceRemoved: clientUpdateResult?.serviceRemoved || false,
      remainingServices: clientUpdateResult?.remainingServices || 0
    });
  })
);

// Export routes - must come before /:id route
router.get('/export', asyncHandler(async (req, res) => {
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

  const records = await EquineHealth.find(filter)
    .sort({ serialNo: 1 }); // Sort by serialNo ascending

  // Transform data for export to match table columns exactly
  const transformedRecords = records.map(record => {
    // Handle client data (both flat and nested structures)
    const clientName = record.clientName || record.client?.name || '';
    const clientId = record.clientId || record.client?.nationalId || '';
    const clientPhone = record.clientPhone || record.client?.phone || '';
    const clientBirthDate = record.clientBirthDate || record.client?.birthDate;
    
    // Handle client birth date properly
    let formattedBirthDate = '';
    if (clientBirthDate) {
      try {
        formattedBirthDate = new Date(clientBirthDate).toISOString().split('T')[0];
      } catch (e) {
        formattedBirthDate = '';
      }
    }
    
    // Handle village from client or fallback
    let village = 'غير محدد';
    if (record.client) {
      if (typeof record.client === 'object' && record.client !== null) {
        // If client is populated object with village reference
        if (record.client.village) {
          if (typeof record.client.village === 'object' && record.client.village !== null) {
            village = record.client.village.nameArabic || record.client.village.nameEnglish || '';
          } else if (typeof record.client.village === 'string') {
            village = record.client.village;
          }
        }
        // If village is in embedded client data (for EquineHealth embedded structure)
        // Try to get from record.client.village directly (embedded structure)
        if (!village || village === 'غير محدد') {
          // Check if it's embedded client data with village as string
          const embeddedVillage = record.client?.village;
          if (embeddedVillage && typeof embeddedVillage === 'string' && embeddedVillage !== 'N/A' && embeddedVillage !== 'غير محدد') {
            village = embeddedVillage;
          }
        }
      }
    }
    // Fallback to farmLocation or clientVillage
    if (!village || village === 'غير محدد') {
      village = record.farmLocation || record.clientVillage || 'غير محدد';
    }
    
    // Handle holding code properly
    let holdingCodeValue = '';
    let holdingCodeVillage = '';
    if (record.holdingCode) {
      if (typeof record.holdingCode === 'string') {
        holdingCodeValue = record.holdingCode;
      } else if (typeof record.holdingCode === 'object') {
        holdingCodeValue = record.holdingCode.code || '';
        holdingCodeVillage = record.holdingCode.village || '';
      }
    }
    
    // Handle horse details
    const horseDetails = record.horseDetails || {};
    
    return {
      'Serial No': record.serialNo || '',
      'Date': record.date ? record.date.toISOString().split('T')[0] : '',
      'Client Name': clientName,
      'Client ID': clientId,
      'Client Birth Date': formattedBirthDate,
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
      'Horse Count': record.horseCount || 0,
      'Horse ID': horseDetails.horseId || '',
      'Horse Breed': horseDetails.breed || '',
      'Horse Age': horseDetails.age || '',
      'Horse Gender': horseDetails.gender || '',
      'Horse Color': horseDetails.color || '',
      'Horse Health Status': horseDetails.healthStatus || '',
      'Horse Weight': horseDetails.weight || '',
      'Horse Temperature': horseDetails.temperature || '',
      'Horse Heart Rate': horseDetails.heartRate || '',
      'Horse Respiratory Rate': horseDetails.respiratoryRate || '',
      'Diagnosis': record.diagnosis || '',
      'Intervention Category': record.interventionCategory || '',
      'Treatment': record.treatment || '',
      'Medication Name': record.medication?.name || '',
      'Vaccination Status': record.vaccinationStatus || '',
      'Deworming Status': record.dewormingStatus || '',
      'Follow Up Required': record.followUpRequired ? 'Yes' : 'No',
      'Follow Up Date': record.followUpDate ? new Date(record.followUpDate).toISOString().split('T')[0] : '',
      'Request Date': record.request?.date ? record.request.date.toISOString().split('T')[0] : '',
      'Request Situation': record.request?.situation || '',
      'Request Fulfilling Date': record.request?.fulfillingDate ? record.request.fulfillingDate.toISOString().split('T')[0] : '',
      'Holding Code': holdingCodeValue,
      'Holding Code Village': holdingCodeVillage,
      'Remarks': record.remarks || ''
    };
  });

  if (format === 'csv') {
    const { Parser } = require('json2csv');
    const parser = new Parser();
    const csv = parser.parse(transformedRecords);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=equine-health-records.csv');
    res.send(csv);
  } else if (format === 'excel') {
    const XLSX = require('xlsx');
    
    // Create a new workbook
    const workbook = XLSX.utils.book_new();
    
    // Convert data to worksheet
    const worksheet = XLSX.utils.json_to_sheet(transformedRecords);
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Equine Health Records');
    
    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=equine-health-records.xlsx');
    res.send(excelBuffer);
  } else {
    res.json({
      success: true,
      data: { records }
    });
  }
}));

router.get('/template', asyncHandler(async (req, res) => {
    // Add default user for template
  req.user = { _id: 'system', role: 'super_admin', name: 'System Template' };
  await handleTemplate(req, res, 'equine-health');
}));

// Import route moved to centralized import-export.js

/**
 * @swagger
 * /api/equine-health/delete-all:
 *   delete:
 *     summary: Delete all equine health records
 *     tags: [Equine Health]
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
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    try {
      // Get all unique client IDs from equine health records before deletion
      const uniqueClientIds = await EquineHealth.distinct('client').then(ids => ids.filter(id => id));
      console.log(`🔍 Found ${uniqueClientIds.length} unique client IDs in equine health records`);
      
      // Get count before deletion for response
      const totalCount = await EquineHealth.countDocuments();
      
      if (totalCount === 0) {
        return res.json({
          success: true,
          message: 'No equine health records found to delete',
          deletedCount: 0,
          clientsUpdated: 0
        });
      }

      // Delete all equine health records
      const equineResult = await EquineHealth.deleteMany({});
      console.log(`🗑️ Deleted ${equineResult.deletedCount} equine health records`);
      
      // Update all affected clients' availableServices (NEVER delete clients)
      let clientsUpdated = 0;
      let servicesRemoved = 0;
      
      if (uniqueClientIds.length > 0) {
        console.log(`🔄 Updating ${uniqueClientIds.length} clients' services...`);
        const bulkResult = await clientServiceManager.handleBulkDeletion(uniqueClientIds, 'equine_health');
        
        if (bulkResult.success) {
          clientsUpdated = bulkResult.clientsUpdated;
          servicesRemoved = bulkResult.servicesRemoved;
          console.log(`✅ ${bulkResult.message}`);
          
          if (bulkResult.errors && bulkResult.errors.length > 0) {
            console.warn(`⚠️ ${bulkResult.errors.length} errors occurred during client updates`);
          }
        }
      }

      res.json({
        success: true,
        message: 'All equine health records deleted successfully. Client data preserved.',
        deletedCount: equineResult.deletedCount,
        clientsUpdated: clientsUpdated,
        servicesRemoved: servicesRemoved,
        details: {
          equineHealthRecords: equineResult.deletedCount,
          clientsAffected: uniqueClientIds.length,
          clientsUpdated: clientsUpdated,
          servicesRemovedFromClients: servicesRemoved,
          note: 'Clients are preserved. Only their equine_health service was removed if no records remain.'
        }
      });
    } catch (error) {
      logger.error('Error in delete all equine health:', { error: error });
      res.status(500).json({
        success: false,
        message: 'Error deleting all equine health records',
        error: error.message
      });
    }
  })
);

module.exports = router;
