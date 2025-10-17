const express = require('express');
const mongoose = require('mongoose');

// Import models
const User = require('../models/User');
const Client = require('../models/Client');
const Vaccination = require('../models/Vaccination');
const ParasiteControl = require('../models/ParasiteControl');
const MobileClinic = require('../models/MobileClinic');
const Laboratory = require('../models/Laboratory');
const EquineHealth = require('../models/EquineHealth');

const router = express.Router();

/**
 * Enhanced field value getter with case-insensitive fallback
 * Supports Arabic and English field names
 */
const getFieldValue = (row, fieldNames) => {
  // First try exact match
  for (const name of fieldNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
      return row[name];
    }
  }
  
  // Try case-insensitive match as fallback
  const rowKeysLower = Object.keys(row).reduce((acc, key) => {
    acc[key.toLowerCase().trim()] = row[key];
    return acc;
  }, {});
  
  for (const name of fieldNames) {
    const lowerName = name.toLowerCase().trim();
    if (rowKeysLower[lowerName] !== undefined && 
        rowKeysLower[lowerName] !== null && 
        rowKeysLower[lowerName] !== '') {
      console.log(`📌 Found field via case-insensitive match: ${name} -> ${rowKeysLower[lowerName]}`);
      return rowKeysLower[lowerName];
    }
  }
  
  return undefined;
};

/**
 * Generate serial number for records
 */
