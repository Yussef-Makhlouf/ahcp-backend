const express = require('express');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const MobileClinic = require('../models/MobileClinic');
const Client = require('../models/Client');
const Vaccination = require('../models/Vaccination');
const ParasiteControl = require('../models/ParasiteControl');
const EquineHealth = require('../models/EquineHealth');
const Laboratory = require('../models/Laboratory');
const Report = require('../models/Report');

const router = express.Router();

/**
 * @swagger
 * /api/export/mobile-clinics:
 *   get:
 *     summary: Export mobile clinic records (JWT protected)
 *     tags: [Export]
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
router.get('/mobile-clinics', auth, asyncHandler(async (req, res) => {
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
    const animalCounts = record.animalCounts || {};
    const client = record.client || {};
    const coordinates = record.coordinates || {};
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
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(transformedRecords);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mobile Clinics');
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
}));

/**
 * @swagger
 * /api/export/clients:
 *   get:
 *     summary: Export clients data (JWT protected)
 *     tags: [Export]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [نشط, غير نشط]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Data exported successfully
 */
router.get('/clients', auth, asyncHandler(async (req, res) => {
  const { format = 'json', status } = req.query;
  
  const filter = {};
  if (status) filter.status = status;

  const clients = await Client.find(filter).sort({ createdAt: -1 });

  if (format === 'csv') {
    const { Parser } = require('json2csv');
    const fields = [
      'name',
      'nationalId',
      'phone',
      'email',
      'village',
      'detailedAddress',
      'status',
      'totalAnimals',
      'createdAt'
    ];
    
    const parser = new Parser({ fields });
    const csv = parser.parse(clients);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=clients.csv');
    res.send(csv);
  } else if (format === 'excel') {
    const XLSX = require('xlsx');
    
    const transformedClients = clients.map(client => ({
      'Name': client.name || '',
      'National ID': client.nationalId || '',
      'Phone': client.phone || '',
      'Email': client.email || '',
      'Village': client.village || '',
      'Detailed Address': client.detailedAddress || '',
      'Status': client.status || '',
      'Total Animals': client.totalAnimals || 0,
      'Created At': client.createdAt ? client.createdAt.toISOString().split('T')[0] : ''
    }));
    
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(transformedClients);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients');
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=clients.xlsx');
    res.send(excelBuffer);
  } else {
    res.json({
      success: true,
      data: { clients }
    });
  }
}));

/**
 * @swagger
 * /api/export/vaccination:
 *   get:
 *     summary: Export vaccination records (JWT protected)
 *     tags: [Export]
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
router.get('/vaccination', auth, asyncHandler(async (req, res) => {
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
    const parser = new Parser();
    const csv = parser.parse(records);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=vaccination-records.csv');
    res.send(csv);
  } else if (format === 'excel') {
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(records);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vaccination');
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
}));

/**
 * @swagger
 * /api/export/parasite-control:
 *   get:
 *     summary: Export parasite control records (JWT protected)
 *     tags: [Export]
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
router.get('/parasite-control', auth, asyncHandler(async (req, res) => {
  const { format = 'json', startDate, endDate } = req.query;
  
  const filter = {};
  if (startDate && endDate) {
    filter.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const records = await ParasiteControl.find(filter)
    .populate('client', 'name nationalId phone village detailedAddress birthDate')
    .sort({ date: -1 });

  if (format === 'csv') {
    const { Parser } = require('json2csv');
    const parser = new Parser();
    const csv = parser.parse(records);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=parasite-control-records.csv');
    res.send(csv);
  } else if (format === 'excel') {
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(records);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Parasite Control');
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=parasite-control-records.xlsx');
    res.send(excelBuffer);
  } else {
    res.json({
      success: true,
      data: { records }
    });
  }
}));

/**
 * @swagger
 * /api/export/equine-health:
 *   get:
 *     summary: Export equine health records (JWT protected)
 *     tags: [Export]
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
router.get('/equine-health', auth, asyncHandler(async (req, res) => {
  const { format = 'json', startDate, endDate } = req.query;
  
  const filter = {};
  if (startDate && endDate) {
    filter.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const records = await EquineHealth.find(filter)
    .populate('client', 'name nationalId phone village detailedAddress birthDate')
    .sort({ date: -1 });

  if (format === 'csv') {
    const { Parser } = require('json2csv');
    const parser = new Parser();
    const csv = parser.parse(records);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=equine-health-records.csv');
    res.send(csv);
  } else if (format === 'excel') {
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(records);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Equine Health');
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

/**
 * @swagger
 * /api/export/laboratories:
 *   get:
 *     summary: Export laboratory records (JWT protected)
 *     tags: [Export]
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
router.get('/laboratories', auth, asyncHandler(async (req, res) => {
  const { format = 'json', startDate, endDate } = req.query;
  
  const filter = {};
  if (startDate && endDate) {
    filter.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const records = await Laboratory.find(filter)
    .populate('client', 'name nationalId phone village detailedAddress birthDate')
    .sort({ date: -1 });

  if (format === 'csv') {
    const { Parser } = require('json2csv');
    const parser = new Parser();
    const csv = parser.parse(records);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=laboratory-records.csv');
    res.send(csv);
  } else if (format === 'excel') {
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(records);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Laboratories');
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=laboratory-records.xlsx');
    res.send(excelBuffer);
  } else {
    res.json({
      success: true,
      data: { records }
    });
  }
}));

/**
 * @swagger
 * /api/export/reports:
 *   get:
 *     summary: Export reports (JWT protected)
 *     tags: [Export]
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
router.get('/reports', auth, asyncHandler(async (req, res) => {
  const { format = 'json', startDate, endDate } = req.query;
  
  const filter = {};
  if (startDate && endDate) {
    filter.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  const records = await Report.find(filter)
    .populate('client', 'name nationalId phone village detailedAddress birthDate')
    .sort({ date: -1 });

  if (format === 'csv') {
    const { Parser } = require('json2csv');
    const parser = new Parser();
    const csv = parser.parse(records);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=reports.csv');
    res.send(csv);
  } else if (format === 'excel') {
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(records);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reports');
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=reports.xlsx');
    res.send(excelBuffer);
  } else {
    res.json({
      success: true,
      data: { records }
    });
  }
}));

module.exports = router;
