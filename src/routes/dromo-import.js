const express = require('express');
const mongoose = require('mongoose');

const logger = require('../utils/logger');
// Import models
const User = require('../models/User');
const Client = require('../models/Client');
const Vaccination = require('../models/Vaccination');
const ParasiteControl = require('../models/ParasiteControl');
const MobileClinic = require('../models/MobileClinic');
const Laboratory = require('../models/Laboratory');
const EquineHealth = require('../models/EquineHealth');
const HoldingCode = require('../models/HoldingCode');

const router = express.Router();

/**
 * Smart holding code handler - finds existing or creates new holding code
 * Enhanced to handle duplicate codes across different villages
 */
const findOrCreateHoldingCode = async (holdingCodeValue, village, userId) => {
  try {
    if (!holdingCodeValue || !village) {
      logger.info('No holding code or village provided skipping holding code creation');
      return null;
    }

    const codeValue = holdingCodeValue.toString().trim();
    const villageValue = village.toString().trim();

    // First, try to find existing holding code by code
    let holdingCode = await HoldingCode.findOne({ 
      code: codeValue,
      isActive: true 
    });

    if (holdingCode) {
      console.log(`✅ Found existing holding code: ${holdingCode.code} for village: ${holdingCode.village}`);
      return holdingCode._id;
    }

    // If not found by code, try to find by village (since village should be unique)
    holdingCode = await HoldingCode.findOne({ 
      village: villageValue,
      isActive: true 
    });

    if (holdingCode) {
      console.log(`✅ Found existing holding code by village: ${holdingCode.code} for village: ${holdingCode.village}`);
      return holdingCode._id;
    }

    // Check if the same code exists for a different village
    const existingCodeForDifferentVillage = await HoldingCode.findOne({ 
      code: codeValue,
      village: { $ne: villageValue },
      isActive: true 
    });

    if (existingCodeForDifferentVillage) {
      console.log(`⚠️ Code ${codeValue} already exists for village ${existingCodeForDifferentVillage.village}, cannot create for ${villageValue}`);
      console.log(`🔄 Using existing holding code: ${existingCodeForDifferentVillage.code} for village: ${existingCodeForDifferentVillage.village}`);
      return existingCodeForDifferentVillage._id;
    }

    // If no holding code exists, create a new one
    console.log(`🔄 Creating new holding code: ${codeValue} for village: ${villageValue}`);
    
    const newHoldingCode = new HoldingCode({
      code: codeValue,
      village: villageValue,
      description: `Auto-created during import for village ${villageValue}`,
      isActive: true,
      createdBy: userId
    });

    await newHoldingCode.save();
    console.log(`✅ Created new holding code: ${newHoldingCode.code} (ID: ${newHoldingCode._id})`);
    return newHoldingCode._id;

  } catch (error) {
    logger.error('Error in findOrCreateHoldingCode:', { error: error });
    
    // If it's a duplicate error, try to find the existing one
    if (error.code === 11000 || error.code === 'DUPLICATE_HOLDING_CODE' || error.code === 'DUPLICATE_VILLAGE_HOLDING_CODE') {
      logger.info('Duplicate detected trying to find existing holding code');
      
      // Try to find by code first
      let existingCode = await HoldingCode.findOne({ 
        code: holdingCodeValue.toString().trim(),
        isActive: true 
      });
      
      if (existingCode) {
        console.log(`✅ Found existing holding code after duplicate error: ${existingCode.code}`);
        return existingCode._id;
      }
      
      // Try to find by village
      existingCode = await HoldingCode.findOne({ 
        village: village.toString().trim(),
        isActive: true 
      });
      
      if (existingCode) {
        console.log(`✅ Found existing holding code by village after duplicate error: ${existingCode.code}`);
        return existingCode._id;
      }
    }
    
    // If all fails, return null and continue without holding code
    console.warn(`⚠️ Could not create or find holding code ${holdingCodeValue} for village ${village}, continuing without it`);
    return null;
  }
};

/**
 * Simple client creator - handles both old format and new mapped format
 */
