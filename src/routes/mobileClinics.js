const express = require('express');
const MobileClinic = require('../models/MobileClinic');
const Client = require('../models/Client');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

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
    const { page = 1, limit = 10, startDate, endDate, interventionCategory, followUpRequired, supervisor, search } = req.query;
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
        .populate('client', 'name nationalId phone village detailedAddress')
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
      const animalStats = await MobileClinic.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalAnimals: {
              $sum: {
                $add: [
                  { $ifNull: ['$sheep', 0] },
                  { $ifNull: ['$goats', 0] },
                  { $ifNull: ['$camel', 0] },
                  { $ifNull: ['$horse', 0] },
                  { $ifNull: ['$cattle', 0] }
                ]
              }
            }
          }
        }
      ]);

      // الحالات الطارئة
      const emergencyCases = await MobileClinic.countDocuments({
        ...filter,
        interventionCategory: 'Emergency'
      });

      const statistics = {
        totalRecords,
        recordsThisMonth,
        totalAnimalsExamined: animalStats.length > 0 ? animalStats[0].totalAnimals : 0,
        emergencyCases
      };

      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      console.error('Error getting mobile clinic statistics:', error);
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
    }).populate('client', 'name nationalId phone village');

    res.json({
      success: true,
      data: followUpRecords
    });
  })
);

/**
 * @swagger
 * /api/mobile-clinics/{id}:
 *   get:
 *     summary: Get mobile clinic record by ID
 *     tags: [Mobile Clinics]
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
    const record = await MobileClinic.findById(req.params.id)
      .populate('client', 'name nationalId phone village detailedAddress')
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Mobile clinic record not found',
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
 * /api/mobile-clinics:
 *   post:
 *     summary: Create new mobile clinic record
 *     tags: [Mobile Clinics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MobileClinic'
 *     responses:
 *       201:
 *         description: Record created successfully
 *       400:
 *         description: Validation error
 */
router.post('/',
  auth,
  asyncHandler(async (req, res) => {
    // Check if serial number already exists
    const existingRecord = await MobileClinic.findOne({ serialNo: req.body.serialNo });
    if (existingRecord) {
      return res.status(400).json({
        success: false,
        message: 'Serial number already exists',
        error: 'SERIAL_NUMBER_EXISTS'
      });
    }

    const record = new MobileClinic({
      ...req.body,
      createdBy: req.user._id
    });

    await record.save();
    await record.populate('client', 'name nationalId phone village');

    res.status(201).json({
      success: true,
      message: 'Mobile clinic record created successfully',
      data: { record }
    });
  })
);

/**
 * @swagger
 * /api/mobile-clinics/{id}:
 *   put:
 *     summary: Update mobile clinic record
 *     tags: [Mobile Clinics]
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
 *             $ref: '#/components/schemas/MobileClinic'
 *     responses:
 *       200:
 *         description: Record updated successfully
 *       404:
 *         description: Record not found
 */
router.put('/:id',
  auth,
  asyncHandler(async (req, res) => {
    const record = await MobileClinic.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Mobile clinic record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    // Update record
    Object.assign(record, req.body);
    record.updatedBy = req.user._id;
    await record.save();
    await record.populate('client', 'name nationalId phone village');

    res.json({
      success: true,
      message: 'Mobile clinic record updated successfully',
      data: { record }
    });
  })
);

/**
 * @swagger
 * /api/mobile-clinics/{id}:
 *   delete:
 *     summary: Delete mobile clinic record
 *     tags: [Mobile Clinics]
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
    const record = await MobileClinic.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Mobile clinic record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    await MobileClinic.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Mobile clinic record deleted successfully'
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
 *           enum: [csv, json]
 *         description: Export format
 *       - in: query
 *         name: interventionCategory
 *         schema:
 *           type: string
 *           enum: [Emergency, Routine, Preventive, Follow-up]
 *         description: Filter by intervention category
 *     responses:
 *       200:
 *         description: Data exported successfully
 */
