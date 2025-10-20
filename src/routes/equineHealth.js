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
 *     responses:
 *       200:
 *         description: Records retrieved successfully
 */
router.get('/',
  validateQuery(schemas.dateRangeQuery),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 30, startDate, endDate, interventionCategory, supervisor, search } = req.query;
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
        { diagnosis: { $regex: search, $options: 'i' } }
      ];
    }

    // Get records
    const records = await EquineHealth.find(filter)
      .populate('holdingCode', 'code village description isActive')
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

    const record = new EquineHealth({
      ...req.body,
      updatedBy: req.user._id
    });

    await record.save();

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
  authorize(['super_admin', 'admin']),
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
    
    const record = await EquineHealth.findByIdAndDelete(id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Equine health record not found'
      });
    }

    res.json({
      success: true,
      message: 'Equine health record deleted successfully'
    });
  })
);

// Export routes - must come before /:id route
router.get('/export', asyncHandler(async (req, res) => {
    // Add default user for export
  req.user = { _id: 'system', role: 'super_admin', name: 'System Export' };
  const { ids } = req.query;
  
  let filter = {};
  if (ids) {
    const idArray = ids.split(',').map(id => id.trim());
    filter._id = { $in: idArray };
  }

  await handleExport(req, res, EquineHealth, filter, 'equine-health');
}));

router.get('/template', asyncHandler(async (req, res) => {
    // Add default user for template
  req.user = { _id: 'system', role: 'super_admin', name: 'System Template' };
  await handleTemplate(req, res, 'equine-health');
}));

// Import route moved to centralized import-export.js

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
      const existingRecords = await EquineHealth.find({ _id: { $in: ids } });
      
      if (existingRecords.length !== ids.length) {
        return res.status(400).json({
          success: false,
          message: 'Some records not found',
          found: existingRecords.length,
          requested: ids.length
        });
      }

      // Delete the records by IDs
      const result = await EquineHealth.deleteMany({ _id: { $in: ids } });

      res.json({
        success: true,
        message: `${result.deletedCount} equine health records deleted successfully`,
        deletedCount: result.deletedCount
      });
    } catch (error) {
      console.error('Error in bulk delete equine health:', error);
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
  authorize(['super_admin']),
  asyncHandler(async (req, res) => {
    try {
      // Get all unique client IDs from equine health records before deletion
      // Note: EquineHealth stores client data as embedded object, not reference
      // So we need to extract client data differently
      const records = await EquineHealth.find({}, 'client').lean();
      const uniqueClientIds = records
        .map(record => record.client?._id || record.client)
        .filter(id => id);
      console.log(`🔍 Found ${uniqueClientIds.length} unique client IDs in equine health records`);
      
      // Get count before deletion for response
      const totalCount = await EquineHealth.countDocuments();
      
      if (totalCount === 0) {
        return res.json({
          success: true,
          message: 'No equine health records found to delete',
          deletedCount: 0,
          clientsDeleted: 0
        });
      }

      // Delete all equine health records
      const equineResult = await EquineHealth.deleteMany({});
      console.log(`🗑️ Deleted ${equineResult.deletedCount} equine health records`);
      
      // Delete associated clients (only those that were created from equine health imports)
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
        message: `All equine health records and associated clients deleted successfully`,
        deletedCount: equineResult.deletedCount,
        clientsDeleted: clientsDeleted,
        details: {
          equineHealthRecords: equineResult.deletedCount,
          clientRecords: clientsDeleted
        }
      });
    } catch (error) {
      console.error('Error in delete all equine health:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting all equine health records',
        error: error.message
      });
    }
  })
);

module.exports = router;