const createSimpleClient = async (clientData, userId) => {
  try {
    // Handle both old format (row object) and new format (clientData object)
    const name = clientData.name || `مربي ${clientData.farmLocation || clientData.serialNo || 'غير محدد'}`;
    const nationalId = clientData.nationalId || `${Date.now()}`.substring(0, 10).padStart(10, '1');
    const phone = clientData.phone || `5${Math.floor(Math.random() * 100000000)}`.substring(0, 9);
    const villageName = clientData.village || clientData.farmLocation || 'غير محدد';
    const detailedAddress = clientData.detailedAddress || clientData.farmLocation || 'غير محدد';
    
    // Handle village intelligently
    let villageId = null;
    if (villageName && villageName !== 'غير محدد') {
      console.log(`🔄 Processing village: ${villageName}`);
      // Import Village model
      const Village = require('../models/Village');
      
      // Find or create village
      let village = await Village.findOne({
        $or: [
          { nameArabic: villageName.trim() },
          { nameEnglish: villageName.trim() }
        ]
      });

      if (!village) {
        console.log(`🔄 Creating new village: ${villageName}`);
        village = new Village({
          serialNumber: `AUTO${Date.now().toString().slice(-6)}`,
          sector: 'Unknown Sector',
          nameArabic: villageName.trim(),
          nameEnglish: villageName.trim(),
          createdBy: userId
        });
        await village.save();
      }
      villageId = village._id;
    }
    
    // Handle holding code intelligently
    let holdingCodeId = null;
    if (clientData.holdingCode && clientData.holdingCode.trim() !== '') {
      console.log(`🔄 Processing holding code: ${clientData.holdingCode} for village: ${villageName}`);
      holdingCodeId = await findOrCreateHoldingCode(clientData.holdingCode, villageName, userId);
    }
    
    // Try to find existing client first
    let client = await Client.findOne({ 
      $or: [
        { name: name },
        { nationalId: nationalId },
        { phone: phone }
      ]
    });
    
    if (!client) {
      client = new Client({
        name: name,
        nationalId: nationalId,
        phone: phone,
        birthDate: clientData.birthDate || null,
        village: villageId, // Use village ObjectId instead of string
        detailedAddress: detailedAddress,
        holdingCode: holdingCodeId, // Use ObjectId or null
        status: 'نشط',
        createdBy: userId
      });
      
      await client.save();
      console.log(`✅ Created new client: ${client.name} (ID: ${client.nationalId}) with holding code: ${holdingCodeId || 'none'}`);
    } else {
      // Update existing client with holding code if provided and not already set
      if (holdingCodeId && !client.holdingCode) {
        client.holdingCode = holdingCodeId;
        await client.save();
        console.log(`✅ Updated existing client ${client.name} with holding code: ${holdingCodeId}`);
      } else {
        console.log(`✅ Found existing client: ${client.name} (ID: ${client.nationalId}) with existing holding code: ${client.holdingCode || 'none'}`);
      }
    }
    
    return client;
  } catch (error) {
    logger.error('Error creating client:', { error: error });
    throw new Error(`Error creating client: ${error.message}`);
  }
};

/**
 * Simple date parser
 */
const parseSimpleDate = (dateString) => {
  if (!dateString) return null;
  
  try {
    // Handle D-Mon format (1-Sep, 2-Sep, etc.)
    if (dateString.match(/^\d{1,2}-[A-Za-z]{3}$/)) {
      const currentYear = new Date().getFullYear();
      const monthMap = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
        'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
        'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
      };
      const [day, month] = dateString.split('-');
      const monthNum = monthMap[month];
      if (monthNum) {
        return new Date(`${currentYear}-${monthNum}-${day.padStart(2, '0')}`);
      }
    }
    
    // Try standard date parsing
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    console.warn(`⚠️ Could not parse date: ${dateString}`);
    return null;
  }
};

/**
 * Map Dromo flat data to database structure for Laboratory
 */
