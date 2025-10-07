const express = require('express');
const Vaccination = require('../models/Vaccination');
const Client = require('../models/Client');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { checkSectionAccessWithMessage } = require('../middleware/sectionAuth');
const { handleTemplate, handleImport, findOrCreateClient } = require('../utils/importExportHelpers');

const router = express.Router();

/**
 * @swagger
 * /api/vaccination:
 *   get:
 *     summary: Get all vaccination records
 *     tags: [Vaccination]
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
 *         name: vaccineType
 *         schema:
 *           type: string
 *         description: Filter by vaccine type
 *       - in: query
 *         name: vaccineCategory
 *         schema:
 *           type: string
 *           enum: [Preventive, Emergency]
 *         description: Filter by vaccine category
 *     responses:
 *       200:
 *         description: Records retrieved successfully
 */
router.get('/',
  auth,
  validateQuery(schemas.dateRangeQuery),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, startDate, endDate, vaccineType, vaccineCategory, supervisor, search } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    if (vaccineType) {
      filter.vaccineType = { $regex: vaccineType, $options: 'i' };
    }
    if (vaccineCategory) {
      filter.vaccineCategory = vaccineCategory;
    }
    if (supervisor) {
      filter.supervisor = { $regex: supervisor, $options: 'i' };
    }
    if (search) {
      filter.$or = [
        { serialNo: { $regex: search, $options: 'i' } },
        { supervisor: { $regex: search, $options: 'i' } },
        { team: { $regex: search, $options: 'i' } },
        { vehicleNo: { $regex: search, $options: 'i' } },
        { vaccineType: { $regex: search, $options: 'i' } }
      ];
    }

    // Get records with error handling
    let records;
    try {
      records = await Vaccination.find(filter)
        .populate('client', 'name nationalId phone village detailedAddress')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ date: -1 })
        .lean(); // Use lean() for better performance
    } catch (populateError) {
      console.error('Populate error, falling back to basic query:', populateError);
      // Fallback without populate if there's an issue
      records = await Vaccination.find(filter)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ date: -1 })
        .lean();
    }

    const total = await Vaccination.countDocuments(filter);

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
 * /api/vaccination/statistics:
 *   get:
 *     summary: Get vaccination statistics
 *     tags: [Vaccination]
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
      const statistics = await Vaccination.getStatistics(filter);
      
      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      console.error('Error getting vaccination statistics:', error);
      
      // Return default statistics if method fails
      const defaultStats = {
        totalRecords: await Vaccination.countDocuments(filter),
        recordsThisMonth: 0,
        totalAnimalsVaccinated: 0,
        totalVaccinesUsed: 0
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
 * /api/vaccination/{id}:
 *   get:
 *     summary: Get vaccination record by ID
 *     tags: [Vaccination]
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
    const record = await Vaccination.findById(req.params.id)
      .populate('client', 'name nationalId phone village detailedAddress')
      // .populate('createdBy', 'name email role')
      // .populate('updatedBy', 'name email role');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Vaccination record not found',
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
 * /api/vaccination:
 *   post:
 *     summary: Create new vaccination record
 *     tags: [Vaccination]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Vaccination'
 *     responses:
 *       201:
 *         description: Record created successfully
 *       400:
 *         description: Validation error
 */
router.post('/',
  auth,
  validate(schemas.vaccinationCreate),
  asyncHandler(async (req, res) => {
    // Check if serial number already exists
    const existingRecord = await Vaccination.findOne({ serialNo: req.body.serialNo });
    if (existingRecord) {
      return res.status(400).json({
        success: false,
        message: 'Serial number already exists',
        error: 'SERIAL_NUMBER_EXISTS'
      });
    }

    let clientId = req.body.client;

    // If clientData is provided, create or find the client
    if (req.body.clientData) {
      const clientData = req.body.clientData;
      
      // Try to find existing client by nationalId
      let client = await Client.findOne({ nationalId: clientData.nationalId });
      
      if (!client) {
        // Create new client
        client = new Client({
          name: clientData.name,
          nationalId: clientData.nationalId,
          phone: clientData.phone,
          village: clientData.village || '',
          detailedAddress: clientData.detailedAddress || '',
          birthDate: clientData.birthDate || undefined,
          status: 'نشط',
          availableServices: ['vaccination'], createdBy: req.user._id
        });
        await client.save();
      } else {
        // Update existing client with new data if provided
        if (clientData.name) client.name = clientData.name;
        if (clientData.phone) client.phone = clientData.phone;
        if (clientData.village) client.village = clientData.village;
        if (clientData.detailedAddress) client.detailedAddress = clientData.detailedAddress;
        if (clientData.birthDate) client.birthDate = clientData.birthDate;
        
        // Add vaccination to available services if not already present
        if (!client.availableServices.includes('vaccination')) {
          client.availableServices.push('vaccination');
        }
        await client.save();
      }
      
      clientId = client._id;
    }

    const record = new Vaccination({
      ...req.body,
      client: clientId,
      // createdBy: req.user._id,
      // Remove clientData from the record
      clientData: undefined
    });

    await record.save();
    await record.populate('client', 'name nationalId phone village detailedAddress');

    res.status(201).json({
      success: true,
      message: 'Vaccination record created successfully',
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
 * /api/vaccination/{id}:
 *   put:
 *     summary: Update vaccination record
 *     tags: [Vaccination]
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
 *             $ref: '#/components/schemas/Vaccination'
 *     responses:
 *       200:
 *         description: Record updated successfully
 *       404:
 *         description: Record not found
 */
router.put('/:id',
  auth,
  authorize('super_admin', 'section_supervisor'),
  checkSectionAccessWithMessage('التطعيمات'),
  validate(schemas.vaccinationCreate),
  asyncHandler(async (req, res) => {
    const record = await Vaccination.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Vaccination record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    // Check if serial number is being changed and if it already exists
    if (req.body.serialNo !== record.serialNo) {
      const existingRecord = await Vaccination.findOne({ 
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

    let clientId = req.body.client;

    // If clientData is provided, create or find the client
    if (req.body.clientData) {
      const clientData = req.body.clientData;
      
      // Try to find existing client by nationalId
      let client = await Client.findOne({ nationalId: clientData.nationalId });
      
      if (!client) {
        // Create new client
        client = new Client({
          name: clientData.name,
          nationalId: clientData.nationalId,
          phone: clientData.phone,
          village: clientData.village || '',
          detailedAddress: clientData.detailedAddress || '',
          birthDate: clientData.birthDate || undefined,
          status: 'نشط',
          availableServices: ['vaccination'], createdBy: req.user._id
        });
        await client.save();
      } else {
        // Update existing client with new data if provided
        if (clientData.name) client.name = clientData.name;
        if (clientData.phone) client.phone = clientData.phone;
        if (clientData.village) client.village = clientData.village;
        if (clientData.detailedAddress) client.detailedAddress = clientData.detailedAddress;
        if (clientData.birthDate) client.birthDate = clientData.birthDate;
        
        // Add vaccination to available services if not already present
        if (!client.availableServices.includes('vaccination')) {
          client.availableServices.push('vaccination');
        }
        await client.save();
      }
      
      clientId = client._id;
    }

    // Update record
    Object.assign(record, {
      ...req.body,
      client: clientId,
      clientData: undefined // Remove clientData from the record
    });
    record.updatedBy = req.user._id;
    await record.save();
    await record.populate('client', 'name nationalId phone village detailedAddress');

    res.json({
      success: true,
      message: 'Vaccination record updated successfully',
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
 * /api/vaccination/{id}:
 *   delete:
 *     summary: Delete vaccination record
 *     tags: [Vaccination]
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
    const record = await Vaccination.findById(req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Vaccination record not found',
        error: 'RECORD_NOT_FOUND'
      });
    }

    await Vaccination.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Vaccination record deleted successfully'
    });
  })
);

/**
 * @swagger
 * /api/vaccination/vaccine-types:
 *   get:
 *     summary: Get unique vaccine types
 *     tags: [Vaccination]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Vaccine types retrieved successfully
 */
router.get('/vaccine-types',
  auth,
  asyncHandler(async (req, res) => {
    const vaccineTypes = await Vaccination.distinct('vaccineType');
    
    res.json({
      success: true,
      data: { vaccineTypes }
    });
  })
);

/**
 * @swagger
 * /api/vaccination/export:
 *   get:
 *     summary: Export vaccination records
 *     tags: [Vaccination]
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

    const records = await Vaccination.find(filter)
      .populate('client', 'name nationalId phone village')
      .sort({ date: -1 });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const fields = [
        'serialNo',
        'date',
        'client.name',
        'client.nationalId',
        'farmLocation',
        'supervisor',
        'team',
        'vehicleNo',
        'vaccineType',
        'vaccineCategory',
        'totalHerdCount',
        'totalVaccinated',
        'vaccinationCoverage',
        'herdHealth',
        'animalsHandling',
        'labours',
        'reachableLocation'
      ];
      
      const parser = new Parser({ fields });
      const csv = parser.parse(records);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=vaccination-records.csv');
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
 * /api/vaccination/template:
 *   get:
 *     summary: Download import template for vaccination records
 *     tags: [Vaccination]
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
      serialNo: 'V001',
      date: '2024-01-15',
      clientName: 'محمد أحمد الشمري',
      clientNationalId: '1234567890',
      clientPhone: '+966501234567',
      clientVillage: 'قرية النور',
      farmLocation: 'مزرعة الشمري',
      supervisor: 'د. محمد علي',
      team: 'فريق التحصين الأول',
      vehicleNo: 'V1',
      vaccineType: 'لقاح الحمى القلاعية',
      vaccineCategory: 'Preventive',
      sheepTotal: 100,
      sheepYoung: 20,
      sheepFemale: 60,
      sheepVaccinated: 100,
      goatsTotal: 50,
      goatsYoung: 10,
      goatsFemale: 30,
      goatsVaccinated: 50,
      camelTotal: 5,
      camelYoung: 1,
      camelFemale: 3,
      camelVaccinated: 5,
      cattleTotal: 10,
      cattleYoung: 2,
      cattleFemale: 6,
      cattleVaccinated: 10,
      horseTotal: 3,
      horseYoung: 0,
      horseFemale: 2,
      horseVaccinated: 3,
      herdHealth: 'Healthy',
      animalsHandling: 'Easy',
      labours: 'Available',
      reachableLocation: 'Easy',
      requestDate: '2024-01-15',
      requestSituation: 'Open',
      remarks: 'ملاحظات إضافية'
    }
  ], 'vaccination-template')
);

/**
 * @swagger
 * /api/vaccination/import:
 *   post:
 *     summary: Import vaccination records from CSV
 *     tags: [Vaccination]
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
  handleImport(Vaccination, Client, async (row, user, ClientModel, VaccinationModel, errors) => {
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
    
    // Create vaccination record
    const vaccinationData = {
      serialNo: row.serialNo,
      date: new Date(row.date),
      client: client._id,
      farmLocation: row.farmLocation || '',
      supervisor: row.supervisor || '',
      team: row.team || '',
      vehicleNo: row.vehicleNo || '',
      vaccineType: row.vaccineType || '',
      vaccineCategory: row.vaccineCategory || 'Preventive',
      herdCounts: {
        sheep: {
          total: parseInt(row.sheepTotal) || 0,
          young: parseInt(row.sheepYoung) || 0,
          female: parseInt(row.sheepFemale) || 0,
          vaccinated: parseInt(row.sheepVaccinated) || 0
        },
        goats: {
          total: parseInt(row.goatsTotal) || 0,
          young: parseInt(row.goatsYoung) || 0,
          female: parseInt(row.goatsFemale) || 0,
          vaccinated: parseInt(row.goatsVaccinated) || 0
        },
        camel: {
          total: parseInt(row.camelTotal) || 0,
          young: parseInt(row.camelYoung) || 0,
          female: parseInt(row.camelFemale) || 0,
          vaccinated: parseInt(row.camelVaccinated) || 0
        },
        cattle: {
          total: parseInt(row.cattleTotal) || 0,
          young: parseInt(row.cattleYoung) || 0,
          female: parseInt(row.cattleFemale) || 0,
          vaccinated: parseInt(row.cattleVaccinated) || 0
        },
        horse: {
          total: parseInt(row.horseTotal) || 0,
          young: parseInt(row.horseYoung) || 0,
          female: parseInt(row.horseFemale) || 0,
          vaccinated: parseInt(row.horseVaccinated) || 0
        }
      },
      herdHealth: row.herdHealth || 'Healthy',
      animalsHandling: row.animalsHandling || 'Easy',
      labours: row.labours || 'Available',
      reachableLocation: row.reachableLocation || 'Easy',
      request: {
        date: new Date(row.requestDate || row.date),
        situation: row.requestSituation || 'Open'
      },
      remarks: row.remarks || '',
      // createdBy: user._id
    };
    
    const vaccination = new VaccinationModel(vaccinationData);
    await vaccination.save();
    
    // Populate client data for response
    await vaccination.populate('client', 'name nationalId phone village detailedAddress');
    return vaccination;
  })
);

module.exports = router;