const generateSerialNo = (row, prefix) => {
  const serialNo = getFieldValue(row, [
    'serialNo', 'Serial No', 'serial_no', 'id', 'ID',
    'الرقم التسلسلي', 'رقم'
  ]);
  
  if (serialNo) {
    return serialNo.toString();
  }
  
  // Generate unique serial number
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Parse date from various formats
 */
const parseDate = (dateString) => {
  if (!dateString) return new Date();
  
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
  
  return new Date(dateString);
};

/**
 * Process unified dates from row
 */
const processUnifiedDates = (row) => {
  const mainDateField = getFieldValue(row, [
    'date', 'Date', 'DATE', 'تاريخ', 'التاريخ'
  ]);
  
  const mainDate = parseDate(mainDateField);
  
  return {
    mainDate,
    requestDate: parseDate(getFieldValue(row, [
      'requestDate', 'Request Date', 'request_date', 'تاريخ الطلب'
    ])) || mainDate,
    requestFulfillingDate: parseDate(getFieldValue(row, [
      'requestFulfillingDate', 'Request Fulfilling Date', 'request_fulfilling_date'
    ])) || mainDate
  };
};

/**
 * Process unified client data
 */
const processUnifiedClient = async (row, userId) => {
  // Get client data using multiple possible field names
  const clientName = getFieldValue(row, [
    'Name', 'name', 'clientName', 'Client Name', 'client',
    'owner', 'Owner', 'farmer', 'Farmer',
    'الاسم', 'اسم العميل', 'اسم المربي', 'المالك', 'العميل'
  ]);
  
  const clientId = getFieldValue(row, [
    'ID', 'id', 'clientId', 'Client ID', 'nationalId', 'National ID',
    'ownerId', 'Owner ID', 'identity', 'Identity',
    'رقم الهوية', 'الهوية', 'رقم', 'هوية'
  ]);
  
  const clientPhone = getFieldValue(row, [
    'Phone', 'phone', 'clientPhone', 'Client Phone', 'Mobile', 'mobile',
    'phoneNumber', 'Phone Number', 'tel', 'Tel', 'telephone', 'Telephone',
    'رقم الهاتف', 'الهاتف', 'جوال', 'موبايل'
  ]);
  
  const clientVillage = getFieldValue(row, [
    'Location', 'location', 'Village', 'village', 'clientVillage',
    'Farm Location', 'farmLocation', 'address',
    'القرية', 'الموقع', 'موقع المزرعة', 'العنوان'
  ]);

  console.log(`🔍 Processing client: Name=${clientName}, ID=${clientId}, Phone=${clientPhone}`);

  if (!clientName || !clientId || !clientPhone) {
    throw new Error(`Missing required client data: Name=${clientName}, ID=${clientId}, Phone=${clientPhone}`);
  }

  // Try to find existing client
  let client = await Client.findOne({
    $or: [
      { nationalId: clientId },
      { phone: clientPhone },
      { name: clientName }
    ]
  });

  if (!client) {
    // Create new client with proper validation
    const validNationalId = clientId.length >= 10 ? clientId : clientId.padStart(10, '0');
    
    client = new Client({
      name: clientName,
      nationalId: validNationalId,
      phone: clientPhone,
      village: clientVillage || 'غير محدد',
      status: 'نشط', // Use Arabic status
      createdBy: userId
    });
    await client.save();
    console.log(`✅ Created new client: ${client.name} (${client._id})`);
  } else {
    console.log(`✅ Found existing client: ${client.name} (${client._id})`);
  }

  return client;
};

/**
 * Process herd counts from Dromo data
 */
const processHerdCounts = (row) => {
  return {
    sheep: {
      total: parseInt(getFieldValue(row, ['sheepTotal', 'sheep', 'Sheep Total']) || 0),
      female: parseInt(getFieldValue(row, ['sheepFemale', 'Sheep Female']) || 0),
      vaccinated: parseInt(getFieldValue(row, ['sheepVaccinated', 'Sheep Vaccinated']) || 0)
    },
    goats: {
      total: parseInt(getFieldValue(row, ['goatsTotal', 'goats', 'Goats Total']) || 0),
      female: parseInt(getFieldValue(row, ['goatsFemale', 'Goats Female']) || 0),
      vaccinated: parseInt(getFieldValue(row, ['goatsVaccinated', 'Goats Vaccinated']) || 0)
    },
    camel: {
      total: parseInt(getFieldValue(row, ['camelTotal', 'camel', 'Camel Total']) || 0),
      female: parseInt(getFieldValue(row, ['camelFemale', 'Camel Female']) || 0),
      vaccinated: parseInt(getFieldValue(row, ['camelVaccinated', 'Camel Vaccinated']) || 0)
    },
    cattle: {
      total: parseInt(getFieldValue(row, ['cattleTotal', 'cattle', 'Cattle Total']) || 0),
      female: parseInt(getFieldValue(row, ['cattleFemale', 'Cattle Female']) || 0),
      vaccinated: parseInt(getFieldValue(row, ['cattleVaccinated', 'Cattle Vaccinated']) || 0)
    },
    horse: {
      total: parseInt(getFieldValue(row, ['horseTotal', 'horse', 'Horse Total']) || 0),
      female: parseInt(getFieldValue(row, ['horseFemale', 'Horse Female']) || 0),
      vaccinated: parseInt(getFieldValue(row, ['horseVaccinated', 'Horse Vaccinated']) || 0)
    }
  };
};

/**
 * Process enum values with mapping
 */
const processEnumValue = (row, fieldNames, mapping, defaultValue) => {
  const value = getFieldValue(row, fieldNames);
  if (!value) return defaultValue;
  
  const lowerValue = value.toString().toLowerCase().trim();
  for (const [key, mappedValue] of Object.entries(mapping)) {
    if (key.toLowerCase() === lowerValue) {
      return mappedValue;
    }
  }
  
  return defaultValue;
};

/**
 * Process Vaccination row from Dromo
 */
const processVaccinationRow = async (row, userId) => {
  try {
    console.log('🔄 Processing vaccination row:', JSON.stringify(row, null, 2));
    
    const client = await processUnifiedClient(row, userId);
    const dates = processUnifiedDates(row);
    const herdCounts = processHerdCounts(row);
    
    // Create vaccination record
    const vaccination = new Vaccination({
      serialNo: generateSerialNo(row, 'VAC'),
      date: dates.mainDate,
      client: client._id,
      farmLocation: getFieldValue(row, [
        'farmLocation', 'Location', 'location', 'Farm Location',
        'الموقع', 'موقع المزرعة'
      ]) || 'N/A',
      supervisor: getFieldValue(row, [
        'supervisor', 'Supervisor', 'المشرف'
      ]) || 'Default Supervisor',
      team: getFieldValue(row, [
        'team', 'Team', 'الفريق'
      ]) || 'Default Team',
      vehicleNo: getFieldValue(row, [
        'vehicleNo', 'Vehicle No.', 'Vehicle No', 'vehicle_no',
        'رقم المركبة'
      ]) || 'V1',
      vaccineType: getFieldValue(row, [
        'vaccineType', 'Vaccine', 'vaccine_type', 'Vaccine Type',
        'نوع اللقاح', 'اللقاح'
      ]) || 'PPR',
      vaccineCategory: processEnumValue(
        row,
        ['vaccineCategory', 'Category', 'vaccine_category', 'فئة اللقاح'],
        {
          'vaccination': 'Preventive',
          'emergency': 'Emergency', 
          'urgent': 'Emergency', 
          'عاجل': 'Emergency',
          'preventive': 'Preventive', 
          'وقائي': 'Preventive', 
          'prevention': 'Preventive'
        },
        'Preventive'
      ),
      herdCounts: herdCounts,
      herdHealth: processEnumValue(
        row,
        ['herdHealth', 'Herd Health', 'herd_health', 'صحة القطيع'],
        {
          'healthy': 'Healthy', 
          'صحي': 'Healthy', 
          'سليم': 'Healthy',
          'sick': 'Sick', 
          'مريض': 'Sick', 
          'sporadic': 'Sick',
          'under treatment': 'Under Treatment', 
          'تحت العلاج': 'Under Treatment'
        },
        'Healthy'
      ),
      animalsHandling: processEnumValue(
        row,
        ['animalsHandling', 'Animals Handling', 'animals_handling', 'التعامل مع الحيوانات'],
        {
          'easy handling': 'Easy',
          'easy': 'Easy', 
          'سهل': 'Easy',
          'difficult': 'Difficult', 
          'صعب': 'Difficult', 
          'hard': 'Difficult'
        },
        'Easy'
      ),
      labours: processEnumValue(
        row,
        ['labours', 'Labours', 'العمالة'],
        {
          'available': 'Available', 
          'متوفر': 'Available',
          'not available': 'Not Available', 
          'غير متوفر': 'Not Available',
          'unavailable': 'Not Available'
        },
        'Available'
      ),
      reachableLocation: processEnumValue(
        row,
        ['reachableLocation', 'Reachable Location', 'reachable_location', 'سهولة الوصول'],
        {
          'easy': 'Easy', 
          'سهل': 'Easy',
          'hard to reach': 'Hard to reach', 
          'صعب الوصول': 'Hard to reach',
          'difficult': 'Hard to reach', 
          'hard': 'Hard to reach'
        },
        'Easy'
      ),
      request: {
        date: dates.requestDate,
        fulfillingDate: dates.requestFulfillingDate,
        situation: processEnumValue(
          row,
          ['requestSituation', 'Request Situation', 'request_situation'],
          {
            'closed': 'Closed',
            'open': 'Open',
            'pending': 'Pending'
          },
          'Closed'
        )
      },
      remarks: getFieldValue(row, ['remarks', 'Remarks', 'ملاحظات']) || '',
      createdBy: userId
    });

    await vaccination.save();
    console.log(`✅ Saved vaccination record: ${vaccination.serialNo} (${vaccination._id})`);
    return vaccination;
  } catch (error) {
    console.error('❌ Error processing vaccination row:', error.message);
    throw new Error(`Error processing vaccination row: ${error.message}`);
  }
};

/**
 * Process ParasiteControl row from Dromo
 */
const processParasiteControlRow = async (row, userId) => {
  try {
    console.log('🔄 Processing parasite control row:', JSON.stringify(row, null, 2));
    
    const client = await processUnifiedClient(row, userId);
    const dates = processUnifiedDates(row);
    const herdCounts = processHerdCounts(row);
    
    const parasiteControl = new ParasiteControl({
      serialNo: generateSerialNo(row, 'PAR'),
      date: dates.mainDate,
      client: client._id,
      herdLocation: getFieldValue(row, [
        'herdLocation', 'Herd Location', 'Location', 'location',
        'موقع القطيع', 'الموقع', 'farmLocation'
      ]) || 'N/A',
      supervisor: getFieldValue(row, [
        'supervisor', 'Supervisor', 'المشرف'
      ]) || 'Default Supervisor',
      vehicleNo: getFieldValue(row, [
        'vehicleNo', 'Vehicle No.', 'Vehicle No', 'vehicle_no',
        'رقم المركبة'
      ]) || 'V1',
      herdCounts: herdCounts,
      insecticide: {
        type: getFieldValue(row, [
          'insecticideType', 'Insecticide Used', 'Insecticide', 'insecticide_type',
          'نوع المبيد', 'المبيد المستخدم'
        ]) || 'Default Insecticide',
        method: getFieldValue(row, [
          'insecticideMethod', 'Type', 'Method', 'insecticide_method',
          'طريقة الرش', 'النوع'
        ]) || 'Spray',
        volumeMl: parseInt(getFieldValue(row, [
          'insecticideVolume', 'Volume (ml)', 'Volume', 'insecticide_volume',
          'الحجم (مل)', 'الحجم'
        ]) || 0),
        status: processEnumValue(
          row,
          ['insecticideStatus', 'Status', 'insecticide_status', 'حالة المبيد'],
          {
            'sprayed': 'Sprayed',
            'not sprayed': 'Not Sprayed',
            'مرشوش': 'Sprayed',
            'غير مرشوش': 'Not Sprayed'
          },
          'Sprayed'
        ),
        category: getFieldValue(row, [
          'insecticideCategory', 'Category', 'insecticide_category',
          'فئة المبيد'
        ]) || 'General'
      },
      animalBarnSizeSqM: parseInt(getFieldValue(row, [
        'animalBarnSize', 'Size (sqM)', 'Barn Size', 'animal_barn_size',
        'مساحة الحظيرة', 'الحجم (متر مربع)'
      ]) || 0),
      breedingSites: getFieldValue(row, [
        'breedingSites', 'Breeding Sites', 'breeding_sites',
        'مواقع التكاثر'
      ]) || 'N/A',
      parasiteControlVolume: parseInt(getFieldValue(row, [
        'parasiteControlVolume', 'Parasite Control Volume', 'parasite_control_volume',
        'حجم مكافحة الطفيليات'
      ]) || 0),
      parasiteControlStatus: getFieldValue(row, [
        'parasiteControlStatus', 'Parasite Control Status', 'parasite_control_status',
        'حالة مكافحة الطفيليات'
      ]) || 'Completed',
      herdHealthStatus: processEnumValue(
        row,
        ['herdHealthStatus', 'Herd Health Status', 'herd_health_status', 'حالة صحة القطيع'],
        {
          'healthy': 'Healthy',
          'sick': 'Sick',
          'under treatment': 'Under Treatment',
          'صحي': 'Healthy',
          'مريض': 'Sick',
          'تحت العلاج': 'Under Treatment'
        },
        'Healthy'
      ),
      ownerCompliance: processEnumValue(
        row,
        ['ownerCompliance', 'Owner Compliance', 'owner_compliance', 'امتثال المالك'],
        {
          'comply': 'Comply',
          'not comply': 'Not Comply',
          'ملتزم': 'Comply',
          'غير ملتزم': 'Not Comply'
        },
        'Comply'
      ),
      request: {
        date: dates.requestDate,
        fulfillingDate: dates.requestFulfillingDate,
        situation: processEnumValue(
          row,
          ['requestSituation', 'Request Situation', 'request_situation'],
          {
            'closed': 'Closed',
            'open': 'Open',
            'pending': 'Pending'
          },
          'Closed'
        )
      },
      remarks: getFieldValue(row, ['remarks', 'Remarks', 'ملاحظات']) || '',
      createdBy: userId
    });

    await parasiteControl.save();
    console.log(`✅ Saved parasite control record: ${parasiteControl.serialNo} (${parasiteControl._id})`);
    return parasiteControl;
  } catch (error) {
    console.error('❌ Error processing parasite control row:', error.message);
    throw new Error(`Error processing parasite control row: ${error.message}`);
  }
};

/**
 * Process MobileClinic row from Dromo
 */
const processMobileClinicRow = async (row, userId) => {
  try {
    console.log('🔄 Processing mobile clinic row:', JSON.stringify(row, null, 2));
    
    const client = await processUnifiedClient(row, userId);
    const dates = processUnifiedDates(row);
    
    // Process animal counts (different from herd counts)
    const animalCounts = {
      sheep: parseInt(getFieldValue(row, ['sheep', 'sheepTotal', 'Sheep']) || 0),
      goats: parseInt(getFieldValue(row, ['goats', 'goatsTotal', 'Goats']) || 0),
      camel: parseInt(getFieldValue(row, ['camel', 'camelTotal', 'Camel']) || 0),
      cattle: parseInt(getFieldValue(row, ['cattle', 'cattleTotal', 'Cattle']) || 0),
      horse: parseInt(getFieldValue(row, ['horse', 'horseTotal', 'Horse']) || 0)
    };
    
    const mobileClinic = new MobileClinic({
      serialNo: generateSerialNo(row, 'MC'),
      date: dates.mainDate,
      client: client._id,
      farmLocation: getFieldValue(row, [
        'farmLocation', 'Location', 'location', 'Farm Location',
        'الموقع', 'موقع المزرعة'
      ]) || 'N/A',
      supervisor: getFieldValue(row, [
        'supervisor', 'Supervisor', 'المشرف'
      ]) || 'Default Supervisor',
      vehicleNo: getFieldValue(row, [
        'vehicleNo', 'Vehicle No.', 'Vehicle No', 'vehicle_no',
        'رقم المركبة'
      ]) || 'V1',
      animalCounts: animalCounts,
      diagnosis: getFieldValue(row, [
        'diagnosis', 'Diagnosis', 'التشخيص'
      ]) || '',
      interventionCategory: processEnumValue(
        row,
        ['interventionCategory', 'Intervention Category', 'intervention_category', 'فئة التدخل'],
        {
          'emergency': 'Emergency',
          'routine': 'Routine',
          'follow-up': 'Follow-up',
          'طارئ': 'Emergency',
          'روتيني': 'Routine',
          'متابعة': 'Follow-up'
        },
        'Routine'
      ),
      treatment: getFieldValue(row, [
        'treatment', 'Treatment', 'العلاج'
      ]) || '',
      medicationsUsed: getFieldValue(row, [
        'medicationsUsed', 'Medications Used', 'medications_used', 'الأدوية المستخدمة'
      ])?.split(',').map(med => med.trim()).filter(med => med) || [],
      request: {
        date: dates.requestDate,
        fulfillingDate: dates.requestFulfillingDate,
        situation: processEnumValue(
          row,
          ['requestSituation', 'Request Situation', 'request_situation'],
          {
            'closed': 'Closed',
            'open': 'Open',
            'pending': 'Pending'
          },
          'Closed'
        )
      },
      followUpRequired: processEnumValue(
        row,
        ['followUpRequired', 'Follow Up Required', 'follow_up_required', 'متابعة مطلوبة'],
        {
          'yes': true,
          'no': false,
          'true': true,
          'false': false,
          'نعم': true,
          'لا': false
        },
        false
      ),
      followUpDate: dates.requestFulfillingDate,
      remarks: getFieldValue(row, ['remarks', 'Remarks', 'ملاحظات']) || '',
      createdBy: userId
    });

    await mobileClinic.save();
    console.log(`✅ Saved mobile clinic record: ${mobileClinic.serialNo} (${mobileClinic._id})`);
    return mobileClinic;
  } catch (error) {
    console.error('❌ Error processing mobile clinic row:', error.message);
    throw new Error(`Error processing mobile clinic row: ${error.message}`);
  }
};

/**
 * Process EquineHealth row from Dromo
 */
const processEquineHealthRow = async (row, userId) => {
  try {
    console.log('🔄 Processing equine health row:', JSON.stringify(row, null, 2));
    
    const client = await processUnifiedClient(row, userId);
    const dates = processUnifiedDates(row);
    
    const equineHealth = new EquineHealth({
      serialNo: generateSerialNo(row, 'EH'),
      date: dates.mainDate,
      client: client._id,
      farmLocation: getFieldValue(row, [
        'farmLocation', 'Location', 'location', 'Farm Location',
        'الموقع', 'موقع المزرعة'
      ]) || 'N/A',
      supervisor: getFieldValue(row, [
        'supervisor', 'Supervisor', 'المشرف'
      ]) || 'Default Supervisor',
      vehicleNo: getFieldValue(row, [
        'vehicleNo', 'Vehicle No.', 'Vehicle No', 'vehicle_no',
        'رقم المركبة'
      ]) || 'V1',
      horseDetails: {
        totalCount: parseInt(getFieldValue(row, [
          'horseTotal', 'horse', 'Horse Total', 'total_horses',
          'عدد الخيول', 'إجمالي الخيول'
        ]) || 0),
        maleCount: parseInt(getFieldValue(row, [
          'horseMale', 'Horse Male', 'male_horses',
          'الخيول الذكور', 'ذكور'
        ]) || 0),
        femaleCount: parseInt(getFieldValue(row, [
          'horseFemale', 'Horse Female', 'female_horses',
          'الخيول الإناث', 'إناث'
        ]) || 0),
        youngCount: parseInt(getFieldValue(row, [
          'horseYoung', 'Horse Young', 'young_horses',
          'المهور', 'صغار الخيول'
        ]) || 0)
      },
      healthStatus: processEnumValue(
        row,
        ['healthStatus', 'Health Status', 'health_status', 'الحالة الصحية'],
        {
          'healthy': 'Healthy',
          'sick': 'Sick',
          'under treatment': 'Under Treatment',
          'quarantine': 'Quarantine',
          'صحي': 'Healthy',
          'مريض': 'Sick',
          'تحت العلاج': 'Under Treatment',
          'حجر صحي': 'Quarantine'
        },
        'Healthy'
      ),
      serviceType: processEnumValue(
        row,
        ['serviceType', 'Service Type', 'service_type', 'نوع الخدمة'],
        {
          'vaccination': 'Vaccination',
          'treatment': 'Treatment',
          'checkup': 'Checkup',
          'emergency': 'Emergency',
          'تطعيم': 'Vaccination',
          'علاج': 'Treatment',
          'فحص': 'Checkup',
          'طارئ': 'Emergency'
        },
        'Checkup'
      ),
      diagnosis: getFieldValue(row, [
        'diagnosis', 'Diagnosis', 'التشخيص'
      ]) || '',
      treatment: getFieldValue(row, [
        'treatment', 'Treatment', 'العلاج'
      ]) || '',
      medicationsUsed: getFieldValue(row, [
        'medicationsUsed', 'Medications Used', 'medications_used', 'الأدوية المستخدمة'
      ])?.split(',').map(med => med.trim()).filter(med => med) || [],
      vaccinesGiven: getFieldValue(row, [
        'vaccinesGiven', 'Vaccines Given', 'vaccines_given', 'اللقاحات المعطاة'
      ])?.split(',').map(vac => vac.trim()).filter(vac => vac) || [],
      followUpRequired: processEnumValue(
        row,
        ['followUpRequired', 'Follow Up Required', 'follow_up_required', 'متابعة مطلوبة'],
        {
          'yes': true,
          'no': false,
          'true': true,
          'false': false,
          'نعم': true,
          'لا': false
        },
        false
      ),
      followUpDate: dates.requestFulfillingDate,
      remarks: getFieldValue(row, ['remarks', 'Remarks', 'ملاحظات']) || '',
      createdBy: userId
    });

    await equineHealth.save();
    console.log(`✅ Saved equine health record: ${equineHealth.serialNo} (${equineHealth._id})`);
    return equineHealth;
  } catch (error) {
    console.error('❌ Error processing equine health row:', error.message);
    throw new Error(`Error processing equine health row: ${error.message}`);
  }
};
const processLaboratoryRow = async (row, userId) => {
  try {
    console.log('🔄 Processing laboratory row:', JSON.stringify(row, null, 2));
    
    const client = await processUnifiedClient(row, userId);
    const dates = processUnifiedDates(row);
    
    // Process species counts
    const speciesCounts = {
      sheep: parseInt(getFieldValue(row, ['sheep', 'sheepTotal', 'Sheep']) || 0),
      goats: parseInt(getFieldValue(row, ['goats', 'goatsTotal', 'Goats']) || 0),
      camel: parseInt(getFieldValue(row, ['camel', 'camelTotal', 'Camel']) || 0),
      cattle: parseInt(getFieldValue(row, ['cattle', 'cattleTotal', 'Cattle']) || 0),
      horse: parseInt(getFieldValue(row, ['horse', 'horseTotal', 'Horse']) || 0)
    };
    
    const laboratory = new Laboratory({
      sampleCode: generateSerialNo(row, 'LAB'),
      date: dates.mainDate,
      client: client._id,
      collector: getFieldValue(row, [
        'collector', 'Collector', 'جامع العينة'
      ]) || 'Default Collector',
      sampleType: getFieldValue(row, [
        'sampleType', 'Sample Type', 'sample_type', 'نوع العينة'
      ]) || 'Blood',
      speciesCounts: speciesCounts,
      positiveCases: parseInt(getFieldValue(row, [
        'positiveCases', 'Positive Cases', 'positive_cases', 'الحالات الإيجابية'
      ]) || 0),
      negativeCases: parseInt(getFieldValue(row, [
        'negativeCases', 'Negative Cases', 'negative_cases', 'الحالات السلبية'
      ]) || 0),
      remarks: getFieldValue(row, ['remarks', 'Remarks', 'ملاحظات']) || '',
      createdBy: userId
    });

    await laboratory.save();
    console.log(`✅ Saved laboratory record: ${laboratory.sampleCode} (${laboratory._id})`);
    return laboratory;
  } catch (error) {
    console.error('❌ Error processing laboratory row:', error.message);
    throw new Error(`Error processing laboratory row: ${error.message}`);
  }
};

/**
 * Generic Dromo webhook handler
 */
const handleDromoImport = (Model, processRowFunction) => {
  return async (req, res) => {
    try {
      console.log(`🎯 Dromo import called for: ${Model.modelName}`);
      console.log('📊 Request body:', JSON.stringify(req.body, null, 2));
      
      // Always use admin user for webhook imports
      const adminUser = await User.findOne({ role: 'super_admin' });
      const userId = adminUser ? adminUser._id : null;
      
      if (!userId) {
        console.error('❌ No admin user found');
        return res.status(500).json({
          success: false,
          message: 'لا يوجد مستخدم إداري في النظام'
        });
      }
      
      console.log('✅ Using admin user:', adminUser.name, 'ID:', userId);
      
      // Get data from Dromo webhook (try multiple formats)
      let rows = null;
      if (req.body.data && Array.isArray(req.body.data)) {
        rows = req.body.data;
      } else if (req.body.rows && Array.isArray(req.body.rows)) {
        rows = req.body.rows;
      } else if (Array.isArray(req.body)) {
        rows = req.body;
      } else if (req.body.validData && Array.isArray(req.body.validData)) {
        rows = req.body.validData;
      }
      
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'لا توجد بيانات صالحة للاستيراد'
        });
      }
      
      console.log(`📊 Processing ${rows.length} rows for ${Model.modelName}`);
      
      // Process and save rows
      const savedRecords = [];
      const errors = [];
      
      for (let i = 0; i < rows.length; i++) {
        try {
          const record = await processRowFunction(rows[i], userId);
          if (record) {
            savedRecords.push(record);
          }
        } catch (error) {
          console.error(`❌ Error processing row ${i + 1}:`, error.message);
          errors.push({
            rowIndex: i + 1,
            error: error.message,
            data: rows[i]
          });
        }
      }
      
      console.log(`✅ Successfully saved ${savedRecords.length} records, ${errors.length} errors`);
      
      // Verify records are actually in database
      const dbCount = await Model.countDocuments();
      console.log(`📊 Total records in ${Model.modelName} collection: ${dbCount}`);
      
      res.json({
        success: true,
        message: `تم استيراد ${savedRecords.length} سجل بنجاح`,
        insertedCount: savedRecords.length,
        totalRows: rows.length,
        successRows: savedRecords.length,
        errorRows: errors.length,
        errors: errors.length > 0 ? errors : undefined,
        batchId: `dromo_${Date.now()}_${Model.modelName.toLowerCase()}`,
        tableType: Model.modelName.toLowerCase(),
        source: 'dromo-webhook'
      });
      
    } catch (error) {
      console.error(`❌ Dromo import error for ${Model.modelName}:`, error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء الاستيراد',
        error: error.message
      });
    }
  };
};