const mapDromoToLaboratory = (row) => {
  return {
    // Basic fields
    serialNo: row.serialNo || `LAB-${Date.now()}`,
    date: parseSimpleDate(row.date) || new Date(Date.now() - 24 * 60 * 60 * 1000), // Use yesterday's date as default
    sampleCode: row.sampleCode || `SC-${Date.now()}`,
    
    // Client data - create from flat fields
    clientData: {
      name: row.name || row.client || 'غير محدد',
      nationalId: row.id || row.nationalId || `${Date.now()}`.substring(0, 10),
      phone: row.phone || `5${Math.floor(Math.random() * 100000000)}`.substring(0, 9),
      birthDate: parseSimpleDate(row.birthDate),
    },
    
    // Location data
    farmLocation: row.farmLocation || row.location || 'غير محدد',
    coordinates: {
      latitude: parseFloat(row.latitude) || 0,
      longitude: parseFloat(row.longitude) || 0
    },
    
    // Sample data
    sampleType: row.sampleType || 'Other', // Use 'Other' as default instead of Arabic text
    sampleNumber: row.sampleNumber || '',
    collector: row.collector || 'غير محدد',
    
    // Test results
    positiveCases: parseInt(row.positiveCases) || 0,
    negativeCases: parseInt(row.negativeCases) || 0,
    
    // Species counts
    speciesCounts: {
      sheep: parseInt(row.sheepCount) || 0,
      goats: parseInt(row.goatsCount) || 0,
      cattle: parseInt(row.cattleCount) || 0,
      camel: parseInt(row.camelCount) || 0,
      horse: parseInt(row.horseCount) || 0,
      other: row.otherSpecies || ''
    },
    
    // Additional fields
    remarks: row.remarks || ''
  };
};

/**
 * Map Dromo flat data to database structure for Vaccination
 */
const mapDromoToVaccination = (row) => {
  return {
    // Basic fields
    serialNo: row.serialNo || `VAC-${Date.now()}`,
    date: parseSimpleDate(row.date) || new Date(),
    
    // Client data - create from flat fields
    clientData: {
      name: row.name || row.client || 'غير محدد',
      nationalId: row.id || row.nationalId || `${Date.now()}`.substring(0, 10),
      phone: row.phone || `5${Math.floor(Math.random() * 100000000)}`.substring(0, 9),
      birthDate: parseSimpleDate(row.birthDate),
      village: row.location || row.farmLocation || 'غير محدد',
      detailedAddress: row.location || row.farmLocation || 'غير محدد',
      holdingCode: row.holdingCode || '' // Keep as string, will be processed by findOrCreateHoldingCode
    },
    
    // Location and coordinates
    farmLocation: row.location || row.farmLocation || 'غير محدد',
    coordinates: {
      latitude: parseFloat(row.e) || parseFloat(row.latitude) || 0,
      longitude: parseFloat(row.n) || parseFloat(row.longitude) || 0
    },
    
    // Team and vehicle info
    supervisor: row.supervisor || 'غير محدد',
    team: row.team || 'غير محدد',
    vehicleNo: row.vehicleNo || 'V1',
    
    // Vaccine info
    vaccineType: row.vaccine || row.vaccineType || 'PPR',
    vaccineCategory: row.category || row.vaccineCategory || 'Preventive',
    
    // Animal counts - map from flat structure to nested
    herdCounts: {
      sheep: {
        total: parseInt(row.sheep) || 0,
        young: 0, // Not provided in flat structure
        female: parseInt(row.fSheep) || 0,
        vaccinated: parseInt(row.vaccinatedSheep) || 0
      },
      goats: {
        total: parseInt(row.goats) || 0,
        young: 0,
        female: parseInt(row.fGoats) || 0,
        vaccinated: parseInt(row.vaccinatedGoats) || 0
      },
      camel: {
        total: parseInt(row.camel) || 0,
        young: 0,
        female: parseInt(row.fCamel) || 0,
        vaccinated: parseInt(row.vaccinatedCamels) || 0
      },
      cattle: {
        total: parseInt(row.cattel) || parseInt(row.cattle) || 0,
        young: 0,
        female: parseInt(row.fCattle) || 0,
        vaccinated: parseInt(row.vaccinatedCattle) || 0
      },
      horse: {
        total: parseInt(row.herdNumber) || 0, // Using herdNumber for horses
        young: 0,
        female: parseInt(row.herdFemales) || 0,
        vaccinated: parseInt(row.totalVaccinated) || 0
      }
    },
    
    // Additional fields
    herdHealth: row.herdHealth || 'Healthy',
    animalsHandling: row.animalsHandling || 'Easy',
    labours: row.labours || 'Available',
    reachableLocation: row.reachableLocation || 'Easy',
    
    // Request info - map from flat to nested
    request: {
      date: parseSimpleDate(row.requestDate) || new Date(),
      situation: row.situation || 'Closed',
      fulfillingDate: parseSimpleDate(row.requestFulfillingDate) || new Date()
    },
    
    remarks: row.remarks || ''
  };
};

