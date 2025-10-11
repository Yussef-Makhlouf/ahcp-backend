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
      .populate('client', 'name nationalId phone village detailedAddress birthDate')
      .sort({ date: -1 });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      
      // Transform data for the new column structure
      const transformedRecords = records.map(record => {
        const herdCounts = record.herdCounts || {};
        const totalFemales = (herdCounts.sheep?.female || 0) + (herdCounts.goats?.female || 0) + 
                            (herdCounts.camel?.female || 0) + (herdCounts.cattle?.female || 0);
        
        return {
          'Serial No': record.serialNo,
          'Date': record.date ? record.date.toISOString().split('T')[0] : '',
          'Name': record.client?.name || '',
          'ID': record.client?.nationalId || '',
          'Birth Date': record.client?.birthDate ? record.client.birthDate.toISOString().split('T')[0] : '',
          'Phone': record.client?.phone || '',
          'Location': record.farmLocation || '',
          'N Coordinate': record.coordinates?.latitude || '',
          'E Coordinate': record.coordinates?.longitude || '',
          'Supervisor': record.supervisor || '',
          'Team': record.team || '',
          'Vehicle No.': record.vehicleNo || '',
          'Sheep': herdCounts.sheep?.total || 0,
          'F. Sheep': herdCounts.sheep?.female || 0,
          'Vaccinated Sheep': herdCounts.sheep?.vaccinated || 0,
          'Goats': herdCounts.goats?.total || 0,
          'F.Goats': herdCounts.goats?.female || 0,
          'Vaccinated Goats': herdCounts.goats?.vaccinated || 0,
          'Camel': herdCounts.camel?.total || 0,
          'F. Camel': herdCounts.camel?.female || 0,
          'Vaccinated Camels': herdCounts.camel?.vaccinated || 0,
          'Cattel': herdCounts.cattle?.total || 0,
          'F. Cattle': herdCounts.cattle?.female || 0,
          'Vaccinated Cattle': herdCounts.cattle?.vaccinated || 0,
          'Herd Number': (herdCounts.sheep?.total || 0) + (herdCounts.goats?.total || 0) + (herdCounts.camel?.total || 0) + (herdCounts.cattle?.total || 0),
          'Herd Females': totalFemales,
          'Total Vaccinated': (herdCounts.sheep?.vaccinated || 0) + (herdCounts.goats?.vaccinated || 0) + (herdCounts.camel?.vaccinated || 0) + (herdCounts.cattle?.vaccinated || 0),
          'Herd Health': record.herdHealth || '',
          'Animals Handling': record.animalsHandling || '',
          'Labours': record.labours || '',
          'Reachable Location': record.reachableLocation || '',
          'Request Date': record.request?.date ? record.request.date.toISOString().split('T')[0] : '',
          'Situation': record.request?.situation || '',
          'Request Fulfilling Date': record.request?.fulfillingDate ? record.request.fulfillingDate.toISOString().split('T')[0] : '',
          'Vaccine': record.vaccineType || '',
          'Category': record.vaccineCategory || '',
          'Remarks': record.remarks || ''
        };
      });
      
      const parser = new Parser();
      const csv = parser.parse(transformedRecords);
      
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
      'Serial No': `V${Date.now().toString().slice(-6)}`,
      'Date': '2024-01-15',
      'Name': 'محمد أحمد الشمري',
      'ID': '1234567890',
      'Birth Date': '1980-01-01',
      'Phone': '+966501234567',
      'Location': 'مزرعة الشمري',
      'N Coordinate': '24.7136',
      'E Coordinate': '46.6753',
      'Supervisor': 'د. محمد علي',
      'Team': 'فريق التحصين الأول',
      'Vehicle No.': 'V1',
      'Sheep': 100,
      'F. Sheep': 60,
      'Vaccinated Sheep': 100,
      'Goats': 50,
      'F.Goats': 30,
      'Vaccinated Goats': 50,
      'Camel': 5,
      'F. Camel': 3,
      'Vaccinated Camels': 5,
      'Cattel': 10,
      'F. Cattle': 6,
      'Vaccinated Cattle': 10,
      'Herd Number': 165,
      'Herd Females': 99,
      'Total Vaccinated': 165,
      'Herd Health': 'Healthy',
      'Animals Handling': 'Easy',
      'Labours': 'Available',
      'Reachable Location': 'Easy',
      'Request Date': '2024-01-15',
      'Situation': 'Open',
      'Request Fulfilling Date': '2024-01-16',
      'Vaccine': 'لقاح الحمى القلاعية',
      'Category': 'Preventive',
      'Remarks': 'ملاحظات إضافية'
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
    // Validate required fields - using new column names
    if (!row['Serial No'] || !row['Date'] || !row['Name']) {
      errors.push({
        row: row.rowNumber,
        field: 'required',
        message: 'Missing required fields: Serial No, Date, or Name'
      });
      return;
    }
    
    // Check if serial number already exists and generate unique one if needed
    let serialNo = row['Serial No'];
    const existingRecord = await VaccinationModel.findOne({ serialNo: serialNo });
    if (existingRecord) {
      // Generate a unique serial number by appending timestamp
      const timestamp = Date.now().toString().slice(-6);
      serialNo = `${row['Serial No']}-${timestamp}`;
      
      // Double check the new serial number doesn't exist
      const duplicateCheck = await VaccinationModel.findOne({ serialNo: serialNo });
      if (duplicateCheck) {
        serialNo = `${row['Serial No']}-${timestamp}-${Math.floor(Math.random() * 1000)}`;
      }
      
      console.log(`⚠️  Serial number '${row['Serial No']}' already exists. Generated new serial: '${serialNo}'`);
    }
    
    // Create client data object for findOrCreateClient function
    const clientData = {
      clientName: row['Name'],
      clientNationalId: row['ID'],
      clientPhone: row['Phone'],
      clientVillage: '',
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
    if (row['Birth Date'] && client) {
      try {
        client.birthDate = new Date(row['Birth Date']);
        await client.save();
      } catch (birthDateError) {
        console.warn('Could not set birth date:', birthDateError.message);
      }
    }
    
    // Parse coordinates
    const coordinates = {};
    if (row['E Coordinate'] && !isNaN(parseFloat(row['E Coordinate']))) {
      coordinates.longitude = parseFloat(row['E Coordinate']);
    }
    if (row['N Coordinate'] && !isNaN(parseFloat(row['N Coordinate']))) {
      coordinates.latitude = parseFloat(row['N Coordinate']);
    }
    
    // Create vaccination record with new column mapping
    const vaccinationData = {
      serialNo: serialNo,
      date: new Date(row['Date']),
      client: client._id,
      farmLocation: row['Location'] || '',
      coordinates: Object.keys(coordinates).length > 0 ? coordinates : undefined,
      supervisor: row['Supervisor'] || 'N/A',
      team: row['Team'] || '',
      vehicleNo: row['Vehicle No.'] || row['Vehicle No'] || row['vehicleNo'] || 'N/A',
      vaccineType: row['Vaccine'] || 'General Vaccine',
      vaccineCategory: row['Category'] || 'Preventive',
      herdCounts: {
        sheep: {
          total: parseInt(row['Sheep']) || 0,
          young: 0, // Not included in new format
          female: parseInt(row['F. Sheep']) || 0,
          vaccinated: parseInt(row['Vaccinated Sheep']) || 0
        },
        goats: {
          total: parseInt(row['Goats']) || 0,
          young: 0, // Not included in new format
          female: parseInt(row['F.Goats']) || 0,
          vaccinated: parseInt(row['Vaccinated Goats']) || 0
        },
        camel: {
          total: parseInt(row['Camel']) || 0,
          young: 0, // Not included in new format
          female: parseInt(row['F. Camel']) || 0,
          vaccinated: parseInt(row['Vaccinated Camels']) || 0
        },
        cattle: {
          total: parseInt(row['Cattel']) || 0,
          young: 0, // Not included in new format
          female: parseInt(row['F. Cattle']) || 0,
          vaccinated: parseInt(row['Vaccinated Cattle']) || 0
        },
        horse: {
          total: 0, // Not included in new format
          young: 0,
          female: 0,
          vaccinated: 0
        }
      },
      herdHealth: row['Herd Health'] || 'Healthy',
      animalsHandling: row['Animals Handling'] || 'Easy',
      labours: row['Labours'] || 'Available',
      reachableLocation: row['Reachable Location'] || 'Easy',
      request: {
        date: new Date(row['Request Date'] || row['Date']),
        situation: ['Open', 'Closed', 'Pending'].includes(row['Situation']) 
          ? row['Situation'] 
          : 'Open',
        fulfillingDate: row['Request Fulfilling Date'] ? new Date(row['Request Fulfilling Date']) : undefined
      },
      remarks: row['Remarks'] || '',
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