// Test route
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Dromo import routes are working!',
    availableRoutes: [
      'POST /import-export/vaccination/import-dromo',
      'POST /import-export/laboratories/import-dromo'
    ],
    timestamp: new Date().toISOString()
  });
});

// Define routes for each table type
router.post('/vaccination/import-dromo', (req, res, next) => {
  console.log('🎯 Vaccination Dromo route called');
  next();
}, handleDromoImport(Vaccination, processVaccinationRow));

router.post('/laboratories/import-dromo', (req, res, next) => {
  console.log('🎯 Laboratory Dromo route called');
  next();
}, handleDromoImport(Laboratory, processLaboratoryRow));

router.post('/parasite-control/import-dromo', (req, res, next) => {
  console.log('🎯 Parasite Control Dromo route called');
  next();
}, handleDromoImport(ParasiteControl, processParasiteControlRow));

router.post('/mobile-clinics/import-dromo', (req, res, next) => {
  console.log('🎯 Mobile Clinics Dromo route called');
  next();
}, handleDromoImport(MobileClinic, processMobileClinicRow));

router.post('/equine-health/import-dromo', (req, res, next) => {
  console.log('🎯 Equine Health Dromo route called');
  next();
}, handleDromoImport(EquineHealth, processEquineHealthRow));

console.log('✅ Dromo import routes registered:');
console.log('  - POST /vaccination/import-dromo');
console.log('  - POST /laboratories/import-dromo');
console.log('  - POST /parasite-control/import-dromo');
console.log('  - POST /mobile-clinics/import-dromo');
console.log('  - POST /equine-health/import-dromo');

module.exports = router;
