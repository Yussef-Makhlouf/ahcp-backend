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
    const { page = 1, limit = 30, startDate, endDate, vaccineType, vaccineCategory, supervisor, search } = req.query;
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
        .populate({
          path: 'client',
          select: 'name nationalId phone village detailedAddress birthDate',
          populate: {
            path: 'village',
            select: 'nameArabic nameEnglish sector serialNumber'
          }
        })
        .populate('holdingCode', 'code village description isActive')
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

    // If still no records, return empty array
    if (!records) {
      records = [];
    }

    let total = 0;
    try {
      total = await Vaccination.countDocuments(filter);
    } catch (countError) {
      console.error('Error counting documents:', countError);
      total = 0;
    }

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
      // Simple statistics without complex aggregation
      const totalRecords = await Vaccination.countDocuments(filter);
      const recordsThisMonth = await Vaccination.countDocuments({
        ...filter,
        date: {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          $lte: new Date()
        }
      });
      
      const statistics = {
        totalRecords,
        recordsThisMonth,
        totalAnimalsVaccinated: 0, // Will be calculated if needed
        totalVaccinesUsed: 0 // Will be calculated if needed
      };
      
      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      console.error('Error getting vaccination statistics:', error);
      
      // Return basic count if aggregation fails
      const basicStats = {
        totalRecords: await Vaccination.countDocuments(filter),
        recordsThisMonth: 0,
        totalAnimalsVaccinated: 0,
        totalVaccinesUsed: 0
      };
      
      res.json({
        success: true,
        data: basicStats
      });
    }
  })
);

