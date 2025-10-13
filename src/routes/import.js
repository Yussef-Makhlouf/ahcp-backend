const express = require('express');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { handleImport } = require('../utils/importExportHelpers');
const MobileClinic = require('../models/MobileClinic');
const Client = require('../models/Client');
const Vaccination = require('../models/Vaccination');
const ParasiteControl = require('../models/ParasiteControl');
const EquineHealth = require('../models/EquineHealth');
const Laboratory = require('../models/Laboratory');
const { findOrCreateClient } = require('../utils/importExportHelpers');

const router = express.Router();

/**
 * @swagger
 * /api/import/mobile-clinics:
 *   post:
 *     summary: Import mobile clinic records (JWT protected)
 *     tags: [Import]
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
router.post('/mobile-clinics', auth, asyncHandler(async (req, res) => {
  // Call handleImport with proper context
  await handleImport(req, res, MobileClinic, Client, async (row, user, ClientModel, MobileClinicModel, errors) => {
    // Validate required fields
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
    const existingRecord = await MobileClinicModel.findOne({ serialNo: serialNo });
    if (existingRecord) {
      const timestamp = Date.now().toString().slice(-6);
      serialNo = `${row['Serial No']}-${timestamp}`;
      
      const duplicateCheck = await MobileClinicModel.findOne({ serialNo: serialNo });
      if (duplicateCheck) {
        serialNo = `${row['Serial No']}-${timestamp}-${Math.floor(Math.random() * 1000)}`;
      }
      
      console.log(`⚠️  Serial number '${row['Serial No']}' already exists. Generated new serial: '${serialNo}'`);
    }
    
    // Create client data object
    const clientData = {
      clientName: row['Name'],
      clientNationalId: row['ID'],
      clientPhone: row['Phone'],
      clientVillage: row['Village'] || '',
      clientDetailedAddress: row['Detailed Address'] || ''
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
    
    // Create mobile clinic record
    const mobileClinicData = {
      serialNo: serialNo,
      date: new Date(row['Date']),
      client: client._id,
      createdBy: user._id,
      updatedBy: user._id,
      farmLocation: row['Location'] || '',
      coordinates: Object.keys(coordinates).length > 0 ? coordinates : undefined,
      supervisor: row['Supervisor'] || 'N/A',
      vehicleNo: row['Vehicle No.'] || 'N/A',
      animalCounts: {
        sheep: parseInt(row['Sheep']) || 0,
        goats: parseInt(row['Goats']) || 0,
        camel: parseInt(row['Camel']) || 0,
        horse: parseInt(row['Horse']) || 0,
        cattle: parseInt(row['Cattle']) || 0
      },
      diagnosis: row['Diagnosis'] || '',
      interventionCategory: row['Intervention Category'] || 'Routine',
      treatment: row['Treatment'] || '',
      request: {
        date: new Date(row['Request Date'] || row['Date']),
        situation: ['Open', 'Closed', 'Pending'].includes(row['Request Status']) 
          ? row['Request Status']
          : 'Open',
        fulfillingDate: row['Request Fulfilling Date'] ? new Date(row['Request Fulfilling Date']) : undefined
      },
      category: row['Category'] || '',
      remarks: row['Remarks'] || ''
    };
    
    const mobileClinicRecord = new MobileClinicModel(mobileClinicData);
    await mobileClinicRecord.save();
    
    // Populate client data for response
    await mobileClinicRecord.populate('client', 'name nationalId phone village detailedAddress birthDate');
    return mobileClinicRecord;
  });
}));

/**
 * @swagger
 * /api/import/clients:
 *   post:
 *     summary: Import clients (JWT protected)
 *     tags: [Import]
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
router.post('/clients', auth, asyncHandler(async (req, res) => {
  // Call handleImport with proper context
  await handleImport(req, res, Client, Client, async (row, user, ClientModel, errors) => {
    // Check if client with same national ID already exists
    const existingClient = await ClientModel.findOne({ nationalId: row['National ID'] || row['رقم الهوية'] });
    if (existingClient) {
      errors.push({
        row: row.rowNumber,
        field: 'National ID',
        message: 'Client with this national ID already exists'
      });
      return null;
    }

    // Parse birth date
    let birthDate = null;
    if (row['Birth Date'] || row['تاريخ الميلاد']) {
      const dateStr = row['Birth Date'] || row['تاريخ الميلاد'];
      birthDate = new Date(dateStr);
      if (isNaN(birthDate.getTime())) {
        birthDate = null;
      }
    }

    // Create new client
    const client = new ClientModel({
      name: row['Name'] || row['اسم العميل'],
      nationalId: row['National ID'] || row['رقم الهوية'],
      phone: row['Phone'] || row['رقم الهاتف'] || '',
      email: row['Email'] || row['البريد الإلكتروني'] || '',
      village: row['Village'] || row['القرية'] || '',
      detailedAddress: row['Detailed Address'] || row['العنوان التفصيلي'] || '',
      status: row['Status'] || row['الحالة'] || 'نشط',
      birthDate: birthDate,
      animals: [],
      availableServices: [],
      createdBy: user._id
    });

    await client.save();
    return client;
  });
}));

/**
 * @swagger
 * /api/import/vaccination:
 *   post:
 *     summary: Import vaccination records (JWT protected)
 *     tags: [Import]
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
router.post('/vaccination', auth, asyncHandler(async (req, res) => {
  // Call handleImport with proper context
  await handleImport(req, res, Vaccination, Client, async (row, user, ClientModel, VaccinationModel, errors) => {
    // Validate required fields
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
      const timestamp = Date.now().toString().slice(-6);
      serialNo = `${row['Serial No']}-${timestamp}`;
      
      const duplicateCheck = await VaccinationModel.findOne({ serialNo: serialNo });
      if (duplicateCheck) {
        serialNo = `${row['Serial No']}-${timestamp}-${Math.floor(Math.random() * 1000)}`;
      }
      
      console.log(`⚠️  Serial number '${row['Serial No']}' already exists. Generated new serial: '${serialNo}'`);
    }
    
    // Create client data object
    const clientData = {
      clientName: row['Name'],
      clientNationalId: row['ID'],
      clientPhone: row['Phone'],
      clientVillage: row['Village'] || '',
      clientDetailedAddress: row['Detailed Address'] || ''
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
    
    // Create vaccination record
    const vaccinationData = {
      serialNo: serialNo,
      date: new Date(row['Date']),
      client: client._id,
      createdBy: user._id,
      updatedBy: user._id,
      supervisor: row['Supervisor'] || 'N/A',
      vehicleNo: row['Vehicle No.'] || 'N/A',
      animalCounts: {
        sheep: parseInt(row['Sheep']) || 0,
        goats: parseInt(row['Goats']) || 0,
        camel: parseInt(row['Camel']) || 0,
        horse: parseInt(row['Horse']) || 0,
        cattle: parseInt(row['Cattle']) || 0
      },
      vaccineType: row['Vaccine Type'] || '',
      vaccineName: row['Vaccine Name'] || '',
      batchNumber: row['Batch Number'] || '',
      expiryDate: row['Expiry Date'] ? new Date(row['Expiry Date']) : undefined,
      dosage: row['Dosage'] || '',
      route: row['Route'] || '',
      remarks: row['Remarks'] || ''
    };
    
    const vaccinationRecord = new VaccinationModel(vaccinationData);
    await vaccinationRecord.save();
    
    // Populate client data for response
    await vaccinationRecord.populate('client', 'name nationalId phone village detailedAddress birthDate');
    return vaccinationRecord;
  });
}));

/**
 * @swagger
 * /api/import/parasite-control:
 *   post:
 *     summary: Import parasite control records (JWT protected)
 *     tags: [Import]
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
router.post('/parasite-control', auth, asyncHandler(async (req, res) => {
  // Call handleImport with proper context
  await handleImport(req, res, ParasiteControl, Client, async (row, user, ClientModel, ParasiteControlModel, errors) => {
    // Validate required fields
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
    const existingRecord = await ParasiteControlModel.findOne({ serialNo: serialNo });
    if (existingRecord) {
      const timestamp = Date.now().toString().slice(-6);
      serialNo = `${row['Serial No']}-${timestamp}`;
      
      const duplicateCheck = await ParasiteControlModel.findOne({ serialNo: serialNo });
      if (duplicateCheck) {
        serialNo = `${row['Serial No']}-${timestamp}-${Math.floor(Math.random() * 1000)}`;
      }
      
      console.log(`⚠️  Serial number '${row['Serial No']}' already exists. Generated new serial: '${serialNo}'`);
    }
    
    // Create client data object
    const clientData = {
      clientName: row['Name'],
      clientNationalId: row['ID'],
      clientPhone: row['Phone'],
      clientVillage: row['Village'] || '',
      clientDetailedAddress: row['Detailed Address'] || ''
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
    if (row['E'] && !isNaN(parseFloat(row['E']))) {
      coordinates.longitude = parseFloat(row['E']);
    }
    if (row['N'] && !isNaN(parseFloat(row['N']))) {
      coordinates.latitude = parseFloat(row['N']);
    }
    
    // Create parasite control record
    const parasiteControlData = {
      serialNo: serialNo,
      date: new Date(row['Date']),
      client: client._id,
      createdBy: user._id,
      updatedBy: user._id,
      herdLocation: row['Supervisor'] || '',
      coordinates: Object.keys(coordinates).length > 0 ? coordinates : undefined,
      supervisor: row['Supervisor'] || '',
      vehicleNo: row['Vehicle No.'] || '',
      herdCounts: {
        sheep: {
          total: parseInt(row['Total Sheep']) || 0,
          young: parseInt(row['Young sheep']) || 0,
          female: parseInt(row['Female Sheep']) || 0,
          treated: parseInt(row['Treated Sheep']) || 0
        },
        goats: {
          total: parseInt(row['Total Goats']) || 0,
          young: parseInt(row['Young Goats']) || 0,
          female: parseInt(row['Female Goats']) || 0,
          treated: parseInt(row['Treated Goats']) || 0
        },
        camel: {
          total: parseInt(row['Total Camel']) || 0,
          young: parseInt(row['Young Camels']) || 0,
          female: parseInt(row['Female Camels']) || 0,
          treated: parseInt(row['Treated Camels']) || 0
        },
        cattle: {
          total: parseInt(row['Total Cattle']) || 0,
          young: parseInt(row['Young Cattle']) || 0,
          female: parseInt(row['Female Cattle']) || 0,
          treated: parseInt(row['Treated Cattle']) || 0
        },
        horse: {
          total: 0,
          young: 0,
          female: 0,
          treated: 0
        }
      },
      animalBarnSizeSqM: parseInt(row['Size (sqM)']) || 0,
      parasiteControlVolume: parseInt(row['Volume']) || 0,
      parasiteControlStatus: row['Insecticide'] || '',
      herdHealthStatus: ['Healthy', 'Sick', 'Under Treatment'].includes(row['Herd Health Status']) 
        ? row['Herd Health Status'] 
        : 'Healthy',
      complyingToInstructions: row['Complying to instructions'] === 'Yes' || row['Complying to instructions'] === 'true',
      insecticide: {
        type: row['Insecticide Used'] || '',
        method: row['Type'] || '',
        volumeMl: parseInt(row['Volume (ml)']) || 0,
        status: row['Status'] === 'Sprayed' ? 'Sprayed' : 'Not Sprayed',
        category: row['Category'] || ''
      },
      request: {
        date: new Date(row['Request Date'] || row['Date']),
        situation: ['Open', 'Closed', 'Pending'].includes(row['Request Situation']) 
          ? row['Request Situation'] 
          : 'Open',
        fulfillingDate: row['Request Fulfilling Date'] ? new Date(row['Request Fulfilling Date']) : undefined
      },
      remarks: row['Remarks'] || ''
    };
    
    const parasiteControlRecord = new ParasiteControlModel(parasiteControlData);
    await parasiteControlRecord.save();
    
    // Populate client data for response
    await parasiteControlRecord.populate('client', 'name nationalId phone village detailedAddress birthDate');
    return parasiteControlRecord;
  });
}));

/**
 * @swagger
 * /api/import/equine-health:
 *   post:
 *     summary: Import equine health records (JWT protected)
 *     tags: [Import]
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
router.post('/equine-health', auth, asyncHandler(async (req, res) => {
  // Call handleImport with proper context
  await handleImport(req, res, EquineHealth, Client, async (row, user, ClientModel, EquineHealthModel, errors) => {
    // Validate required fields
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
    const existingRecord = await EquineHealthModel.findOne({ serialNo: serialNo });
    if (existingRecord) {
      const timestamp = Date.now().toString().slice(-6);
      serialNo = `${row['Serial No']}-${timestamp}`;
      
      const duplicateCheck = await EquineHealthModel.findOne({ serialNo: serialNo });
      if (duplicateCheck) {
        serialNo = `${row['Serial No']}-${timestamp}-${Math.floor(Math.random() * 1000)}`;
      }
      
      console.log(`⚠️  Serial number '${row['Serial No']}' already exists. Generated new serial: '${serialNo}'`);
    }
    
    // Create client data object
    const clientData = {
      clientName: row['Name'],
      clientNationalId: row['ID'],
      clientPhone: row['Phone'],
      clientVillage: row['Village'] || '',
      clientDetailedAddress: row['Detailed Address'] || ''
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
    
    // Create equine health record
    const equineHealthData = {
      serialNo: serialNo,
      date: new Date(row['Date']),
      client: client._id,
      createdBy: user._id,
      updatedBy: user._id,
      supervisor: row['Supervisor'] || 'N/A',
      vehicleNo: row['Vehicle No.'] || 'N/A',
      animalCounts: {
        horses: parseInt(row['Horses']) || 0,
        donkeys: parseInt(row['Donkeys']) || 0,
        mules: parseInt(row['Mules']) || 0
      },
      healthStatus: row['Health Status'] || 'Healthy',
      treatment: row['Treatment'] || '',
      medication: row['Medication'] || '',
      dosage: row['Dosage'] || '',
      remarks: row['Remarks'] || ''
    };
    
    const equineHealthRecord = new EquineHealthModel(equineHealthData);
    await equineHealthRecord.save();
    
    // Populate client data for response
    await equineHealthRecord.populate('client', 'name nationalId phone village detailedAddress birthDate');
    return equineHealthRecord;
  });
}));

/**
 * @swagger
 * /api/import/laboratories:
 *   post:
 *     summary: Import laboratory records (JWT protected)
 *     tags: [Import]
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
router.post('/laboratories', auth, asyncHandler(async (req, res) => {
  // Call handleImport with proper context
  await handleImport(req, res, Laboratory, Client, async (row, user, ClientModel, LaboratoryModel, errors) => {
    // Validate required fields
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
    const existingRecord = await LaboratoryModel.findOne({ serialNo: serialNo });
    if (existingRecord) {
      const timestamp = Date.now().toString().slice(-6);
      serialNo = `${row['Serial No']}-${timestamp}`;
      
      const duplicateCheck = await LaboratoryModel.findOne({ serialNo: serialNo });
      if (duplicateCheck) {
        serialNo = `${row['Serial No']}-${timestamp}-${Math.floor(Math.random() * 1000)}`;
      }
      
      console.log(`⚠️  Serial number '${row['Serial No']}' already exists. Generated new serial: '${serialNo}'`);
    }
    
    // Create client data object
    const clientData = {
      clientName: row['Name'],
      clientNationalId: row['ID'],
      clientPhone: row['Phone'],
      clientVillage: row['Village'] || '',
      clientDetailedAddress: row['Detailed Address'] || ''
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
    
    // Create laboratory record
    const laboratoryData = {
      serialNo: serialNo,
      date: new Date(row['Date']),
      client: client._id,
      createdBy: user._id,
      updatedBy: user._id,
      supervisor: row['Supervisor'] || 'N/A',
      vehicleNo: row['Vehicle No.'] || 'N/A',
      sampleType: row['Sample Type'] || '',
      testType: row['Test Type'] || '',
      testResults: row['Test Results'] || '',
      laboratoryName: row['Laboratory Name'] || '',
      technician: row['Technician'] || '',
      remarks: row['Remarks'] || ''
    };
    
    const laboratoryRecord = new LaboratoryModel(laboratoryData);
    await laboratoryRecord.save();
    
    // Populate client data for response
    await laboratoryRecord.populate('client', 'name nationalId phone village detailedAddress birthDate');
    return laboratoryRecord;
  });
}));

module.exports = router;