/**
 * Process Vaccination row from Dromo - With proper mapping
 */
const processVaccinationRow = async (row, userId) => {
  try {
    logger.info('Processing vaccination row:', { data: JSON.stringify(row, null, 2) });
    
    // Map flat Dromo data to database structure
    const mappedData = mapDromoToVaccination(row);
    logger.info('Mapped data:', { data: JSON.stringify(mappedData, null, 2) });
    
    // Create or find client using mapped client data
    const client = await createSimpleClient(mappedData.clientData, userId);
    
    const vaccination = new Vaccination({
      serialNo: mappedData.serialNo,
      date: mappedData.date,
      client: client._id,
      farmLocation: mappedData.farmLocation,
      coordinates: mappedData.coordinates,
      supervisor: mappedData.supervisor,
      team: mappedData.team,
      vehicleNo: mappedData.vehicleNo,
      vaccineType: mappedData.vaccineType,
      vaccineCategory: mappedData.vaccineCategory,
      herdCounts: mappedData.herdCounts,
      herdHealth: mappedData.herdHealth,
      animalsHandling: mappedData.animalsHandling,
      labours: mappedData.labours,
      reachableLocation: mappedData.reachableLocation,
      request: mappedData.request,
      remarks: mappedData.remarks,
      createdBy: userId
    });

    await vaccination.save();
    console.log(`✅ Created vaccination record: ${vaccination.serialNo}`);
    return vaccination;
  } catch (error) {
    logger.error('Error in processVaccinationRow:', { error: error });
    throw new Error(`Error processing vaccination row: ${error.message}`);
  }
};

/**
 * Process ParasiteControl row from Dromo - Simplified
 */