/**
 * @swagger
 * /api/vaccination/detailed-statistics:
 *   get:
 *     summary: Get detailed vaccination statistics for dashboard
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
      // Get all vaccination records with herd counts
      const records = await Vaccination.find(filter)
        .select('herdCounts vaccineType')
        .lean();

      // Initialize counters
      let pprVaccinated = 0;
      let fmdVaccinated = 0;
      let etVaccinated = 0;
      let hsVaccinated = 0;
      let sgPoxVaccinated = 0;
      let sheepVaccinated = 0;
      let goatsVaccinated = 0;
      let cattleVaccinated = 0;
      let camelVaccinated = 0;

      // Process each record
      records.forEach(record => {
        const herdCounts = record.herdCounts || {};
        
        // Count by vaccine type - more comprehensive matching
        const vaccineType = (record.vaccineType || '').toLowerCase();
        
        // PPR Vaccine (Peste des Petits Ruminants)
        if (vaccineType.includes('ppr') || vaccineType.includes('peste') || vaccineType.includes('petits') || vaccineType.includes('ruminants')) {
          pprVaccinated += (herdCounts.sheep?.vaccinated || 0) + (herdCounts.goats?.vaccinated || 0);
        }
        // FMD Vaccine (Foot and Mouth Disease)
        else if (vaccineType.includes('fmd') || vaccineType.includes('foot') || vaccineType.includes('mouth') || vaccineType.includes('حمى') || vaccineType.includes('قلاعية')) {
          fmdVaccinated += (herdCounts.sheep?.vaccinated || 0) + (herdCounts.goats?.vaccinated || 0) + 
                          (herdCounts.cattle?.vaccinated || 0) + (herdCounts.camel?.vaccinated || 0);
        }
        // ET Vaccine (Enterotoxemia)
        else if (vaccineType.includes('et') || vaccineType.includes('enterotoxemia') || vaccineType.includes('enterotoxaemia')) {
          etVaccinated += (herdCounts.sheep?.vaccinated || 0) + (herdCounts.goats?.vaccinated || 0);
        }
        // HS Vaccine (Hemorrhagic Septicemia)
        else if (vaccineType.includes('hs') || vaccineType.includes('hemorrhagic') || vaccineType.includes('septicemia') || vaccineType.includes('septicaemia')) {
          hsVaccinated += (herdCounts.sheep?.vaccinated || 0) + (herdCounts.goats?.vaccinated || 0);
        }
        // SG Pox Vaccine (Sheep and Goat Pox)
        else if (vaccineType.includes('sg') || vaccineType.includes('pox') || vaccineType.includes('جدري') || vaccineType.includes('sheep') || vaccineType.includes('goat')) {
          sgPoxVaccinated += (herdCounts.sheep?.vaccinated || 0) + (herdCounts.goats?.vaccinated || 0);
        }

        // Count by species (regardless of vaccine type)
        sheepVaccinated += herdCounts.sheep?.vaccinated || 0;
        goatsVaccinated += herdCounts.goats?.vaccinated || 0;
        cattleVaccinated += herdCounts.cattle?.vaccinated || 0;
        camelVaccinated += herdCounts.camel?.vaccinated || 0;
      });

      const detailedStats = {
        pprVaccinated,
        fmdVaccinated,
        etVaccinated,
        hsVaccinated,
        sgPoxVaccinated,
        sheepVaccinated,
        goatsVaccinated,
        cattleVaccinated,
        camelVaccinated
      };
      
      res.json({
        success: true,
        data: detailedStats
      });
    } catch (error) {
      console.error('Error getting detailed vaccination statistics:', error);
      
      // Return default values if aggregation fails
      const defaultStats = {
        pprVaccinated: 0,
        fmdVaccinated: 0,
        etVaccinated: 0,
        hsVaccinated: 0,
        sgPoxVaccinated: 0,
        sheepVaccinated: 0,
        goatsVaccinated: 0,
        cattleVaccinated: 0,
        camelVaccinated: 0
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
 *           enum: [csv, json, excel]
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

    const records = await Vaccination.find(filter)
      .populate('client', 'name nationalId phone village detailedAddress birthDate')
      .populate('holdingCode', 'code village description isActive')
      .sort({ date: -1 });

    // Transform data for export
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
        'Holding Code': record.holdingCode?.code || '',
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

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(transformedRecords);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=vaccination-records.csv');
      res.send(csv);
    } else if (format === 'excel') {
      const XLSX = require('xlsx');
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(transformedRecords);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Vaccination Records');
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=vaccination-records.xlsx');
      res.send(excelBuffer);
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
      .populate({
        path: 'client',
        select: 'name nationalId phone village detailedAddress',
        populate: {
          path: 'village',
          select: 'nameArabic nameEnglish sector serialNumber'
        }
      })
      .populate('holdingCode', 'code village description isActive')
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

    // Handle client object if provided
    if (req.body.client && typeof req.body.client === 'object' && req.body.client._id) {
      // Client object with _id provided - use the _id
      clientId = req.body.client._id;
    } else if (req.body.client && typeof req.body.client === 'object') {
      // Client object without _id - treat as clientData
      const clientData = req.body.client;
      
      // Try to find existing client by nationalId
      let client = await Client.findOne({ nationalId: clientData.nationalId });
      
      if (!client) {
        // Find or create village
        let villageId = null;
        if (clientData.village && clientData.village.trim() !== '') {
          const Village = require('../models/Village');
          let village = await Village.findOne({
            $or: [
              { nameArabic: clientData.village.trim() },
              { nameEnglish: clientData.village.trim() }
            ]
          });

          if (!village) {
            village = new Village({
              serialNumber: `AUTO${Date.now().toString().slice(-6)}`,
              sector: 'Unknown Sector',
              nameArabic: clientData.village.trim(),
              nameEnglish: clientData.village.trim(),
              createdBy: req.user._id
            });
            await village.save();
          }
          villageId = village._id;
        }

        // Create new client
        client = new Client({
          name: clientData.name,
          nationalId: clientData.nationalId,
          phone: clientData.phone,
          village: villageId, // Use village ObjectId instead of string
          detailedAddress: clientData.detailedAddress || '',
          birthDate: clientData.birthDate || undefined,
          status: 'نشط',
          availableServices: ['vaccination'],
          createdBy: req.user._id
        });
        await client.save();
      } else {
        // Update existing client with new data if provided
        if (clientData.name) client.name = clientData.name;
        if (clientData.phone) client.phone = clientData.phone;
        if (clientData.village) {
          // Find or create village
          const Village = require('../models/Village');
          let village = await Village.findOne({
            $or: [
              { nameArabic: clientData.village.trim() },
              { nameEnglish: clientData.village.trim() }
            ]
          });

          if (!village) {
            village = new Village({
              serialNumber: `AUTO${Date.now().toString().slice(-6)}`,
              sector: 'Unknown Sector',
              nameArabic: clientData.village.trim(),
              nameEnglish: clientData.village.trim(),
              createdBy: req.user._id
            });
            await village.save();
          }
          client.village = village._id;
        }
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
    // If clientData is provided, create or find the client
    else if (req.body.clientData) {
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
        if (clientData.village) {
          // Find or create village
          const Village = require('../models/Village');
          let village = await Village.findOne({
            $or: [
              { nameArabic: clientData.village.trim() },
              { nameEnglish: clientData.village.trim() }
            ]
          });

          if (!village) {
            village = new Village({
              serialNumber: `AUTO${Date.now().toString().slice(-6)}`,
              sector: 'Unknown Sector',
              nameArabic: clientData.village.trim(),
              nameEnglish: clientData.village.trim(),
              createdBy: req.user._id
            });
            await village.save();
          }
          client.village = village._id;
        }
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

    // Process holding code if provided
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

    const record = new Vaccination({
      ...req.body,
      client: clientId,
      holdingCode: holdingCodeId,
      // createdBy: req.user._id,
      // Remove clientData from the record
      clientData: undefined
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

    // Handle client object if provided
    if (req.body.client && typeof req.body.client === 'object' && req.body.client._id) {
      // Client object with _id provided - use the _id
      clientId = req.body.client._id;
    } else if (req.body.client && typeof req.body.client === 'object') {
      // Client object without _id - treat as clientData
      const clientData = req.body.client;
      
      // Try to find existing client by nationalId
      let client = await Client.findOne({ nationalId: clientData.nationalId });
      
      if (!client) {
        // Find or create village
        let villageId = null;
        if (clientData.village && clientData.village.trim() !== '') {
          const Village = require('../models/Village');
          let village = await Village.findOne({
            $or: [
              { nameArabic: clientData.village.trim() },
              { nameEnglish: clientData.village.trim() }
            ]
          });

          if (!village) {
            village = new Village({
              serialNumber: `AUTO${Date.now().toString().slice(-6)}`,
              sector: 'Unknown Sector',
              nameArabic: clientData.village.trim(),
              nameEnglish: clientData.village.trim(),
              createdBy: req.user._id
            });
            await village.save();
          }
          villageId = village._id;
        }

        // Create new client
        client = new Client({
          name: clientData.name,
          nationalId: clientData.nationalId,
          phone: clientData.phone,
          village: villageId, // Use village ObjectId instead of string
          detailedAddress: clientData.detailedAddress || '',
          birthDate: clientData.birthDate || undefined,
          status: 'نشط',
          availableServices: ['vaccination'],
          createdBy: req.user._id
        });
        await client.save();
      } else {
        // Update existing client with new data if provided
        if (clientData.name) client.name = clientData.name;
        if (clientData.phone) client.phone = clientData.phone;
        if (clientData.village) {
          // Find or create village
          const Village = require('../models/Village');
          let village = await Village.findOne({
            $or: [
              { nameArabic: clientData.village.trim() },
              { nameEnglish: clientData.village.trim() }
            ]
          });

          if (!village) {
            village = new Village({
              serialNumber: `AUTO${Date.now().toString().slice(-6)}`,
              sector: 'Unknown Sector',
              nameArabic: clientData.village.trim(),
              nameEnglish: clientData.village.trim(),
              createdBy: req.user._id
            });
            await village.save();
          }
          client.village = village._id;
        }
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
    // If clientData is provided, create or find the client
    else if (req.body.clientData) {
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
        if (clientData.village) {
          // Find or create village
          const Village = require('../models/Village');
          let village = await Village.findOne({
            $or: [
              { nameArabic: clientData.village.trim() },
              { nameEnglish: clientData.village.trim() }
            ]
          });

          if (!village) {
            village = new Village({
              serialNumber: `AUTO${Date.now().toString().slice(-6)}`,
              sector: 'Unknown Sector',
              nameArabic: clientData.village.trim(),
              nameEnglish: clientData.village.trim(),
              createdBy: req.user._id
            });
            await village.save();
          }
          client.village = village._id;
        }
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

    // Process holding code if provided
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
    console.log('🔍 Holding code processing (update):', req.body.holdingCode, '→', holdingCodeId);

    // Update record
    Object.assign(record, {
      ...req.body,
      client: clientId,
      holdingCode: holdingCodeId,
      clientData: undefined // Remove clientData from the record
    });
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
 * /api/vaccination/bulk-delete:
 *   delete:
 *     summary: Delete multiple vaccination records
 *     tags: [Vaccination]
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
      const existingRecords = await Vaccination.find({ _id: { $in: ids } });
      const existingIds = existingRecords.map(record => record._id.toString());
      const notFoundIds = ids.filter(id => !existingIds.includes(id));
      
      // If no records found at all, return error
      if (existingIds.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No vaccination records found to delete',
          error: 'RESOURCE_NOT_FOUND',
          notFoundIds: ids,
          foundCount: 0,
          requestedCount: ids.length
        });
      }

      const result = await Vaccination.deleteMany({ _id: { $in: existingIds } });
      
      // Prepare response with details about what was deleted and what wasn't found
      const response = {
        success: true,
        message: `${result.deletedCount} vaccination records deleted successfully`,
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
        message: 'Error deleting vaccination records',
        error: 'DELETE_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/vaccination/delete-all:
 *   delete:
 *     summary: Delete all vaccination records
 *     tags: [Vaccination]
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
    // Get all unique client IDs from vaccination records before deletion
    const uniqueClientIds = await Vaccination.distinct('client');
    console.log(`🔍 Found ${uniqueClientIds.length} unique client IDs in vaccination records`);
    
    // Delete all vaccination records
    const vaccinationResult = await Vaccination.deleteMany({});
    console.log(`🗑️ Deleted ${vaccinationResult.deletedCount} vaccination records`);
    
    // Delete associated clients (only those that were created from vaccination imports)
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
      message: `All vaccination records and associated clients deleted successfully`,
      deletedCount: vaccinationResult.deletedCount,
      clientsDeleted: clientsDeleted,
      details: {
        vaccinationRecords: vaccinationResult.deletedCount,
        clientRecords: clientsDeleted
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
  asyncHandler(async (req, res) => {
    // Add default user for template
    req.user = { _id: 'system', role: 'super_admin', name: 'System Template' };
    
    // Call handleTemplate with proper context
    await handleTemplate(req, res, [
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
      'Situation': 'Ongoing',
      'Request Fulfilling Date': '2024-01-16',
      'Vaccine': 'لقاح الحمى القلاعية',
      'Category': 'Preventive',
      'Remarks': 'ملاحظات إضافية'
    }
  ], 'vaccination-template');
  })
);

// Import route moved to centralized import-export.js

module.exports = router;
