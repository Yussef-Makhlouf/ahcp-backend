const express = require('express');
const MobileClinic = require('../models/MobileClinic');
const Client = require('../models/Client');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { checkSectionAccessWithMessage } = require('../middleware/sectionAuth');
const { findOrCreateClient, parseFileData } = require('../utils/importExportHelpers');

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
    const { page = 1, limit = 30, startDate, endDate, interventionCategory, followUpRequired, supervisor, search } = req.query;
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
      let totalAnimalsExamined = 0;
      try {
        const animalStats = await MobileClinic.aggregate([
          { $match: filter },
          {
            $group: {
              _id: null,
              totalAnimals: {
                $sum: {
                  $add: [
                    { $ifNull: ['$animalCounts.sheep', 0] },
                    { $ifNull: ['$animalCounts.goats', 0] },
                    { $ifNull: ['$animalCounts.camel', 0] },
                    { $ifNull: ['$animalCounts.horse', 0] },
                    { $ifNull: ['$animalCounts.cattle', 0] }
                  ]
                }
              }
            }
          }
        ]);
        totalAnimalsExamined = animalStats.length > 0 ? animalStats[0].totalAnimals : 0;
      } catch (aggregationError) {
        console.warn('Animal stats aggregation failed, using fallback:', aggregationError.message);
        // Fallback: get basic count without aggregation
        totalAnimalsExamined = 0;
      }

      // الحالات الطارئة
      const emergencyCases = await MobileClinic.countDocuments({
        ...filter,
        interventionCategory: 'Emergency'
      });

      const statistics = {
        totalRecords,
        recordsThisMonth,
        totalAnimalsExamined,
        emergencyCases
      };

      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      console.error('Error getting mobile clinic statistics:', error);
      
      // Return basic statistics if complex queries fail
      try {
        const basicStats = {
          totalRecords: await MobileClinic.countDocuments(filter),
          recordsThisMonth: 0,
          totalAnimalsExamined: 0,
          emergencyCases: 0
        };
        
        res.json({
          success: true,
          data: basicStats
        });
      } catch (fallbackError) {
        res.status(500).json({
          success: false,
          message: 'Error retrieving statistics',
          error: error.message
        });
      }
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
 *           enum: [csv, json, excel]
 *         description: Export format
 *       - in: query
 *         name: interventionCategory
 *         schema:
 *           type: string
 *           enum: [Emergency, Routine, Preventive, Follow-up]
 *         description: Filter by intervention category
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
      .populate('client', 'name nationalId phone village detailedAddress birthDate')
      .sort({ date: -1 });

    // Transform data for export
    const transformedRecords = records.map(record => {
      // تحويل animalCounts إلى object بسيط
      const animalCounts = record.animalCounts || {};
      
      // تحويل client إلى object بسيط
      const client = record.client || {};
      
      // تحويل coordinates إلى object بسيط
      const coordinates = record.coordinates || {};
      
      // تحويل request إلى object بسيط
      const request = record.request || {};
      
      return {
        'Serial No': record.serialNo || '',
        'Date': record.date ? record.date.toISOString().split('T')[0] : '',
        'Name': client.name || '',
        'ID': client.nationalId || '',
        'Birth Date': client.birthDate ? new Date(client.birthDate).toISOString().split('T')[0] : '',
        'Phone': client.phone || '',
        'Location': record.farmLocation || '',
        'N Coordinate': coordinates.latitude || '',
        'E Coordinate': coordinates.longitude || '',
        'Supervisor': record.supervisor || '',
        'Vehicle No.': record.vehicleNo || '',
        'Sheep': animalCounts.sheep || 0,
        'Goats': animalCounts.goats || 0,
        'Camel': animalCounts.camel || 0,
        'Horse': animalCounts.horse || 0,
        'Cattle': animalCounts.cattle || 0,
        'Diagnosis': record.diagnosis || '',
        'Intervention Category': record.interventionCategory || '',
        'Treatment': record.treatment || '',
        'Request Date': request.date ? new Date(request.date).toISOString().split('T')[0] : '',
        'Request Status': request.situation || '',
        'Request Fulfilling Date': request.fulfillingDate ? new Date(request.fulfillingDate).toISOString().split('T')[0] : '',
        'Category': record.category || '',
        'Remarks': record.remarks || ''
      };
    });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(transformedRecords);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=mobile-clinics.csv');
      res.send(csv);
    } else if (format === 'excel') {
      const XLSX = require('xlsx');
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(transformedRecords);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Mobile Clinics');
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=mobile-clinics.xlsx');
      res.send(excelBuffer);
    } else {
      res.json({
        success: true,
        data: records
      });
    }
  })
);

