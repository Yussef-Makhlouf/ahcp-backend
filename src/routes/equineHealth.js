const express = require('express');
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
 *           enum: [Emergency, Routine, Preventive, Follow-up, Breeding, Performance]
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
        { farmLocation: { $regex: search, $options: 'i' } },
        { diagnosis: { $regex: search, $options: 'i' } }
      ];
    }

    // Get records
    const records = await EquineHealth.find(filter)
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

router.post('/import', 
  auth,
  asyncHandler(async (req, res) => {
    // Use authenticated user for import
    // req.user is already set by auth middleware
  await handleImport(req, res, EquineHealth, async (rowData, req) => {
    // Find or create client
    const client = await findOrCreateClient({
      name: rowData['Name'] || rowData['اسم العميل'],
      nationalId: rowData['ID'] || rowData['رقم الهوية'],
      phone: rowData['Phone'] || rowData['رقم الهاتف'],
      village: rowData['Village'] || rowData['القرية'] || '',
      detailedAddress: rowData['Address'] || rowData['العنوان'] || '',
      birthDate: rowData['Birth Date'] || rowData['تاريخ الميلاد']
    });

    // Parse coordinates
    const latitude = parseFloat(rowData['N Coordinate'] || rowData['خط العرض'] || '0') || 0;
    const longitude = parseFloat(rowData['E Coordinate'] || rowData['خط الطول'] || '0') || 0;

    // Parse request dates
    const requestDate = rowData['Request Date'] || rowData['تاريخ الطلب'] || new Date().toISOString().split('T')[0];
    const fulfillingDate = rowData['Request Fulfilling Date'] || rowData['تاريخ إنجاز الطلب'] || undefined;

    return {
      serialNo: rowData['Serial No'] || rowData['رقم التسلسل'] || `EH${Date.now()}`,
      date: new Date(rowData['Date'] || rowData['التاريخ'] || new Date()),
      client: {
        name: client.name,
        nationalId: client.nationalId,
        phone: client.phone,
        village: client.village || '',
        detailedAddress: client.detailedAddress || '',
        birthDate: client.birthDate
      },
      farmLocation: rowData['Location'] || rowData['موقع المزرعة'] || '',
      coordinates: {
        latitude,
        longitude
      },
      supervisor: rowData['Supervisor'] || rowData['المشرف'] || 'غير محدد',
      vehicleNo: rowData['Vehicle No'] || rowData['رقم المركبة'] || 'غير محدد',
      horseCount: parseInt(rowData['Horse Count'] || rowData['عدد الخيول'] || '1') || 1,
      diagnosis: rowData['Diagnosis'] || rowData['التشخيص'] || '',
      interventionCategory: rowData['Intervention Category'] || rowData['فئة التدخل'] || 'Routine',
      treatment: rowData['Treatment'] || rowData['العلاج'] || '',
      followUpRequired: (rowData['Follow Up Required'] || rowData['يتطلب متابعة'] || 'false').toLowerCase() === 'true',
      followUpDate: rowData['Follow Up Date'] || rowData['تاريخ المتابعة'] || undefined,
      request: {
        date: new Date(requestDate),
        situation: rowData['Request Status'] || rowData['حالة الطلب'] || 'Open',
        fulfillingDate: fulfillingDate ? new Date(fulfillingDate) : undefined
      },
      remarks: rowData['Remarks'] || rowData['ملاحظات'] || ''
    };
  });
}));

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
  asyncHandler(async (req, res) => {
    let record;
    
    // Check if the ID is a valid ObjectId, otherwise search by serialNo
    if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      record = await EquineHealth.findById(req.params.id);
    } else {
      // Search by serialNo
      record = await EquineHealth.findOne({ serialNo: req.params.id });
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Equine health record not found',
        error: 'RECORD_NOT_FOUND'
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
 *             $ref: '#/components/schemas/EquineHealth'
 *     responses:
 *       201:
 *         description: Record created successfully
 *       400:
 *         description: Validation error
 */
router.post('/',
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
      ...req.body
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
 */
router.put('/:id',
  auth,
  authorize('super_admin', 'section_supervisor'),
  checkSectionAccessWithMessage('صحة الخيول'),
  asyncHandler(async (req, res) => {
    let record;
    
    // Check if the ID is a valid ObjectId, otherwise search by serialNo
    if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      record = await EquineHealth.findById(req.params.id);
    } else {
      // Search by serialNo
      record = await EquineHealth.findOne({ serialNo: req.params.id });
    }
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Equine health record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    // Update record
    Object.assign(record, req.body);
    await record.save();

    res.json({
      success: true,
      message: 'Equine health record updated successfully',
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
      const existingRecords = await EquineHealth.find({ _id: { $in: ids } });
      const existingIds = existingRecords.map(record => record._id.toString());
      const notFoundIds = ids.filter(id => !existingIds.includes(id));
      
      // If no records found at all, return error
      if (existingIds.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No equine health records found to delete',
          error: 'RESOURCE_NOT_FOUND',
          notFoundIds: ids,
          foundCount: 0,
          requestedCount: ids.length
        });
      }

      const result = await EquineHealth.deleteMany({ _id: { $in: existingIds } });
      
      // Prepare response with details about what was deleted and what wasn't found
      const response = {
        success: true,
        message: `${result.deletedCount} equine health records deleted successfully`,
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
        message: 'Error deleting equine health records',
        error: 'DELETE_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
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
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    let record;
    
    // Check if the ID is a valid ObjectId, otherwise search by serialNo
    if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      record = await EquineHealth.findById(req.params.id);
    } else {
      // Search by serialNo
      record = await EquineHealth.findOne({ serialNo: req.params.id });
    }
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Equine health record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    await EquineHealth.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Equine health record deleted successfully'
    });
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
 */
router.delete('/delete-all',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const result = await EquineHealth.deleteMany({});
    
    res.json({
      success: true,
      message: `All equine health records deleted successfully`,
      deletedCount: result.deletedCount
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
 * /api/equine-health/template:
 *   get:
 *     summary: Download CSV template for equine health import
 *     tags: [Equine Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV template file
 */
router.get('/template',
  asyncHandler(handleTemplate([{
    serialNo: 'EH001',
    date: '2024-01-15',
    clientName: 'محمد أحمد الشمري',
    clientNationalId: '1234567890',
    clientPhone: '+966501234567',
    clientVillage: 'الرياض',
    clientDetailedAddress: 'مزرعة الشمري، طريق الخرج',
    farmLocation: 'مزرعة الخيول الملكية',
    supervisor: 'د. أحمد محمد',
    vehicleNo: 'EH1',
    horseCount: 5,
    diagnosis: 'فحص دوري للخيول',
    interventionCategory: 'Clinical Examination',
    treatment: 'تطعيمات وقائية',
    followUpRequired: 'false',
    requestSituation: 'Open',
    remarks: 'فحص روتيني للخيول'
  }], 'equine-health-template'))
);

/**
 * @swagger
 * /api/equine-health/import:
 *   post:
 *     summary: Import equine health records from CSV
 *     tags: [Equine Health]
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
 *         description: Import results
 */
router.post('/import',
  auth,
  asyncHandler(handleImport(EquineHealth, require('../models/Client'), async (row, userId, ClientModel, EquineHealthModel, errors) => {
    // Use authenticated user for import
    // req.user is already set by auth middleware
    try {
      // Required fields validation
      const requiredFields = ['serialNo', 'date', 'clientName', 'farmLocation', 'supervisor', 'vehicleNo', 'horseCount', 'diagnosis'];
      for (const field of requiredFields) {
        if (!row[field] || row[field].toString().trim() === '') {
          errors.push(`الحقل "${field}" مطلوب`);
          return null;
        }
      }

      // Validate date format
      const date = new Date(row.date);
      if (isNaN(date.getTime())) {
        errors.push('تنسيق التاريخ غير صحيح. استخدم YYYY-MM-DD');
        return null;
      }

      // Validate intervention category
      const validCategories = ['Clinical Examination', 'Surgical Operation', 'Ultrasonography', 'Lab Analysis', 'Farriery'];
      if (row.interventionCategory && !validCategories.includes(row.interventionCategory)) {
        errors.push(`فئة التدخل يجب أن تكون إحدى: ${validCategories.join(', ')}`);
        return null;
      }

      // Validate horse count
      const horseCount = parseInt(row.horseCount);
      if (isNaN(horseCount) || horseCount < 1) {
        errors.push('عدد الخيول يجب أن يكون رقماً أكبر من صفر');
        return null;
      }

      // Check if serial number already exists
      const existingRecord = await EquineHealthModel.findOne({ serialNo: row.serialNo });
      if (existingRecord) {
        errors.push(`رقم السجل "${row.serialNo}" موجود مسبقاً`);
        return null;
      }

      // Create equine health record
      const equineHealthData = {
        serialNo: row.serialNo.trim(),
        date: date,
        client: {
          name: row.clientName?.trim(),
          nationalId: row.clientNationalId?.trim(),
          phone: row.clientPhone?.trim(),
          village: row.clientVillage?.trim() || '',
          detailedAddress: row.clientDetailedAddress?.trim() || ''
        },
        farmLocation: row.farmLocation.trim(),
        coordinates: {
          latitude: parseFloat(row.latitude) || 0,
          longitude: parseFloat(row.longitude) || 0
        },
        supervisor: row.supervisor.trim(),
        vehicleNo: row.vehicleNo.trim(),
        horseCount: horseCount,
        diagnosis: row.diagnosis.trim(),
        interventionCategory: row.interventionCategory || 'Clinical Examination',
        treatment: row.treatment?.trim() || '',
        followUpRequired: row.followUpRequired === 'true' || row.followUpRequired === '1',
        request: {
          date: date,
          situation: row.requestSituation || 'Open',
          fulfillingDate: row.requestFulfillingDate ? new Date(row.requestFulfillingDate) : undefined
        },
        remarks: row.remarks?.trim() || '',
      };

      const record = new EquineHealthModel(equineHealthData);
      await record.save();

      return record;
    } catch (error) {
      errors.push(`خطأ في إنشاء السجل: ${error.message}`);
      return null;
    }
  }))
);

module.exports = router;