const processParasiteControlRow = async (row, userId) => {
  try {
    logger.info('Processing parasite control row:', { data: JSON.stringify(row, null, 2) });
    
    const client = await createSimpleClient(row, userId);
    const mainDate = parseSimpleDate(row.date) || new Date();
    
    const parasiteControl = new ParasiteControl({
      serialNo: row.serialNo || `PAR-${Date.now()}`,
      date: mainDate,
      client: {
        _id: client._id,
        name: client.name,
        nationalId: client.nationalId,
        phone: client.phone,
        birthDate: client.birthDate
      },
      herdLocation: row.herdLocation || row.farmLocation || 'غير محدد',
      supervisor: row.supervisor || 'غير محدد',
      vehicleNo: row.vehicleNo || 'V1',
      coordinates: {
        latitude: parseFloat(row.latitude) || 0,
        longitude: parseFloat(row.longitude) || 0
      },
      herdCounts: {
        sheep: {
          total: parseInt(row.sheepTotal) || 0,
          female: parseInt(row.sheepFemale) || 0,
          treated: parseInt(row.sheepTreated) || parseInt(row.sheepTotal) || 0
        },
        goats: {
          total: parseInt(row.goatsTotal) || 0,
          female: parseInt(row.goatsFemale) || 0,
          treated: parseInt(row.goatsTreated) || parseInt(row.goatsTotal) || 0
        },
        cattle: {
          total: parseInt(row.cattleTotal) || 0,
          female: parseInt(row.cattleFemale) || 0,
          treated: parseInt(row.cattleTreated) || parseInt(row.cattleTotal) || 0
        }
      },
      insecticide: {
        type: row.insecticideType || 'غير محدد',
        method: (() => {
          const method = row.insecticideMethod || 'Spraying';
          // Ensure method is one of the valid enum values
          const validMethods = ['Pour on', 'Spraying', 'Oral Drenching'];
          if (validMethods.includes(method)) {
            return method;
          }
          // Handle common variations
          const methodLower = method.toLowerCase();
          if (methodLower.includes('pour') || methodLower === 'pour on') {
            return 'Pour on';
          } else if (methodLower.includes('spray') || methodLower === 'spray') {
            return 'Spraying';
          } else if (methodLower.includes('oral') || methodLower.includes('drench')) {
            return 'Oral Drenching';
          }
          return 'Spraying'; // Default fallback
        })(),
        volumeMl: parseInt(row.insecticideVolume) || 0,
        status: row.insecticideStatus || 'Sprayed',
        category: row.insecticideCategory || 'General'
      },
      animalBarnSizeSqM: parseInt(row.animalBarnSize) || 0,
      breedingSites: row.breedingSites || 'غير محدد',
      parasiteControlVolume: parseInt(row.parasiteControlVolume) || 0,
      parasiteControlStatus: row.parasiteControlStatus || 'Completed',
      herdHealthStatus: row.herdHealthStatus || 'Healthy',
      ownerCompliance: row.ownerCompliance || 'Comply',
      request: {
        date: parseSimpleDate(row.requestDate) || mainDate,
        fulfillingDate: parseSimpleDate(row.requestFulfillingDate) || mainDate,
        situation: row.requestSituation || 'Closed'
      },
      remarks: row.remarks || '',
      createdBy: userId
    });

    await parasiteControl.save();
    console.log(`✅ Created parasite control record: ${parasiteControl.serialNo}`);
    return parasiteControl;
  } catch (error) {
    logger.error('Error in processParasiteControlRow:', { error: error });
    throw new Error(`Error processing parasite control row: ${error.message}`);
  }
};

/**
 * Process MobileClinic row from Dromo - Simplified
 */
const processMobileClinicRow = async (row, userId) => {
  try {
    logger.info('Processing mobile clinic row:', { data: JSON.stringify(row, null, 2) });
    
    const client = await createSimpleClient(row, userId);
    const mainDate = parseSimpleDate(row.date) || new Date();
    
    const mobileClinic = new MobileClinic({
      serialNo: row.serialNo || `MC-${Date.now()}`,
      date: mainDate,
      client: {
        _id: client._id,
        name: client.name,
        nationalId: client.nationalId,
        phone: client.phone,
        birthDate: client.birthDate
      },
      farmLocation: row.farmLocation || 'غير محدد',
      supervisor: row.supervisor || 'غير محدد',
      vehicleNo: row.vehicleNo || 'V1',
      coordinates: {
        latitude: parseFloat(row.latitude) || 0,
        longitude: parseFloat(row.longitude) || 0
      },
      animalCounts: {
        sheep: parseInt(row.sheep) || 0,
        goats: parseInt(row.goats) || 0,
        cattle: parseInt(row.cattle) || 0,
        camel: parseInt(row.camel) || 0,
        horse: parseInt(row.horse) || 0
      },
      diagnosis: row.diagnosis || '',
      interventionCategory: row.interventionCategory || 'Routine',
      treatment: row.treatment || '',
      medicationsUsed: row.medicationsUsed ? row.medicationsUsed.split(',').map(med => ({ 
        name: med.trim(), 
        dosage: '1 dose', 
        quantity: 1, 
        route: 'Oral' 
      })) : [],
      request: {
        date: parseSimpleDate(row.requestDate) || mainDate,
        situation: row.requestSituation || 'Closed'
      },
      followUpRequired: row.followUpRequired === 'yes' || row.followUpRequired === true,
      remarks: row.remarks || '',
      createdBy: userId
    });

    await mobileClinic.save();
    console.log(`✅ Created mobile clinic record: ${mobileClinic.serialNo}`);
    return mobileClinic;
  } catch (error) {
    logger.error('Error in processMobileClinicRow:', { error: error });
    throw new Error(`Error processing mobile clinic row: ${error.message}`);
  }
};