// Specific routes must come before parameterized routes
// Export route
router.get('/export',
  asyncHandler(async (req, res) => {
    // Add default user for export
    req.user = { _id: 'system', role: 'super_admin', name: 'System Export' };
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
      .populate('client', 'name nationalId phone village detailedAddress birthDate')
      .sort({ date: -1 });

    // Transform data for export
    const transformedRecords = records.map(record => {
      // تحويل animalCounts إلى object بسيط
      const animalCounts = record.animalCounts || {};
      
      // تحويل client إلى object بسيط
      const client = record.client || {};
      
      // تحويل coordinates إلى object بسيط
      const coordinates = record.coordinates || {};
      
      // تحويل request إلى object بسيط
      const request = record.request || {};
      
      return {
        'Serial No': record.serialNo || '',
        'Date': record.date ? record.date.toISOString().split('T')[0] : '',
        'Name': client.name || '',
        'ID': client.nationalId || '',
        'Birth Date': client.birthDate ? new Date(client.birthDate).toISOString().split('T')[0] : '',
        'Phone': client.phone || '',
        'Location': record.farmLocation || '',
        'N Coordinate': coordinates.latitude || '',
        'E Coordinate': coordinates.longitude || '',
        'Supervisor': record.supervisor || '',
        'Vehicle No.': record.vehicleNo || '',
        'Sheep': animalCounts.sheep || 0,
        'Goats': animalCounts.goats || 0,
        'Camel': animalCounts.camel || 0,
        'Horse': animalCounts.horse || 0,
        'Cattle': animalCounts.cattle || 0,
        'Diagnosis': record.diagnosis || '',
        'Intervention Category': record.interventionCategory || '',
        'Treatment': record.treatment || '',
        'Request Date': request.date ? new Date(request.date).toISOString().split('T')[0] : '',
        'Request Status': request.situation || '',
        'Request Fulfilling Date': request.fulfillingDate ? new Date(request.fulfillingDate).toISOString().split('T')[0] : '',
        'Category': record.category || '',
        'Remarks': record.remarks || ''
      };
    });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(transformedRecords);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=mobile-clinics.csv');
      res.send(csv);
    } else if (format === 'excel') {
      const XLSX = require('xlsx');
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(transformedRecords);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Mobile Clinics');
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=mobile-clinics.xlsx');
      res.send(excelBuffer);
    } else {
      res.json({
        success: true,
        data: records
      });
    }
  })
);