router.get('/export',
  auth,
  asyncHandler(async (req, res) => {
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
      .populate('client', 'name nationalId phone village')
      .sort({ date: -1 });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const fields = [
        'serialNo',
        'date',
        { label: 'Client Name', value: 'client.name' },
        { label: 'Client ID', value: 'client.nationalId' },
        { label: 'Client Phone', value: 'client.phone' },
        'farmLocation',
        'supervisor',
        'vehicleNo',
        { label: 'Total Animals', value: 'totalAnimals' },
        'interventionCategory',
        'diagnosis',
        'treatment',
        { label: 'Request Status', value: 'request.situation' },
        'followUpRequired',
        'remarks',
        'createdAt'
      ];
      
      const parser = new Parser({ fields });
      const csv = parser.parse(records);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=mobile-clinics.csv');
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
 * /api/mobile-clinics/template:
 *   get:
 *     summary: Download import template for mobile clinic records
 *     tags: [Mobile Clinics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Template downloaded successfully
 */
router.get('/template',
  auth,
  asyncHandler(async (req, res) => {
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

/**
 * @swagger
 * /api/mobile-clinics/import:
 *   post:
 *     summary: Import mobile clinic records from CSV
 *     tags: [Mobile Clinics]
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
  asyncHandler(async (req, res) => {
    const multer = require('multer');
    const csv = require('csv-parser');
    const fs = require('fs');
    const path = require('path');
    
    // Configure multer for file upload
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
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
          cb(null, true);
        } else {
          cb(new Error('Only CSV files are allowed'));
        }
      },
      limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
    }).single('file');
    
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }
      
      const results = [];
      const errors = [];
      let rowNumber = 0;
      
      try {
        // Parse CSV file
        await new Promise((resolve, reject) => {
          fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (data) => {
              rowNumber++;
              results.push({ ...data, rowNumber });
            })
            .on('end', resolve)
            .on('error', reject);
        });
        
        let successCount = 0;
        let errorCount = 0;
        const importedRecords = [];
        
        // Process each row
        for (const row of results) {
          try {
            // Validate required fields
            if (!row.serialNo || !row.date || !row.clientName) {
              errors.push({
                row: row.rowNumber,
                field: 'required',
                message: 'Missing required fields: serialNo, date, or clientName'
              });
              errorCount++;
              continue;
            }
            
            // Create or find client
            let client;
            if (row.clientNationalId) {
              client = await Client.findOne({ nationalId: row.clientNationalId });
            }
            
            if (!client) {
              // Create new client
              client = new Client({
                name: row.clientName,
                nationalId: row.clientNationalId || `TEMP-${Date.now()}`,
                phone: row.clientPhone || '',
                village: row.clientVillage || '',
                detailedAddress: row.clientDetailedAddress || '',
                status: 'نشط',
                animals: [],
                availableServices: ['mobile_clinic'],
                createdBy: req.user._id
              });
              await client.save();
            }
            
            // Create mobile clinic record
            const mobileClinicData = {
              serialNo: row.serialNo,
              date: new Date(row.date),
              client: client._id,
              farmLocation: row.farmLocation || '',
              supervisor: row.supervisor || '',
              vehicleNo: row.vehicleNo || '',
              animalCounts: {
                sheep: parseInt(row.sheep) || 0,
                goats: parseInt(row.goats) || 0,
                camel: parseInt(row.camel) || 0,
                cattle: parseInt(row.cattle) || 0,
                horse: parseInt(row.horse) || 0
              },
              diagnosis: row.diagnosis || '',
              interventionCategory: row.interventionCategory || 'Routine',
              treatment: row.treatment || '',
              request: {
                date: new Date(row.requestDate || row.date),
                situation: row.requestSituation || 'Open'
              },
              followUpRequired: row.followUpRequired === 'true',
              remarks: row.remarks || '',
              createdBy: req.user._id
            };
            
            const mobileClinic = new MobileClinic(mobileClinicData);
            await mobileClinic.save();
            
            // Populate client data for response
            await mobileClinic.populate('client', 'name nationalId phone village detailedAddress');
            importedRecords.push(mobileClinic);
            successCount++;
            
          } catch (error) {
            errors.push({
              row: row.rowNumber,
              field: 'validation',
              message: error.message
            });
            errorCount++;
          }
        }
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        
        res.json({
          success: errorCount === 0,
          totalRows: results.length,
          successRows: successCount,
          errorRows: errorCount,
          errors: errors,
          importedRecords: importedRecords
        });
        
      } catch (error) {
        // Clean up uploaded file on error
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
          success: false,
          message: 'Error processing file: ' + error.message
        });
      }
    });
  })
);

module.exports = router;