/**
 * Process Laboratory row from Dromo - Simplified
 */
const processLaboratoryRow = async (row, userId) => {
  try {
    logger.info('Processing laboratory row:', { data: JSON.stringify(row, null, 2) });
    
    // Map flat Dromo data to database structure
    const mappedData = mapDromoToLaboratory(row);
    logger.info('Mapped laboratory data:', { data: JSON.stringify(mappedData, null, 2) });
    
    // Create or find client
    const client = await createSimpleClient(mappedData.clientData, userId);
    
    const laboratory = new Laboratory({
      serialNo: parseInt(mappedData.serialNo) || Date.now() % 1000000,
      sampleCode: mappedData.sampleCode,
      date: mappedData.date,
      // Use flat client fields as per Laboratory model schema
      clientName: client.name,
      clientId: client.nationalId,
      clientPhone: client.phone,
      clientBirthDate: client.birthDate,
      // Also add client reference for consistency with other models
      client: client._id,
      farmLocation: mappedData.farmLocation,
      coordinates: mappedData.coordinates,
      speciesCounts: mappedData.speciesCounts,
      collector: mappedData.collector,
      sampleType: mappedData.sampleType,
      sampleNumber: mappedData.sampleNumber,
      positiveCases: mappedData.positiveCases,
      negativeCases: mappedData.negativeCases,
      testResults: [],
      remarks: mappedData.remarks,
      createdBy: userId
    });

    await laboratory.save();
    console.log(`✅ Created laboratory record: ${laboratory.sampleCode} for client: ${client.name}`);
    return laboratory;
  } catch (error) {
    logger.error('Error in processLaboratoryRow:', { error: error });
    throw new Error(`Error processing laboratory row: ${error.message}`);
  }
};

/**
 * Process EquineHealth row from Dromo - Simplified
 */
const processEquineHealthRow = async (row, userId) => {
  try {
    logger.info('Processing equine health row:', { data: JSON.stringify(row, null, 2) });
    
    const client = await createSimpleClient(row, userId);
    const mainDate = parseSimpleDate(row.date) || new Date();
    
    const equineHealth = new EquineHealth({
      serialNo: row.serialNo || `EH-${Date.now()}`,
      date: mainDate,
      client: {
        name: client.name,
        nationalId: client.nationalId,
        phone: client.phone,
        birthDate: client.birthDate,
        village: client.village,
        detailedAddress: client.detailedAddress
      },
      farmLocation: row.farmLocation || 'غير محدد',
      supervisor: row.supervisor || 'غير محدد',
      vehicleNo: row.vehicleNo || 'V1',
      coordinates: {
        latitude: parseFloat(row.latitude) || 0,
        longitude: parseFloat(row.longitude) || 0
      },
      horseCount: 1, // Match the single horse detail we're creating
      horseDetails: [{
        id: `H-${Date.now()}`,
        breed: row.horseBreed || 'غير محدد',
        age: parseInt(row.horseAge) || 5,
        gender: row.horseGender === 'Male' ? 'ذكر' : (row.horseGender === 'Female' ? 'أنثى' : 'ذكر'),
        color: row.horseColor || 'غير محدد',
        healthStatus: row.horseHealthStatus === 'Healthy' ? 'سليم' : 'سليم'
      }],
      diagnosis: row.diagnosis || '',
      interventionCategory: row.interventionCategory || 'Routine',
      serviceType: row.serviceType || 'Vaccination',
      treatment: row.treatment || '',
      medicationsUsed: row.medicationsUsed ? row.medicationsUsed.split(',').map(med => ({ 
        name: med.trim(),
        dosage: '1 dose',
        quantity: 1,
        route: 'Injection',
        frequency: 'Once daily',
        duration: '1 day'
      })) : [],
      vaccinesGiven: row.vaccinesGiven ? row.vaccinesGiven.split(',').map(vac => ({ 
        name: vac.trim(),
        dosage: '1 dose',
        quantity: 1,
        route: 'Injection',
        frequency: 'Single dose',
        duration: 'N/A'
      })) : [],
      request: {
        date: parseSimpleDate(row.requestDate) || mainDate,
        situation: row.requestSituation || 'Closed'
      },
      followUpRequired: row.followUpRequired === 'yes' || row.followUpRequired === true,
      remarks: row.remarks || '',
      createdBy: userId
    });

    await equineHealth.save();
    console.log(`✅ Created equine health record: ${equineHealth.serialNo}`);
    return equineHealth;
  } catch (error) {
    logger.error('Error in processEquineHealthRow:', { error: error });
    throw new Error(`Error processing equine health row: ${error.message}`);
  }
};