// Template route
router.get('/template',
  asyncHandler(async (req, res) => {
    // Add default user for template
    req.user = { _id: 'system', role: 'super_admin', name: 'System Template' };
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

// Import route
router.post('/import',
  auth,
  asyncHandler(async (req, res) => {
    // Use authenticated user for import
    // req.user is already set by auth middleware
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
      },
      limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit - increased for large files
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
        // Parse file (CSV or Excel)
        const fileData = await parseFileData(req.file.path, req.file.originalname);
        
        // Add row numbers to results
        fileData.forEach((data, index) => {
          results.push({ ...data, rowNumber: index + 1 });
        });
        
        let successCount = 0;
        let errorCount = 0;
        const importedRecords = [];
        
        // Process each row
        for (const row of results) {
          try {
            // Support flexible field names and generate defaults if missing
            let serialNoField = row['Serial No'] || row['serialNo'] || row['رقم تسلسلي'] || row['الرقم'];
            let dateField = row['Date'] || row['date'] || row['التاريخ'] || row['تاريخ'];
            let nameField = row['Name'] || row['clientName'] || row['اسم العميل'] || row['الاسم'] || row['اسم المربي'];
            
            // Generate defaults for missing required fields
            if (!serialNoField) {
              serialNoField = `MC${Date.now().toString().slice(-8)}`;
              console.log(`⚠️  Row ${row.rowNumber}: Serial number auto-generated: ${serialNoField}`);
            }
            
            // Ensure serial number is not too long (max 20 characters)
            if (serialNoField.length > 20) {
              serialNoField = `MC${Date.now().toString().slice(-8)}`;
              console.log(`⚠️  Row ${row.rowNumber}: Serial number was too long, generated new: ${serialNoField}`);
            }
            
            if (!dateField) {
              dateField = new Date().toISOString().split('T')[0];
              console.log(`⚠️  Row ${row.rowNumber}: Date set to current date: ${dateField}`);
            }
            
            if (!nameField) {
              nameField = `Unknown Client ${row.rowNumber}`;
              console.log(`⚠️  Row ${row.rowNumber}: Client name auto-generated: ${nameField}`);
            }
            
            // Check if serial number already exists and generate unique one if needed
            let serialNo = serialNoField;
            const existingRecord = await MobileClinic.findOne({ serialNo: serialNo });
            if (existingRecord) {
              // Generate a unique serial number with shorter format
              const timestamp = Date.now().toString().slice(-6);
              serialNo = `MC${timestamp}${Math.floor(Math.random() * 100)}`;
              
              // Ensure it's under 20 characters
              if (serialNo.length > 20) {
                serialNo = `MC${timestamp}`;
              }
              
              console.log(`⚠️  Serial number '${serialNoField}' already exists. Generated new serial: '${serialNo}'`);
            }
            
            // Create client data object for findOrCreateClient function
            const rawNationalId = row['ID'] || row['clientNationalId'] || row['رقم الهوية'] || row['الهوية'] || '';
            const rawPhone = row['Phone'] || row['clientPhone'] || row['الهاتف'] || row['رقم الهاتف'] || '';
            
            const clientData = {
              clientName: nameField,
              // Generate valid nationalId if missing or invalid
              clientNationalId: rawNationalId && rawNationalId.length >= 10 && rawNationalId.length <= 14 
                ? rawNationalId 
                : `1000000${Date.now().toString().slice(-6)}`, // Generate 13-digit ID
              // Generate valid phone if missing or invalid
              clientPhone: rawPhone && rawPhone.match(/^\+?[0-9]{10,15}$/) 
                ? rawPhone 
                : `+966500000${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`, // Generate valid Saudi phone
              clientVillage: row['clientVillage'] || row['القرية'] || '',
              clientDetailedAddress: row['clientDetailedAddress'] || row['العنوان التفصيلي'] || ''
            };
            
            // Find or create client
            const client = await findOrCreateClient(clientData, req.user._id, Client);
            if (!client) {
              errors.push({
                row: row.rowNumber,
                field: 'client',
                message: 'Could not create or find client'
              });
              errorCount++;
              continue;
            }
            
            // Update client with birth date if provided
            const birthDateField = row['Birth Date'] || row['birthDate'];
            if (birthDateField && client) {
              try {
                client.birthDate = new Date(birthDateField);
                await client.save();
              } catch (birthDateError) {
                console.warn('Could not set birth date:', birthDateError.message);
              }
            }
            
            // Parse coordinates
            const coordinates = {};
            const eCoord = row['E Coordinate'] || row['longitude'] || row['خط الطول'] || row['الطول'];
            const nCoord = row['N Coordinate'] || row['latitude'] || row['خط العرض'] || row['العرض'];
            if (eCoord && !isNaN(parseFloat(eCoord))) {
              coordinates.longitude = parseFloat(eCoord);
            }
            if (nCoord && !isNaN(parseFloat(nCoord))) {
              coordinates.latitude = parseFloat(nCoord);
            }
            
            // Create mobile clinic record with flexible field mapping
            const mobileClinicData = {
              serialNo: serialNo,
              date: new Date(dateField),
              client: client._id,
              createdBy: req.user._id,
              updatedBy: req.user._id,
              farmLocation: row['Location'] || row['farmLocation'] || row['الموقع'] || row['موقع المزرعة'] || '',
              coordinates: Object.keys(coordinates).length > 0 ? coordinates : undefined,
              supervisor: row['Supervisor'] || row['supervisor'] || row['المشرف'] || row['الطبيب'] || 'N/A',
              vehicleNo: row['Vehicle No.'] || row['Vehicle No'] || row['vehicleNo'] || row['رقم المركبة'] || 'N/A',
              animalCounts: {
                sheep: parseInt(row['Sheep'] || row['sheep'] || row['الأغنام'] || row['غنم']) || 0,
                goats: parseInt(row['Goats'] || row['goats'] || row['الماعز'] || row['معز']) || 0,
                camel: parseInt(row['Camel'] || row['camel'] || row['الإبل'] || row['جمال']) || 0,
                horse: parseInt(row['Horse'] || row['horse'] || row['الخيول'] || row['خيل']) || 0,
                cattle: parseInt(row['Cattle'] || row['cattle'] || row['الأبقار'] || row['بقر']) || 0
              },
              diagnosis: row['Diagnosis'] || row['diagnosis'] || row['التشخيص'] || row['الحالة'] || '',
              interventionCategory: row['Intervention Category'] || row['interventionCategory'] || row['نوع التدخل'] || 'Routine',
              treatment: row['Treatment'] || row['treatment'] || row['العلاج'] || row['المعالجة'] || '',
              request: {
                date: new Date(row['Request Date'] || row['requestDate'] || row['تاريخ الطلب'] || dateField),
                situation: ['Open', 'Closed', 'Pending'].includes(row['Request Status'] || row['requestSituation'] || row['حالة الطلب']) 
                  ? (row['Request Status'] || row['requestSituation'] || row['حالة الطلب'])
                  : 'Open',
                fulfillingDate: (row['Request Fulfilling Date'] || row['requestFulfillingDate'] || row['تاريخ تنفيذ الطلب']) ? new Date(row['Request Fulfilling Date'] || row['requestFulfillingDate'] || row['تاريخ تنفيذ الطلب']) : undefined
              },
              category: row['Category'] || row['category'] || row['الفئة'] || row['التصنيف'] || '',
              remarks: row['Remarks'] || row['remarks'] || row['الملاحظات'] || row['ملاحظات'] || ''
            };
            
            // Create mobile clinic record
            const mobileClinicRecord = new MobileClinic(mobileClinicData);
            await mobileClinicRecord.save();
            
            importedRecords.push(mobileClinicRecord);
            successCount++;
            
          } catch (error) {
            console.error('Error processing row:', error);
            errors.push({
              row: row.rowNumber,
              field: 'processing',
              message: error.message
            });
            errorCount++;
          }
        }
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        
        res.json({
          success: true,
          message: `Import completed. ${successCount} records imported successfully, ${errorCount} failed.`,
          totalRows: results.length,
          successRows: successCount,
          errorRows: errorCount,
          errors: errors,
          importedRecords: importedRecords
        });
        
      } catch (error) {
        console.error('Import error:', error);
        
        // Clean up uploaded file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
          success: false,
          message: 'Import failed',
          error: error.message
        });
      }
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

    let clientId = req.body.client;

    // If client is an object (new client data), create or find the client
    if (typeof req.body.client === 'object' && req.body.client !== null) {
      const clientData = {
        clientName: req.body.client.name,
        clientNationalId: req.body.client.nationalId,
        clientPhone: req.body.client.phone,
        clientVillage: req.body.client.village || '',
        clientDetailedAddress: req.body.client.detailedAddress || ''
      };
      
      const client = await findOrCreateClient(clientData, req.user._id, Client);
      if (!client) {
        return res.status(400).json({
          success: false,
          message: 'Failed to create or find client',
          error: 'CLIENT_ERROR'
        });
      }
      clientId = client._id;
    }

    const record = new MobileClinic({
      ...req.body,
      client: clientId,
      createdBy: req.user._id
    });

    await record.save();
    await record.populate('client', 'name nationalId phone village detailedAddress');

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
  authorize('super_admin', 'section_supervisor'),
  checkSectionAccessWithMessage('العيادات المتنقلة'),
  asyncHandler(async (req, res) => {
    const record = await MobileClinic.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Mobile clinic record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    let clientId = req.body.client;

    // If client is an object (new client data), create or find the client
    if (typeof req.body.client === 'object' && req.body.client !== null) {
      const clientData = {
        clientName: req.body.client.name,
        clientNationalId: req.body.client.nationalId,
        clientPhone: req.body.client.phone,
        clientVillage: req.body.client.village || '',
        clientDetailedAddress: req.body.client.detailedAddress || ''
      };
      
      const client = await findOrCreateClient(clientData, req.user._id, Client);
      if (!client) {
        return res.status(400).json({
          success: false,
          message: 'Failed to create or find client',
          error: 'CLIENT_ERROR'
        });
      }
      clientId = client._id;
    }

    // Update record
    Object.assign(record, { ...req.body, client: clientId });
    record.updatedBy = req.user._id;
    await record.save();
    await record.populate('client', 'name nationalId phone village detailedAddress');

    res.json({
      success: true,
      message: 'Mobile clinic record updated successfully',
      data: { record }
    });
  })
);

/**
 * @swagger
 * /api/mobile-clinics/bulk-delete:
 *   delete:
 *     summary: Delete multiple mobile clinic records
 *     tags: [Mobile Clinics]
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
      const existingRecords = await MobileClinic.find({ _id: { $in: ids } });
      const existingIds = existingRecords.map(record => record._id.toString());
      const notFoundIds = ids.filter(id => !existingIds.includes(id));
      
      // If no records found at all, return error
      if (existingIds.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No mobile clinic records found to delete',
          error: 'RESOURCE_NOT_FOUND',
          notFoundIds: ids,
          foundCount: 0,
          requestedCount: ids.length
        });
      }

      const result = await MobileClinic.deleteMany({ _id: { $in: existingIds } });
      
      // Prepare response with details about what was deleted and what wasn't found
      const response = {
        success: true,
        message: `${result.deletedCount} mobile clinic records deleted successfully`,
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
        message: 'Error deleting mobile clinic records',
        error: 'DELETE_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/mobile-clinics/delete-all:
 *   delete:
 *     summary: Delete all mobile clinic records
 *     tags: [Mobile Clinics]
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
    const result = await MobileClinic.deleteMany({});
    
    res.json({
      success: true,
      message: `All mobile clinic records deleted successfully`,
      deletedCount: result.deletedCount
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
  asyncHandler(async (req, res) => {
    // Add default user for template
    req.user = { _id: 'system', role: 'super_admin', name: 'System Template' };
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
  asyncHandler(async (req, res) => {
    // Use authenticated user for import
    // req.user is already set by auth middleware
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
      },
      limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit - increased for large files // 10MB limit
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
        // Parse file (CSV or Excel)
        const fileData = await parseFileData(req.file.path, req.file.originalname);
        
        // Add row numbers to results
        fileData.forEach((data, index) => {
          results.push({ ...data, rowNumber: index + 1 });
        });
        
        let successCount = 0;
        let errorCount = 0;
        const importedRecords = [];
        
        // Process each row
        for (const row of results) {
          try {
            // Support flexible field names and generate defaults if missing
            let serialNoField = row['Serial No'] || row['serialNo'] || row['رقم تسلسلي'] || row['الرقم'];
            let dateField = row['Date'] || row['date'] || row['التاريخ'] || row['تاريخ'];
            let nameField = row['Name'] || row['clientName'] || row['اسم العميل'] || row['الاسم'] || row['اسم المربي'];
            
            // Generate defaults for missing required fields
            if (!serialNoField) {
              serialNoField = `MC${Date.now().toString().slice(-8)}`;
              console.log(`⚠️  Row ${row.rowNumber}: Serial number auto-generated: ${serialNoField}`);
            }
            
            // Ensure serial number is not too long (max 20 characters)
            if (serialNoField.length > 20) {
              serialNoField = `MC${Date.now().toString().slice(-8)}`;
              console.log(`⚠️  Row ${row.rowNumber}: Serial number was too long, generated new: ${serialNoField}`);
            }
            
            if (!dateField) {
              dateField = new Date().toISOString().split('T')[0];
              console.log(`⚠️  Row ${row.rowNumber}: Date set to current date: ${dateField}`);
            }
            
            if (!nameField) {
              nameField = `Unknown Client ${row.rowNumber}`;
              console.log(`⚠️  Row ${row.rowNumber}: Client name auto-generated: ${nameField}`);
            }
            
            // Check if serial number already exists and generate unique one if needed
            let serialNo = serialNoField;
            const existingRecord = await MobileClinic.findOne({ serialNo: serialNo });
            if (existingRecord) {
              // Generate a unique serial number with shorter format
              const timestamp = Date.now().toString().slice(-6);
              serialNo = `MC${timestamp}${Math.floor(Math.random() * 100)}`;
              
              // Ensure it's under 20 characters
              if (serialNo.length > 20) {
                serialNo = `MC${timestamp}`;
              }
              
              console.log(`⚠️  Serial number '${serialNoField}' already exists. Generated new serial: '${serialNo}'`);
            }
            
            // Create client data object for findOrCreateClient function
            const rawNationalId = row['ID'] || row['clientNationalId'] || row['رقم الهوية'] || row['الهوية'] || '';
            const rawPhone = row['Phone'] || row['clientPhone'] || row['الهاتف'] || row['رقم الهاتف'] || '';
            
            const clientData = {
              clientName: nameField,
              // Generate valid nationalId if missing or invalid
              clientNationalId: rawNationalId && rawNationalId.length >= 10 && rawNationalId.length <= 14 
                ? rawNationalId 
                : `1000000${Date.now().toString().slice(-6)}`, // Generate 13-digit ID
              // Generate valid phone if missing or invalid
              clientPhone: rawPhone && rawPhone.match(/^\+?[0-9]{10,15}$/) 
                ? rawPhone 
                : `+966500000${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`, // Generate valid Saudi phone
              clientVillage: row['clientVillage'] || row['القرية'] || '',
              clientDetailedAddress: row['clientDetailedAddress'] || row['العنوان التفصيلي'] || ''
            };
            
            // Find or create client
            const client = await findOrCreateClient(clientData, req.user._id, Client);
            if (!client) {
              errors.push({
                row: row.rowNumber,
                field: 'client',
                message: 'Could not create or find client'
              });
              errorCount++;
              continue;
            }
            
            // Update client with birth date if provided
            const birthDateField = row['Birth Date'] || row['birthDate'];
            if (birthDateField && client) {
              try {
                client.birthDate = new Date(birthDateField);
                await client.save();
              } catch (birthDateError) {
                console.warn('Could not set birth date:', birthDateError.message);
              }
            }
            
            // Parse coordinates
            const coordinates = {};
            const eCoord = row['E Coordinate'] || row['longitude'] || row['خط الطول'] || row['الطول'];
            const nCoord = row['N Coordinate'] || row['latitude'] || row['خط العرض'] || row['العرض'];
            if (eCoord && !isNaN(parseFloat(eCoord))) {
              coordinates.longitude = parseFloat(eCoord);
            }
            if (nCoord && !isNaN(parseFloat(nCoord))) {
              coordinates.latitude = parseFloat(nCoord);
            }
            
            // Create mobile clinic record with flexible field mapping
            const mobileClinicData = {
              serialNo: serialNo,
              date: new Date(dateField),
              client: client._id,
              createdBy: req.user._id,
              updatedBy: req.user._id,
              farmLocation: row['Location'] || row['farmLocation'] || row['الموقع'] || row['موقع المزرعة'] || '',
              coordinates: Object.keys(coordinates).length > 0 ? coordinates : undefined,
              supervisor: row['Supervisor'] || row['supervisor'] || row['المشرف'] || row['الطبيب'] || 'N/A',
              vehicleNo: row['Vehicle No.'] || row['Vehicle No'] || row['vehicleNo'] || row['رقم المركبة'] || 'N/A',
              animalCounts: {
                sheep: parseInt(row['Sheep'] || row['sheep'] || row['الأغنام'] || row['غنم']) || 0,
                goats: parseInt(row['Goats'] || row['goats'] || row['الماعز'] || row['معز']) || 0,
                camel: parseInt(row['Camel'] || row['camel'] || row['الإبل'] || row['جمال']) || 0,
                horse: parseInt(row['Horse'] || row['horse'] || row['الخيول'] || row['خيل']) || 0,
                cattle: parseInt(row['Cattle'] || row['cattle'] || row['الأبقار'] || row['بقر']) || 0
              },
              diagnosis: row['Diagnosis'] || row['diagnosis'] || row['التشخيص'] || row['الحالة'] || '',
              interventionCategory: row['Intervention Category'] || row['interventionCategory'] || row['نوع التدخل'] || 'Routine',
              treatment: row['Treatment'] || row['treatment'] || row['العلاج'] || row['المعالجة'] || '',
              request: {
                date: new Date(row['Request Date'] || row['requestDate'] || row['تاريخ الطلب'] || dateField),
                situation: ['Open', 'Closed', 'Pending'].includes(row['Request Status'] || row['requestSituation'] || row['حالة الطلب']) 
                  ? (row['Request Status'] || row['requestSituation'] || row['حالة الطلب'])
                  : 'Open',
                fulfillingDate: (row['Request Fulfilling Date'] || row['requestFulfillingDate'] || row['تاريخ تنفيذ الطلب']) ? new Date(row['Request Fulfilling Date'] || row['requestFulfillingDate'] || row['تاريخ تنفيذ الطلب']) : undefined
              },
              category: row['Category'] || row['category'] || row['الفئة'] || row['التصنيف'] || '',
              remarks: row['Remarks'] || row['remarks'] || row['الملاحظات'] || row['ملاحظات'] || ''
            };
            
            // Create mobile clinic record
            const mobileClinicRecord = new MobileClinic(mobileClinicData);
            await mobileClinicRecord.save();
            
            importedRecords.push(mobileClinicRecord);
            successCount++;
            
          } catch (error) {
            console.error('Error processing row:', error);
            errors.push({
              row: row.rowNumber,
              field: 'processing',
              message: error.message
            });
            errorCount++;
          }
        }
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        
        res.json({
          success: true,
          message: `Import completed. ${successCount} records imported successfully, ${errorCount} failed.`,
          totalRows: results.length,
          successRows: successCount,
          errorRows: errorCount,
          errors: errors,
          importedRecords: importedRecords
        });
        
      } catch (error) {
        console.error('Import error:', error);
        
        // Clean up uploaded file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
          success: false,
          message: 'Import failed',
          error: error.message
        });
      }
    });
  })
);

module.exports = router;
   