/**
 * Generic Dromo webhook handler
 */
const handleDromoImport = (Model, processRowFunction) => {
  return async (req, res) => {
    try {
      console.log(`🎯 Dromo import called for: ${Model.modelName}`);
      logger.info('Request body:', { data: JSON.stringify(req.body, null, 2) });
      
      // Always use admin user for webhook imports
      const adminUser = await User.findOne({ role: 'super_admin' });
      const userId = adminUser ? adminUser._id : null;
      
      if (!userId) {
        logger.error('No admin user found');
        return res.status(500).json({
          success: false,
          message: 'No admin user found for import',
          insertedCount: 0,
          totalRows: 0,
          successRows: 0,
          errorRows: 0,
          errors: []
        });
      }
      
      const { data = [] } = req.body;
      
      if (!data || data.length === 0) {
        logger.info('No data provided in request');
        return res.json({
          success: true,
          message: 'تم استيراد 0 سجل بنجاح',
          insertedCount: 0,
          totalRows: 0,
          successRows: 0,
          errorRows: 0,
          errors: [],
          batchId: `dromo_${Date.now()}_${Model.modelName.toLowerCase()}`,
          tableType: Model.modelName.toLowerCase(),
          source: 'dromo-webhook'
        });
      }
      
      console.log(`📊 Processing ${data.length} rows for ${Model.modelName}`);
      
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      
      // Process each row
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        try {
          console.log(`🔄 Processing row ${i + 1}/${data.length}`);
          await processRowFunction(row, userId);
          successCount++;
          console.log(`✅ Row ${i + 1} processed successfully`);
        } catch (error) {
          errorCount++;
          console.error(`❌ Error processing row ${i + 1}:`, error.message);
          errors.push({
            rowIndex: i + 1,
            error: error.message,
            data: row
          });
        }
      }
      
      const response = {
        success: errorCount === 0,
        message: `تم استيراد ${successCount} سجل بنجاح`,
        insertedCount: successCount,
        totalRows: data.length,
        successRows: successCount,
        errorRows: errorCount,
        errors: errors,
        batchId: `dromo_${Date.now()}_${Model.modelName.toLowerCase()}`,
        tableType: Model.modelName.toLowerCase(),
        source: 'dromo-webhook'
      };
      
      console.log(`🎯 Import completed: ${successCount}/${data.length} successful`);
      res.json(response);
      
    } catch (error) {
      logger.error('Dromo import error:', { error: error });
      res.status(500).json({
        success: false,
        message: 'خطأ في معالجة الاستيراد',
        error: error.message,
        insertedCount: 0,
        totalRows: 0,
        successRows: 0,
        errorRows: 0,
        errors: []
      });
    }
  };
};

// Dromo webhook routes
router.post('/vaccination/import-dromo', handleDromoImport(Vaccination, processVaccinationRow));
router.post('/parasite-control/import-dromo', handleDromoImport(ParasiteControl, processParasiteControlRow));
router.post('/mobile-clinics/import-dromo', handleDromoImport(MobileClinic, processMobileClinicRow));
router.post('/laboratories/import-dromo', handleDromoImport(Laboratory, processLaboratoryRow));
router.post('/equine-health/import-dromo', handleDromoImport(EquineHealth, processEquineHealthRow));

module.exports = router;
