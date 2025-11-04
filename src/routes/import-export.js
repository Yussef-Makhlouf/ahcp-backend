const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const mongoose = require('mongoose');

const logger = require('../utils/logger');
// Import middleware
const { auth } = require('../middleware/auth');

// Import models
const Client = require('../models/Client');
const Vaccination = require('../models/Vaccination');
const ParasiteControl = require('../models/ParasiteControl');
const MobileClinic = require('../models/MobileClinic');
const Laboratory = require('../models/Laboratory');
const EquineHealth = require('../models/EquineHealth');
const HoldingCode = require('../models/HoldingCode');
const Village = require('../models/Village');
const filterBuilder = require('../utils/filterBuilder');
const {
  normalizeEquineInterventionCategory,
  normalizeEquineInterventionCategoryList
} = require('../utils/interventionCategories');

const router = express.Router();

// Arabic headers mapping for better user experience
const arabicHeaders = {
  // Clients
  'name': 'الاسم',
  'nationalId': 'رقم الهوية',
  'phone': 'رقم الهاتف',
  'village': 'القرية',
  'totalAnimals': 'إجمالي الحيوانات',
  
  // Vaccination
  'serialNo': 'الرقم التسلسلي',
  'date': 'التاريخ',
  'client': 'العميل',
  'farmLocation': 'موقع المزرعة',
  'supervisor': 'المشرف',
  'team': 'الفريق',
  'vehicleNo': 'رقم المركبة',
  'vaccineType': 'نوع اللقاح',
  'vaccineCategory': 'فئة اللقاح',
  'herdHealth': 'صحة القطيع',
  'animalsHandling': 'التعامل مع الحيوانات',
  'labours': 'العمالة',
  'reachableLocation': 'سهولة الوصول',
  'remarks': 'ملاحظات',
  
  // Parasite Control
  'herdLocation': 'موقع القطيع',
  'insecticide': 'المبيد',
  'animalBarnSizeSqM': 'مساحة الحظيرة',
  'breedingSites': 'مواقع التكاثر',
  'parasiteControlVolume': 'حجم مكافحة الطفيليات',
  'parasiteControlStatus': 'حالة مكافحة الطفيليات',
  'herdHealthStatus': 'حالة صحة القطيع',
  'complyingToInstructions': 'الالتزام بالتعليمات',
  
  // Mobile Clinics
  'animalCounts': 'عدد الحيوانات',
  'diagnosis': 'التشخيص',
  'interventionCategory': 'فئة التدخل',
  'treatment': 'العلاج',
  'medicationsUsed': 'الأدوية المستخدمة',
  'followUpRequired': 'مطلوب متابعة',
  'followUpDate': 'تاريخ المتابعة',
  
  // Laboratories
  'sampleCode': 'رمز العينة',
  'clientName': 'اسم العميل',
  'clientId': 'رقم العميل',
  'clientPhone': 'هاتف العميل',
  'speciesCounts': 'عدد الأنواع',
  'collector': 'جامع العينة',
  'sampleType': 'نوع العينة',
  'sampleNumber': 'رقم العينة',
  'positiveCases': 'الحالات الإيجابية',
  'negativeCases': 'الحالات السلبية',
  'testResults': 'نتائج الفحص',
  
  // Equine Health
  'horseCount': 'عدد الخيول',
  'coordinates': 'الإحداثيات',
  'latitude': 'خط العرض',
  'longitude': 'خط الطول'
};

const normalizeFilterValue = (value) => {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const cleaned = value.map(v => String(v).trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned.join(',') : undefined;
  }
  const stringValue = String(value).trim();
  return stringValue === '' || stringValue === '__all__' ? undefined : stringValue;
};

const buildClientExportFilters = (query = {}) => {
  const match = {};

  const dateFilter = filterBuilder.buildDateFilter(query.startDate, query.endDate);
  if (dateFilter) {
    match.createdAt = dateFilter;
  }

  const village = normalizeFilterValue(query.village);
  if (village) {
    match.village = { $regex: village, $options: 'i' };
  }

  const animalTypeValue = normalizeFilterValue(query.animalType || query['animals.animalType']);
  if (animalTypeValue) {
    const animalTypeFilter = filterBuilder.buildMultiValueFilter(animalTypeValue);
    if (animalTypeFilter) {
      match['animals.animalType'] = animalTypeFilter;
    }
  }

  const search = normalizeFilterValue(query.search);
  if (search) {
    match.$or = [
      { name: { $regex: search, $options: 'i' } },
      { nationalId: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { village: { $regex: search, $options: 'i' } }
    ];
  }

  const servicesValue = normalizeFilterValue(query.servicesReceived);
  const servicesFilter = servicesValue ? filterBuilder.buildMultiValueFilter(servicesValue) : null;

  const totalAnimalsRange = normalizeFilterValue(query.totalAnimals);

  return { match, servicesFilter, totalAnimalsRange };
};

const applyServicesMatch = (pipeline, servicesFilter) => {
  if (!servicesFilter || Object.keys(servicesFilter).length === 0) {
    return;
  }
  
  // Create comprehensive service filter to match different service name formats
  const serviceVariants = [];
  const originalServices = servicesFilter.$in || [servicesFilter];
  
  originalServices.forEach(service => {
    serviceVariants.push(service); // Original value
    
    // Add common variants
    if (service === 'mobile_clinic') {
      serviceVariants.push('Mobile Clinic', 'mobile clinic', 'العيادة المتنقلة');
    } else if (service === 'parasite_control') {
      serviceVariants.push('Parasite Control', 'parasite control', 'مكافحة الطفيليات');
    } else if (service === 'vaccination') {
      serviceVariants.push('Vaccination', 'vaccination', 'التحصين');
    } else if (service === 'laboratory') {
      serviceVariants.push('Laboratory', 'laboratory', 'المختبر');
    } else if (service === 'equine_health') {
      serviceVariants.push('Equine Health', 'equine health', 'صحة الخيول', 'Horse Health');
    }
  });
  
  logger.info('Services filter variants:', { data: serviceVariants });
  
  pipeline.push({ 
    $match: { 
      servicesReceived: { $in: serviceVariants }
    } 
  });
};

const applyTotalAnimalsMatch = (pipeline, range) => {
  if (!range) return;

  let condition = null;
  switch (range) {
    case '1-10':
      condition = { $gte: 1, $lte: 10 };
      break;
    case '11-50':
      condition = { $gte: 11, $lte: 50 };
      break;
    case '51-100':
      condition = { $gte: 51, $lte: 100 };
      break;
    case '101-500':
      condition = { $gte: 101, $lte: 500 };
      break;
    case '500+':
      condition = { $gt: 500 };
      break;
    default:
      break;
  }

  if (condition) {
    pipeline.push({ $match: { totalAnimals: condition } });
  }
};

// Configure multer for memory storage (better for serverless)
const upload = multer({
  storage: multer.memoryStorage(), // Use memory storage instead of disk
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for serverless
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.csv', '.xlsx', '.xls'];
    
    const hasValidExtension = allowedExtensions.some(ext => 
      file.originalname.toLowerCase().endsWith(ext)
    );
    
    if (hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed (.csv, .xlsx, .xls)'));
    }
  }
});

// Helper function to parse file data from memory buffer
const parseFileData = async (fileBuffer, fileName) => {
  const results = [];
  
  try {
    if (fileName.toLowerCase().endsWith('.csv')) {
      // Parse CSV from buffer
      const csvString = fileBuffer.toString('utf8');
      const lines = csvString.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        throw new Error('CSV file is empty');
      }
      
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          results.push(row);
        }
      }
    } else if (fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls')) {
      // Parse Excel from buffer
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0]; // Use first sheet
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet) {
        throw new Error('Excel file has no worksheets');
      }
      
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      if (jsonData.length === 0) {
        throw new Error('Excel file is empty');
      }
      
      // Convert Excel data to same format as CSV
      jsonData.forEach((row, index) => {
        results.push(row);
      });
    } else {
      throw new Error('Unsupported file format. Please use CSV or Excel files.');
    }
    
    return results;
  } catch (error) {
    logger.error('Error parsing file:', { error: error });
    throw new Error(`Failed to parse file: ${error.message}`);
  }
};

// Validate import data before processing
const validateImportData = (data, Model) => {
  const errors = [];
  
  if (!data || data.length === 0) {
    errors.push({
      field: 'data',
      message: 'No data found in file'
    });
    return errors;
  }
  
  // For import, we will be more lenient and let the processing functions handle validation
  // This allows for better error messages and fallback values
  
  return errors; // Return empty errors array to allow processing
  
  data.forEach((row, index) => {
    
    requiredFields.forEach(field => {
      // Check multiple possible field names including Arabic equivalents
      const fieldVariants = [
        field,
        field.replace(/([A-Z])/g, '_$1').toLowerCase(), // camelCase to snake_case
        field.replace(/_/g, ''), // remove underscores
        field.toLowerCase(), // lowercase
        field.replace(/\s+/g, ''), // remove spaces
        field.replace(/\s+/g, '_'), // spaces to underscores
        field.replace(/\s+/g, '').toLowerCase(), // remove spaces and lowercase
        field.replace(/\s+/g, '').toUpperCase(), // remove spaces and uppercase
        field.replace(/\s+/g, '').charAt(0).toUpperCase() + field.replace(/\s+/g, '').slice(1).toLowerCase(), // Title case
        // Arabic equivalents
        ...(field === 'Name' ? ['اسم', 'الاسم', 'اسم المالك', 'اسم المربي', 'اسم العميل'] : []),
        ...(field === 'Date' ? ['تاريخ', 'التاريخ', 'تاريخ التقرير'] : []),
        // Common variations
        ...(field === 'Name' ? ['Client Name', 'clientName', 'client_name', 'owner_name', 'ownerName', 'اسم العميل', 'اسم المالك', 'اسم المربي', 'Name', 'name', 'NAME'] : []),
        ...(field === 'Date' ? ['Report Date', 'reportDate', 'report_date', 'visit_date', 'visitDate', 'تاريخ التقرير', 'تاريخ الزيارة', 'Date', 'date', 'DATE'] : []),
        // Excel common column names
        ...(field === 'Name' ? ['Name', 'name', 'NAME', 'اسم', 'الاسم', 'اسم العميل', 'اسم المربي'] : []),
        ...(field === 'Date' ? ['Date', 'date', 'DATE', 'تاريخ', 'التاريخ'] : [])
      ];
      
      
      const hasField = fieldVariants.some(variant => {
        const value = row[variant];
        const hasValue = value && value.toString().trim() !== '';
        return hasValue;
      });
      
      // Additional check: look for any field that might contain the required data
      if (!hasField && (field === 'Name' || field === 'Date')) {
        const allKeys = Object.keys(row);
        const foundKey = allKeys.find(key => {
          const value = row[key];
          const hasValue = value && value.toString().trim() !== '';
          return hasValue;
        });
        
        if (foundKey) {
          // Don't add error if we found the data
          return;
        }
        
        // Special check for Name field - look for any field that might contain a name
        if (field === 'Name') {
          const nameLikeKeys = allKeys.filter(key => {
            const value = row[key];
            if (!value || value.toString().trim() === '') return false;
            
            const valueStr = value.toString().trim();
            // Check if it looks like a name (contains Arabic characters or is not a number)
            if (valueStr.match(/[\u0600-\u06FF]/) || // Arabic characters
                (isNaN(valueStr) && valueStr.length > 2 && !valueStr.match(/^\d+$/))) {
              return true;
            }
            return false;
          });
          
          if (nameLikeKeys.length > 0) {
            return; // Don't add error
          }
        }
      }
      
      // Special handling for Date field - check if we found it but it's not in the first loop
      if (field === 'Date' && !hasField) {
        const allKeys = Object.keys(row);
        const dateLikeKeys = allKeys.filter(key => {
          const value = row[key];
          if (!value || value.toString().trim() === '') return false;
          
          const valueStr = value.toString().trim();
          // Check if it looks like a date (D-Mon format or other date formats)
          if (valueStr.match(/^\d{1,2}-[A-Za-z]{3}$/)) {
            return true;
          }
          if (valueStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
            return true;
          }
          if (valueStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return true;
          }
          // Don't treat pure numbers as dates unless they're in specific date formats
          if (valueStr.match(/^\d{1,2}-\d{1,2}-\d{4}$/) || 
              valueStr.match(/^\d{4}-\d{1,2}-\d{1,2}$/) ||
              valueStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
            return true;
          }
          return false;
        });
        
        if (dateLikeKeys.length > 0) {
          return; // Don't add error
        }
      }
      
      if (!hasField) {
        // Only add error for truly required fields (Date and Name)
        if (field === 'Date' || field === 'Name') {
          // Check if we already have an error for this field in this row
          const existingError = errors.find(err => 
            err.row === index + 1 && err.field === field
          );
          if (!existingError) {
            errors.push({
              row: index + 1,
              field: field,
              message: `Required field '${field}' is missing or empty`
            });
          }
        }
      } else {
      }
    });
    
    // Check for date fields (optional validation)
    const dateFields = [
      'date', 'Date', 'DATE', 
      'تاريخ', 'التاريخ',
      'Request Date', 'requestDate', 'request_date',
      'Birth Date', 'birthDate', 'birth_date', 'Date of Birth', 'dateOfBirth',
      'Request Fulfilling Date', 'requestFulfillingDate', 'request_fulfilling_date'
    ];
    
    // Look for any date field in the row
    let hasValidDate = false;
    let foundDateField = null;
    
    dateFields.forEach(dateField => {
      if (row[dateField] && !hasValidDate) {
        const dateString = row[dateField].toString().trim();
        
        // Handle D-Mon format (1-Sep, 2-Sep, etc.)
        let dateValue;
        if (dateString.match(/^\d{1,2}-[A-Za-z]{3}$/)) {
          // Convert D-Mon format to proper date
          const currentYear = new Date().getFullYear();
          const monthMap = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
            'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
            'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
          };
          const [day, month] = dateString.split('-');
          const monthNum = monthMap[month];
          if (monthNum) {
            dateValue = new Date(`${currentYear}-${monthNum}-${day.padStart(2, '0')}`);
          } else {
            dateValue = new Date(dateString);
          }
        } else {
          dateValue = new Date(dateString);
        }
        
        if (!isNaN(dateValue.getTime())) {
          hasValidDate = true;
          foundDateField = dateField;
        }
      }
    });
    
    // Only add date error if we specifically require a date field and none found
    // Since dates are now optional, we don't add errors for missing dates
    
    // Validate JSON fields
    if (row.medicationsUsed && typeof row.medicationsUsed === 'string') {
      try {
        JSON.parse(row.medicationsUsed);
      } catch (e) {
        errors.push({
          row: index + 1,
          field: 'medicationsUsed',
          message: 'Invalid JSON format for medicationsUsed'
        });
      }
    }
  });
  
  return errors;
};

// Get required fields for each model - now more lenient
const getRequiredFields = (Model) => {
  const modelName = Model.modelName;
  
  // Return empty array for all models to allow processing functions to handle validation
  // This provides better error messages and allows for fallback values
  return [];
};

// Helper function to validate field mapping
const validateFieldMapping = (records, fields) => {
  if (!records || records.length === 0) {
    return {
      isValid: false,
      message: 'No data found',
      availableFields: []
    };
  }

  const availableFields = Object.keys(records[0]);
  const clientFields = records[0].client ? Object.keys(records[0].client) : [];
  const allAvailableFields = [...availableFields, ...clientFields];
  
  logger.info('Available fields in main record:', { data: availableFields });
  logger.info('Available fields in client:', { data: clientFields });
  logger.info('All available fields:', { data: allAvailableFields });
  
  const missingFields = fields.filter(field => !allAvailableFields.includes(field));
  
  return {
    isValid: missingFields.length === 0,
    availableFields: allAvailableFields,
    missingFields,
    message: missingFields.length > 0 ? 
      `Missing fields: ${missingFields.join(', ')}` : 
      'All fields available'
  };
};

// Helper function to generate CSV content with English headers
const generateCSV = (data, headers) => {
  if (!data || data.length === 0) {
    const headerRow = headers.join(',');
    return headerRow;
  }
  
  // Use English headers (same as template headers)
  const csvHeaders = headers.join(',');
  const csvRows = data.map(row => 
    headers.map(header => {
      let value = row[header] || '';
      
      // Check if field exists in client object
      if (value === '' || value === undefined) {
        if (row.client && row.client[header] !== undefined) {
          value = row.client[header];
        }
      }
      
      // Handle date fields formatting for CSV
      if (header === 'birthDate' || header === 'clientBirthDate' || header === 'date' || header === 'Birth of Date' || header === 'Date of Birth' || header === 'Birth Date') {
        if (value instanceof Date) {
          // Format date for CSV (YYYY-MM-DD)
          value = value.toISOString().split('T')[0];
        } else if (value && typeof value === 'string') {
          // Try to parse and format date string
          const dateValue = new Date(value);
          if (!isNaN(dateValue.getTime())) {
            value = dateValue.toISOString().split('T')[0];
          }
        }
      }
      
      // Handle animal count fields from nested objects
      if (value === '' || value === undefined) {
        if (header === 'sheep' && row.herdCounts && row.herdCounts.sheep) {
          value = row.herdCounts.sheep.total || 0;
        } else if (header === 'sheepFemale' && row.herdCounts && row.herdCounts.sheep) {
          value = row.herdCounts.sheep.female || 0;
        } else if (header === 'sheepVaccinated' && row.herdCounts && row.herdCounts.sheep) {
          value = row.herdCounts.sheep.vaccinated || 0;
        } else if (header === 'goats' && row.herdCounts && row.herdCounts.goats) {
          value = row.herdCounts.goats.total || 0;
        } else if (header === 'goatsFemale' && row.herdCounts && row.herdCounts.goats) {
          value = row.herdCounts.goats.female || 0;
        } else if (header === 'goatsVaccinated' && row.herdCounts && row.herdCounts.goats) {
          value = row.herdCounts.goats.vaccinated || 0;
        } else if (header === 'camel' && row.herdCounts && row.herdCounts.camel) {
          value = row.herdCounts.camel.total || 0;
        } else if (header === 'camelFemale' && row.herdCounts && row.herdCounts.camel) {
          value = row.herdCounts.camel.female || 0;
        } else if (header === 'camelVaccinated' && row.herdCounts && row.herdCounts.camel) {
          value = row.herdCounts.camel.vaccinated || 0;
        } else if (header === 'cattle' && row.herdCounts && row.herdCounts.cattle) {
          value = row.herdCounts.cattle.total || 0;
        } else if (header === 'cattleFemale' && row.herdCounts && row.herdCounts.cattle) {
          value = row.herdCounts.cattle.female || 0;
        } else if (header === 'cattleVaccinated' && row.herdCounts && row.herdCounts.cattle) {
          value = row.herdCounts.cattle.vaccinated || 0;
        } else if (header === 'herdNumber' && row.herdCounts) {
          value = (row.herdCounts.sheep?.total || 0) + (row.herdCounts.goats?.total || 0) + (row.herdCounts.camel?.total || 0) + (row.herdCounts.cattle?.total || 0);
        } else if (header === 'herdFemales' && row.herdCounts) {
          value = (row.herdCounts.sheep?.female || 0) + (row.herdCounts.goats?.female || 0) + (row.herdCounts.camel?.female || 0) + (row.herdCounts.cattle?.female || 0);
        } else if (header === 'totalVaccinated' && row.herdCounts) {
          value = (row.herdCounts.sheep?.vaccinated || 0) + (row.herdCounts.goats?.vaccinated || 0) + (row.herdCounts.camel?.vaccinated || 0) + (row.herdCounts.cattle?.vaccinated || 0);
        }
        // Handle animalCounts for Mobile Clinic
        else if (header === 'sheep' && row.animalCounts && row.animalCounts.sheep) {
          value = row.animalCounts.sheep || 0;
        } else if (header === 'goats' && row.animalCounts && row.animalCounts.goats) {
          value = row.animalCounts.goats || 0;
        } else if (header === 'camel' && row.animalCounts && row.animalCounts.camel) {
          value = row.animalCounts.camel || 0;
        } else if (header === 'cattle' && row.animalCounts && row.animalCounts.cattle) {
          value = row.animalCounts.cattle || 0;
        } else if (header === 'horse' && row.animalCounts && row.animalCounts.horse) {
          value = row.animalCounts.horse || 0;
        }
       
        // Handle speciesCounts for Laboratory
        else if (header === 'sheep' && row.speciesCounts && row.speciesCounts.sheep) {
          value = row.speciesCounts.sheep || 0;
        } else if (header === 'goats' && row.speciesCounts && row.speciesCounts.goats) {
          value = row.speciesCounts.goats || 0;
        } else if (header === 'camel' && row.speciesCounts && row.speciesCounts.camel) {
          value = row.speciesCounts.camel || 0;
        } else if (header === 'cattle' && row.speciesCounts && row.speciesCounts.cattle) {
          value = row.speciesCounts.cattle || 0;
        } else if (header === 'horse' && row.speciesCounts && row.speciesCounts.horse) {
          value = row.speciesCounts.horse || 0;
        } else if (header === 'otherSpecies' && row.speciesCounts && row.speciesCounts.other) {
          value = row.speciesCounts.other || '';
        }
      }
      
      // Handle nested objects (like client data)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.name) {
          value = value.name;
        } else if (value._id) {
          value = value._id.toString();
        } else if (header.includes('Counts') || header.includes('Herd') || header.includes('Animal')) {
          // Skip nested animal count objects - we now have separate fields
          value = '';
        } else {
          value = JSON.stringify(value);
        }
      }
      
      // Handle arrays
      if (Array.isArray(value)) {
        value = value.join(', ');
      }
      
      // Handle dates
      if (value instanceof Date) {
        value = value.toISOString().split('T')[0]; // YYYY-MM-DD format
      }
      
      // Handle boolean values
      if (typeof value === 'boolean') {
        value = value ? 'نعم' : 'لا';
      }
      
      // Handle null/undefined
      if (value === null || value === undefined) {
        value = '';
      }
      
      // Convert to string and clean up
      value = String(value).trim();
      
      // Escape commas and quotes for CSV
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      
      return value;
    }).join(',')
  );
  
  return [csvHeaders, ...csvRows].join('\n');
};

// Helper function to generate Excel content with English headers
const generateExcel = (data, headers) => {
  if (!data || data.length === 0) {
    // Create empty worksheet with headers only
    const emptyData = [{}];
    headers.forEach(header => {
      emptyData[0][header] = '';
    });
    const worksheet = XLSX.utils.json_to_sheet(emptyData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  logger.info('generateExcel called with:', { data: {
    dataLength: data ? data.length : 0,
    headers: headers
  } });

  // Process data to flatten nested objects and arrays
  const processedData = data.map((row, rowIndex) => {
    const processedRow = {};
    
    headers.forEach((header, index) => {
      let value = row[header];
      
      // Check if field exists in client object
      if (value === undefined && row.client && row.client[header] !== undefined) {
        value = row.client[header];
      }
      
      // Handle date fields formatting for Excel
      if (header === 'birthDate' || header === 'clientBirthDate' || header === 'date') {
        if (value instanceof Date) {
          // Format date for Excel (YYYY-MM-DD)
          value = value.toISOString().split('T')[0];
        } else if (value && typeof value === 'string') {
          // Try to parse and format date string
          const dateValue = new Date(value);
          if (!isNaN(dateValue.getTime())) {
            value = dateValue.toISOString().split('T')[0];
          }
        }
      }
      
      // Handle animal count fields from nested objects
      if (value === undefined || value === '') {
        if (header === 'sheep' && row.herdCounts && row.herdCounts.sheep) {
          value = row.herdCounts.sheep.total || 0;
        } else if (header === 'sheepFemale' && row.herdCounts && row.herdCounts.sheep) {
          value = row.herdCounts.sheep.female || 0;
        } else if (header === 'sheepVaccinated' && row.herdCounts && row.herdCounts.sheep) {
          value = row.herdCounts.sheep.vaccinated || 0;
        } else if (header === 'goats' && row.herdCounts && row.herdCounts.goats) {
          value = row.herdCounts.goats.total || 0;
        } else if (header === 'goatsFemale' && row.herdCounts && row.herdCounts.goats) {
          value = row.herdCounts.goats.female || 0;
        } else if (header === 'goatsVaccinated' && row.herdCounts && row.herdCounts.goats) {
          value = row.herdCounts.goats.vaccinated || 0;
        } else if (header === 'camel' && row.herdCounts && row.herdCounts.camel) {
          value = row.herdCounts.camel.total || 0;
        } else if (header === 'camelFemale' && row.herdCounts && row.herdCounts.camel) {
          value = row.herdCounts.camel.female || 0;
        } else if (header === 'camelVaccinated' && row.herdCounts && row.herdCounts.camel) {
          value = row.herdCounts.camel.vaccinated || 0;
        } else if (header === 'cattle' && row.herdCounts && row.herdCounts.cattle) {
          value = row.herdCounts.cattle.total || 0;
        } else if (header === 'cattleFemale' && row.herdCounts && row.herdCounts.cattle) {
          value = row.herdCounts.cattle.female || 0;
        } else if (header === 'cattleVaccinated' && row.herdCounts && row.herdCounts.cattle) {
          value = row.herdCounts.cattle.vaccinated || 0;
        } else if (header === 'herdNumber' && row.herdCounts) {
          value = (row.herdCounts.sheep?.total || 0) + (row.herdCounts.goats?.total || 0) + (row.herdCounts.camel?.total || 0) + (row.herdCounts.cattle?.total || 0);
        } else if (header === 'herdFemales' && row.herdCounts) {
          value = (row.herdCounts.sheep?.female || 0) + (row.herdCounts.goats?.female || 0) + (row.herdCounts.camel?.female || 0) + (row.herdCounts.cattle?.female || 0);
        } else if (header === 'totalVaccinated' && row.herdCounts) {
          value = (row.herdCounts.sheep?.vaccinated || 0) + (row.herdCounts.goats?.vaccinated || 0) + (row.herdCounts.camel?.vaccinated || 0) + (row.herdCounts.cattle?.vaccinated || 0);
        }
        // Handle animalCounts for Mobile Clinic
        else if (header === 'sheep' && row.animalCounts && row.animalCounts.sheep) {
          value = row.animalCounts.sheep || 0;
        } else if (header === 'goats' && row.animalCounts && row.animalCounts.goats) {
          value = row.animalCounts.goats || 0;
        } else if (header === 'camel' && row.animalCounts && row.animalCounts.camel) {
          value = row.animalCounts.camel || 0;
        } else if (header === 'cattle' && row.animalCounts && row.animalCounts.cattle) {
          value = row.animalCounts.cattle || 0;
        } else if (header === 'horse' && row.animalCounts && row.animalCounts.horse) {
          value = row.animalCounts.horse || 0;
        }
        // Handle speciesCounts for Laboratory
        else if (header === 'sheep' && row.speciesCounts && row.speciesCounts.sheep) {
          value = row.speciesCounts.sheep || 0;
        } else if (header === 'goats' && row.speciesCounts && row.speciesCounts.goats) {
          value = row.speciesCounts.goats || 0;
        } else if (header === 'camel' && row.speciesCounts && row.speciesCounts.camel) {
          value = row.speciesCounts.camel || 0;
        } else if (header === 'cattle' && row.speciesCounts && row.speciesCounts.cattle) {
          value = row.speciesCounts.cattle || 0;
        } else if (header === 'horse' && row.speciesCounts && row.speciesCounts.horse) {
          value = row.speciesCounts.horse || 0;
        } else if (header === 'otherSpecies' && row.speciesCounts && row.speciesCounts.other) {
          value = row.speciesCounts.other || '';
        } else {
        }
      }
      
      // Handle nested objects (like client data)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.name) {
          value = value.name;
        } else if (value._id) {
          value = value._id.toString();
        } else if (header.includes('Counts') || header.includes('Herd') || header.includes('Animal')) {
          // Skip nested animal count objects - we now have separate fields
          value = '';
        } else {
          value = JSON.stringify(value);
        }
      }
      
      // Handle arrays
      if (Array.isArray(value)) {
        value = value.join(', ');
      }
      
      // Handle dates
      if (value instanceof Date) {
        value = value.toISOString().split('T')[0]; // YYYY-MM-DD format
      }
      
      // Handle boolean values
      if (typeof value === 'boolean') {
        value = value ? 'نعم' : 'لا';
      }
      
      // Handle null/undefined
      if (value === null || value === undefined) {
        value = '';
      }
      
      // Convert to string and clean up
      value = String(value).trim();
      
      // Use English header as key (same as template headers)
      processedRow[header] = value;

    });
    
    return processedRow;
  });

  logger.info('Processed data:', { data: processedData[0] });
  logger.info('Processed data keys:', { data: Object.keys(processedData[0]) });

  // Create worksheet with processed data
  const worksheet = XLSX.utils.json_to_sheet(processedData);
  
  // Set column widths for better readability
  const colWidths = headers.map(header => ({
    wch: Math.max(header.length, 15)
  }));
  worksheet['!cols'] = colWidths;
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  
  return XLSX.write(workbook, { 
    type: 'buffer', 
    bookType: 'xlsx',
    cellStyles: true,
    compression: true
  });
};

// Generic export handler with streaming for large datasets
const handleExport = (Model, filter = {}, fields = [], filename = 'export') => {
  return async (req, res) => {
    try {
      const { format = 'xlsx', limit = 1000 } = req.query; // Reduced limit for serverless
      
      // Set timeout for large exports
      res.setTimeout(60000); // 1 minute timeout for serverless
      
      // Apply additional filters from query
      const queryFilter = { ...filter };
      if (req.query.startDate && req.query.endDate) {
        queryFilter.date = {
          $gte: new Date(req.query.startDate),
          $lte: new Date(req.query.endDate)
        };
      }
      
      
      // Optimized query with lean() for better performance
      let query = Model.find(queryFilter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) || 1000)
        .lean(); // Use lean() for better performance
      
      // Try to populate client if the model has client field
      try {
        const sampleDoc = await Model.findOne(queryFilter).lean();
        if (sampleDoc && sampleDoc.client) {
          logger.info('Client field found adding populate');
          query = Model.find(queryFilter)
            .populate('client', 'name nationalId birthDate phone email village detailedAddress status totalAnimals')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit) || 1000)
            .lean();
        }
      } catch (populateError) {
        // Continue without populate if it fails
        logger.warn('Could not populate client field:', { data: populateError.message });
      }
      
      const records = await query;
      
      // Debug: Log first record structure if records exist
      if (records.length > 0) {
        logger.info('First record structure:', { data: Object.keys(records[0]) });
        logger.info('First record data:', { data: JSON.stringify(records[0], null, 2) });
        
        if (records[0].client) {
          logger.info('Client data structure:', { data: Object.keys(records[0].client) });
          logger.info('Client data:', { data: JSON.stringify(records[0].client, null, 2) });
        }
        
        // Check field mapping using validation function
        const validation = validateFieldMapping(records, fields);
        logger.info('Field mapping validation:', { data: validation });
        
        if (!validation.isValid) {
          logger.info('Field mapping issues:', { data: validation.message });
        } else {
          logger.info('All requested fields are available');
        }
      }

      // If no records found, still create a file with headers
      if (records.length === 0) {
        logger.info('No records found creating empty file with headers');
        if (format === 'csv') {
          const csvContent = generateCSV([], fields);
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
          res.send(csvContent);
        } else {
          const excelBuffer = generateExcel([], fields);
          res.setHeader('Content-Type', 'application/vnd.Ongoingxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
          res.send(excelBuffer);
        }
        return;
      }

      // Use English headers (same as template headers)
      if (format === 'csv') {
        const csvContent = generateCSV(records, fields);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
        res.send(csvContent);
      } else {
        // Default to Excel format
        const excelBuffer = generateExcel(records, fields);
        res.setHeader('Content-Type', 'application/vnd.Ongoingxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
        res.send(excelBuffer);
      }
    } catch (error) {
      logger.error('Export error:', { error: error });
      res.status(500).json({
        success: false,
        message: 'Error exporting data: ' + error.message
      });
    }
  };
};

// Generic template handler
const handleTemplate = (templateData, filename = 'template') => {
  return async (req, res) => {
    try {
      const fields = Object.keys(templateData[0]);
      const csvContent = generateCSV(templateData, fields);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
      res.send(csvContent);
    } catch (error) {
      logger.error('Template error:', { error: error });
      res.status(500).json({
        success: false,
        message: 'Error generating template: ' + error.message
      });
    }
  };
};

// Generic import handler with memory processing
const handleImport = (Model, processRowFunction) => {
  const uploadMiddleware = upload.single('file');
  
  return async (req, res) => {
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        logger.error('Upload middleware error:', { error: err });
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      
      if (!req.file) {
        logger.error('No file uploaded');
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }
      
      
      // Check if user is authenticated
      if (!req.user) {
        logger.error('User not authenticated');
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }
      
      // Process the import with the authenticated user using memory buffer
      await processImportFromMemory(req, res, req.file, req.user, Model, processRowFunction);
    });
  };
};

// Process import data from memory buffer (better for serverless)
const processImportFromMemory = async (req, res, file, user, Model, processRowFunction) => {
  const results = [];
  const errors = [];
  
  try {
    // Set timeout for imports
    res.setTimeout(60000); // 1 minute timeout for serverless
    
    
    // Parse file from memory buffer (CSV or Excel)
    const fileData = await parseFileData(file.buffer, file.originalname);
    
    if (!fileData || fileData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No data found in file or file is empty'
      });
    }
    
    // Light validation - let processing functions handle detailed validation
    const validationErrors = validateImportData(fileData, Model);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Data validation failed',
        errors: validationErrors
      });
    }
    
    
    // Add row numbers to results
    fileData.forEach((data, index) => {
      results.push({ ...data, rowNumber: index + 1 });
    });
    
    let successCount = 0;
    let errorCount = 0;
    const importedRecords = [];
    
    // Process rows in smaller batches for serverless
    const batchSize = 5; // Reduced batch size for serverless
    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (row) => {
        try {
          const record = await processRowFunction(row, user._id, errors);
          if (record) {
            importedRecords.push(record);
            return { success: true, record };
          }
          return { success: false, error: 'No record created' };
        } catch (error) {
          errors.push({
            row: row.rowNumber,
            field: 'processing',
            message: error.message
          });
          return { success: false, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Count results
      batchResults.forEach(result => {
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      });
      
    }
    
    res.json({
      success: errorCount === 0,
      totalRows: results.length,
      successRows: successCount,
      errorRows: errorCount,
      errors: errors,
      importedRecords: importedRecords
    });
    
  } catch (error) {
    logger.error('Import processing error:', { error: error });
    
    // Handle different types of errors
    let errorMessage = 'Error processing file: ' + error.message;
    if (error.code === 'ECONNABORTED') {
      errorMessage = 'Import timeout. Please try with a smaller file.';
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Import timeout. Please try with a smaller file.';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message
    });
  }
};

// Process import data (legacy method for disk storage)
const processImport = async (req, res, file, user, Model, processRowFunction) => {
  const results = [];
  const errors = [];
  
  try {
    // Set timeout for imports
    res.setTimeout(120000); // 2 minutes
    
    
    // Parse file (CSV or Excel)
    const fileData = await parseFileData(file.path, file.originalname);
    
    // Add row numbers to results
    fileData.forEach((data, index) => {
      results.push({ ...data, rowNumber: index + 1 });
    });
    
    let successCount = 0;
    let errorCount = 0;
    const importedRecords = [];
    
    // Process rows in batches for better performance
    const batchSize = 10;
    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (row) => {
        try {
          const record = await processRowFunction(row, user._id, errors);
          if (record) {
            importedRecords.push(record);
            return { success: true, record };
          }
          return { success: false, error: 'No record created' };
        } catch (error) {
          errors.push({
            row: row.rowNumber,
            field: 'processing',
            message: error.message
          });
          return { success: false, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Count results
      batchResults.forEach(result => {
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      });
      
    }
    
    // Clean up uploaded file
    fs.unlinkSync(file.path);
    
    res.json({
      success: errorCount === 0,
      totalRows: results.length,
      successRows: successCount,
      errorRows: errorCount,
      errors: errors,
      importedRecords: importedRecords
    });
    
  } catch (error) {
    logger.error('Import processing error:', { error: error });
    
    // Clean up uploaded file on error
    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    
    // Handle different types of errors
    let errorMessage = 'Error processing file: ' + error.message;
    if (error.code === 'ECONNABORTED') {
      errorMessage = 'Import timeout. Please try with a smaller file.';
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Import timeout. Please try with a smaller file.';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message
    });
  }
};

// Helper function to find or create client
const findOrCreateClient = async (row, userId) => {
  let client;
  
  // Check multiple possible field names for client data
  const clientName = row.clientName || row.client_name || row.Name || row.name;
  const clientId = row.clientNationalId || row.clientId || row.ID || row.id;
  const clientPhone = row.clientPhone || row.client_phone || row.Phone || row.phone;
  const clientVillage = row.clientVillage || row.client_village || row.Location || row.location;
  const clientAddress = row.clientAddress || row.client_address || row.Location || row.location;
  
  if (clientId) {
    client = await Client.findOne({ nationalId: clientId });
  }
  
  if (!client && clientName) {
    const nationalId = clientId || `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Check if client exists by name and phone (in case ID is different)
      const existingClientByNamePhone = await Client.findOne({
        name: clientName,
        phone: clientPhone
      });
      
      if (existingClientByNamePhone) {
        client = existingClientByNamePhone;
      } else {
        client = new Client({
          name: clientName,
          nationalId: nationalId,
          phone: clientPhone || '',
          village: clientVillage || '',
          detailedAddress: clientAddress || '',
          status: 'نشط',
          animals: [],
          availableServices: [],
          createdBy: userId,
          // Add metadata to track import source
          importSource: 'auto_import',
          importDate: new Date()
        });
        await client.save();
      }
    } catch (error) {
      throw new Error(`Failed to create client: ${error.message}`);
    }
  }
  
  if (!client) {
    throw new Error('Client not found and could not be created - missing required client information');
  }
  
  return client;
};

// Safe JSON parsing function
const parseJsonField = (value, defaultValue = []) => {
  if (!value || value.toString().trim() === '') {
    return defaultValue;
  }
  
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : defaultValue;
  } catch (error) {
    logger.warn('Failed to parse JSON field:', { data: error.message });
    return defaultValue;
  }
};

// Enhanced date parsing function to handle multiple date formats
// ========================================
// UNIFIED IMPORT HELPERS
// ========================================

/**
 * Unified client data processor
 * Handles client creation/retrieval with consistent validation
 */
const processUnifiedClient = async (row, userId) => {
  try {
    // Get client name from row data (multiple possible field names)
    const clientName = row['Name'] || row['name'] || row['clientName'] || 
                      row['اسم العميل'] || row['الاسم'] || row['اسم المربي'] || 
                      row['اسم العميل'] || row['الاسم'] || 'غير محدد';
    
    // Get client ID
    const clientId = row['ID'] || row['id'] || row['clientId'] || 
                     row['رقم الهوية'] || row['الهوية'];
    
    // Find existing client
    let client = null;
    
    if (clientId) {
      client = await Client.findOne({ nationalId: clientId });
    }
    
    if (!client && clientName && clientName !== 'غير محدد') {
      client = await Client.findOne({ name: clientName });
    }
    
    // If no client found, create and save a new client
    if (!client) {
      const newClient = new Client({
        name: clientName,
        nationalId: (() => {
          // Generate a valid nationalId if not provided or invalid
          if (clientId && clientId.length >= 10 && clientId.length <= 14 && /^\d+$/.test(clientId)) {
            return clientId;
          }
          // Generate a valid 10-digit nationalId
          const timestamp = Date.now().toString().slice(-8); // Last 8 digits
          const random = Math.floor(Math.random() * 100).toString().padStart(2, '0'); // 2 random digits
          return `${timestamp}${random}`; // 10 digits total
        })(),
        phone: (() => {
          const phoneValue = row['Phone'] || row['phone'] || row['clientPhone'] || 
                          row['رقم الهاتف'] || row['الهاتف'] || '';
          // If no phone provided, generate a default one
          if (!phoneValue || phoneValue.trim() === '') {
            const timestamp = Date.now().toString().slice(-8);
            return `5${timestamp}`; // Start with 5 and add 8 digits
          }
          return phoneValue;
        })(),
        village: row['Location'] || row['location'] || row['clientVillage'] || 
                 row['القرية'] || row['الموقع'] || '',
        detailedAddress: row['Address'] || row['address'] || row['clientAddress'] || 
                        row['العنوان'] || row['العنوان التفصيلي'] || '',
        birthDate: (() => {
          const birthDateField = row['Birth Date'] || row['Date of Birth'] || 
                                row['birthDate'] || row['تاريخ الميلاد'];
          if (birthDateField) {
            const parsedDate = parseDateField(birthDateField);
            // Check if date is valid
            if (parsedDate && !isNaN(parsedDate.getTime())) {
              return parsedDate;
            }
            return undefined; // Don't set birthDate if invalid or in future
          }
          return undefined;
        })(),
        status: 'نشط',
        animals: [],
        availableServices: [],
        createdBy: userId
      });
      
      await newClient.save();
      client = newClient;
    }
    
    return client;
  } catch (error) {
    throw new Error(`Error processing unified client: ${error.message}`);
  }
};

/**
 * Unified date processor
 * Handles all date fields consistently
 */
const processUnifiedDates = (row) => {
  // Find and validate date using enhanced date field finder
  const dateField = findDateField(row);
  let dateValue = null;
  
  if (dateField) {
    dateValue = parseDateField(dateField.value);
    
    if (!dateValue || isNaN(dateValue.getTime())) {
      dateValue = new Date(); // Use current date as fallback
    }
  } else {
    dateValue = new Date(); // Use current date as fallback
  }
  
  return {
    mainDate: dateValue,
    requestDate: (() => {
      const requestDateField = row['Request Date'] || row.requestDate || row.date;
      if (requestDateField) {
        const parsedDate = parseDateField(requestDateField);
        return parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : dateValue;
      }
      return dateValue;
    })(),
    fulfillingDate: (() => {
      const fulfillingDateField = row['Request Fulfilling Date'];
      if (fulfillingDateField) {
        const parsedDate = parseDateField(fulfillingDateField);
        return parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : undefined;
      }
      return undefined;
    })(),
    followUpDate: (() => {
      if (row.followUpDate) {
        const parsedDate = parseDateField(row.followUpDate);
        return parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : undefined;
      }
      return undefined;
    })()
  };
};

/**
 * Unified coordinates processor
 * Handles coordinates consistently
 */
const processUnifiedCoordinates = (row) => {
  return {
    latitude: parseFloat(row['N'] || row['N Coordinate'] || row.latitude || 0),
    longitude: parseFloat(row['E'] || row['E Coordinate'] || row.longitude || 0)
  };
};

/**
 * Unified animal counts processor
 * Handles animal counts consistently
 */
const processUnifiedAnimalCounts = (row) => {
  return {
    sheep: parseInt(row['Sheep'] || row.sheep || 0),
    goats: parseInt(row['Goats'] || row.goats || 0),
    camel: parseInt(row['Camel'] || row.camel || 0),
    cattle: parseInt(row['Cattle'] || row.cattle || 0),
    horse: parseInt(row['Horse'] || row.horse || 0)
  };
};

/**
 * Unified enum processor
 * Handles enum values consistently
 */
const processUnifiedEnums = (row) => {
  const categoriesResult = extractInterventionCategories(row, [
    'Intervention Categories', 'interventionCategories', 'Categories', 'categories',
    'Intervention Category', 'interventionCategory', 'intervention_category', 'فئة التدخل'
  ]);

  return {
    interventionCategory: categoriesResult.primary,
    interventionCategories: categoriesResult.all,
    requestSituation: (() => {
      const status = (row['Request Status'] || row.requestStatus || 'Ongoing').toString().trim();
      const statusMap = {
        'Ongoing': 'Ongoing', 'مفتوح': 'Ongoing', 'نشط': 'Ongoing', 'active': 'Ongoing',
        'closed': 'Closed', 'مغلق': 'Closed', 'منتهي': 'Closed', 'finished': 'Closed',
        'pending': 'Pending', 'في الانتظار': 'Pending', 'معلق': 'Pending', 'waiting': 'Pending'
      };
      
      const lowerStatus = status.toLowerCase();
      if (statusMap[lowerStatus]) {
        return statusMap[lowerStatus];
      }
      
      if (['Ongoing', 'Closed', 'Pending'].includes(status)) {
        return status;
      }
      
      return 'Ongoing';
    })()
  };
};

/**
 * Unified custom data processor
 * Stores all additional data consistently
 */
const processUnifiedCustomData = (row) => {
  return {
    originalData: row,
    holdingCode: row['Holding Code'] || row.holdingCode || '',
    birthDate: row['Birth Date'] || row['Date of Birth'] || row.birthDate || '',
    ...Object.keys(row).reduce((acc, key) => {
      if (!['Serial No', 'Date', 'Name', 'ID', 'Phone', 'Location', 'N Coordinate', 'E Coordinate', 
            'Supervisor', 'Vehicle No.', 'Sheep', 'Goats', 'Camel', 'Horse', 'Cattle', 
            'Diagnosis', 'Intervention Category', 'Treatment', 'Request Date', 'Request Status', 
            'Request Fulfilling Date', 'category', 'Remarks' ,'Holding Code'].includes(key)) {
        acc[key] = row[key];
      }
      return acc;
    }, {})
  };
};

// ========================================
// EXISTING FUNCTIONS
// ========================================

/**
 * Convert Arabic numerals to English numerals
 * Supports both Arabic-Indic (٠-٩) and Persian (۰-۹) numerals
 */
const convertArabicNumeralsToEnglish = (str) => {
  if (!str) return str;
  
  return str.replace(/[٠-٩۰-۹]/g, (match) => {
    // Arabic-Indic numerals (٠-٩)
    if (match >= '٠' && match <= '٩') {
      return String.fromCharCode(match.charCodeAt(0) - '٠'.charCodeAt(0) + '0'.charCodeAt(0));
    }
    // Persian numerals (۰-۹)
    if (match >= '۰' && match <= '۹') {
      return String.fromCharCode(match.charCodeAt(0) - '۰'.charCodeAt(0) + '0'.charCodeAt(0));
    }
    return match;
  });
};

/**
 * Enhanced date parsing function that supports all requested formats:
 * - MM/DD/YY, MM/DD/YYYY, DD/MM/YYYY
 * - MM-DD-YY, DD-MM-YY, MM-DD-YYYY, DD-MM-YYYY
 * - MM.DD.YY, DD.MM.YY, MM.DD.YYYY, DD.MM.YYYY
 * - YYYY-MM-DD (ISO format)
 * - Excel Serial Numbers
 * - Arabic Numerals (automatic conversion)
 */
const parseDateField = (dateString) => {
  if (!dateString || dateString.toString().trim() === '') {
    return null;
  }
  
  let dateStr = dateString.toString().trim();
  
  // Skip text values that are clearly not dates
  const textValues = [
    'not-comply', 'not comply', 'comply', 'partially comply', 'parially comply',
    'healthy', 'sick', 'sporadic cases', 'sporadic-cases',
    'sprayed', 'not sprayed', 'not avialable', 'not available',
    'ongoing', 'closed', 'pending',
    'parasite control activity', 'activity'
  ];
  
  if (textValues.some(text => dateStr.toLowerCase().includes(text.toLowerCase()))) {
    return null;
  }

  // Convert Arabic numerals to English numerals for all formats
  dateStr = convertArabicNumeralsToEnglish(dateStr);

  // Helper function to convert 2-digit year to 4-digit year
  const expandYear = (year) => {
    const yearNum = parseInt(year);
    if (yearNum < 50) {
      return 2000 + yearNum; // 00-49 -> 2000-2049
    } else if (yearNum < 100) {
      return 1900 + yearNum; // 50-99 -> 1950-1999
    }
    return yearNum; // Already 4 digits
  };
  
  // Handle Excel serial date numbers (Excel stores dates as numbers)
  if (!isNaN(dateStr) && parseFloat(dateStr) > 0) {
    const excelDate = parseFloat(dateStr);
    
    // Excel date serial number (days since 1900-01-01, but Excel incorrectly treats 1900 as leap year)
    // Valid Excel dates are typically between 1 (1900-01-01) and ~100000 (2173-10-14)
    if (excelDate >= 1 && excelDate <= 100000) {
      // Excel's epoch starts at 1900-01-01, but JavaScript Date starts at 1970-01-01
      // Excel serial date 25569 = 1970-01-01
      let jsDate;
      
      if (excelDate < 60) {
        // Handle dates before March 1, 1900 (Excel's leap year bug)
        // Excel incorrectly treats 1900 as a leap year
        jsDate = new Date(1900, 0, excelDate);
      } else {
        // For dates after Feb 29, 1900 (which doesn't exist), subtract 1 day
        jsDate = new Date((excelDate - 25569 - 1) * 86400 * 1000);
      }
      
      // Validate the resulting date is reasonable (between 1900 and 2100)
      if (jsDate.getFullYear() >= 1900 && jsDate.getFullYear() <= 2100) {
        return jsDate;
      }
    }
  }
  
  // Handle D-Mon format (1-Sep, 2-Sep, etc.)
  if (dateStr.match(/^\d{1,2}-[A-Za-z]{3}$/)) {
    const currentYear = new Date().getFullYear();
    const monthMap = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
      'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
      'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };
    const [day, month] = dateStr.split('-');
    const monthNum = monthMap[month];
    if (monthNum) {
      const fullDate = `${currentYear}-${monthNum}-${day.padStart(2, '0')}`;
      const dateValue = new Date(fullDate);
      return dateValue;
    }
  }
  
  // Smart date format detection helper
  const smartDetectDateFormat = (first, second, separator) => {
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);
    
    // Clear indicators
    if (firstNum > 12 && secondNum <= 12) {
      return 'DD' + separator + 'MM'; // Day first
    } else if (secondNum > 12 && firstNum <= 12) {
      return 'MM' + separator + 'DD'; // Month first
    } else if (firstNum > 31 || secondNum > 31) {
      return null; // Invalid date
    } else {
      // Ambiguous case - use separator-based heuristics
      if (separator === '.') {
        return 'DD.MM'; // European standard for dots
      } else if (separator === '/') {
        return 'MM/DD'; // American standard for slashes
      } else if (separator === '-') {
        return 'MM-DD'; // American standard for dashes
      }
    }
    return 'MM' + separator + 'DD'; // Default fallback
  };

  // Handle MM/DD/YY and DD/MM/YY formats (2-digit year with slashes)
  if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{2}$/)) {
    const [first, second, year] = dateStr.split('/');
    const fullYear = expandYear(year);
    const format = smartDetectDateFormat(first, second, '/');
    
    if (format === 'DD/MM') {
      const dateValue = new Date(`${fullYear}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`);
      return dateValue;
    } else {
      const dateValue = new Date(`${fullYear}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`);
      return dateValue;
    }
  }

  // Handle MM/DD/YYYY and DD/MM/YYYY formats (4-digit year with slashes)
  if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const [first, second, year] = dateStr.split('/');
    const format = smartDetectDateFormat(first, second, '/');
    
    if (format === 'DD/MM') {
      const dateValue = new Date(`${year}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`);
      return dateValue;
    } else {
      const dateValue = new Date(`${year}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`);
      return dateValue;
    }
  }
  
  // Handle YYYY/MM/DD format (like 1985/03/15)
  if (dateStr.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
    const [year, month, day] = dateStr.split('/');
    const dateValue = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    return dateValue;
  }
  
  // Handle MM-DD-YY and DD-MM-YY formats (2-digit year with dashes)
  if (dateStr.match(/^\d{1,2}-\d{1,2}-\d{2}$/)) {
    const [first, second, year] = dateStr.split('-');
    const fullYear = expandYear(year);
    const format = smartDetectDateFormat(first, second, '-');
    
    if (format === 'DD-MM') {
      const dateValue = new Date(`${fullYear}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`);
      return dateValue;
    } else {
      const dateValue = new Date(`${fullYear}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`);
      return dateValue;
    }
  }

  // Handle MM-DD-YYYY and DD-MM-YYYY formats (4-digit year with dashes)
  if (dateStr.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
    const [first, second, year] = dateStr.split('-');
    const format = smartDetectDateFormat(first, second, '-');
    
    if (format === 'DD-MM') {
      const dateValue = new Date(`${year}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`);
      return dateValue;
    } else {
      const dateValue = new Date(`${year}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`);
      return dateValue;
    }
  }

  // Handle YYYY-MM-DD format (ISO format)
  if (dateStr.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
    const dateValue = new Date(dateStr);
    return dateValue;
  }

  // Handle MM.DD.YY and DD.MM.YY formats (2-digit year with dots)
  if (dateStr.match(/^\d{1,2}\.\d{1,2}\.\d{2}$/)) {
    const [first, second, year] = dateStr.split('.');
    const fullYear = expandYear(year);
    const format = smartDetectDateFormat(first, second, '.');
    
    if (format === 'DD.MM') {
      const dateValue = new Date(`${fullYear}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`);
      return dateValue;
    } else {
      const dateValue = new Date(`${fullYear}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`);
      return dateValue;
    }
  }

  // Handle MM.DD.YYYY and DD.MM.YYYY formats (4-digit year with dots)
  if (dateStr.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
    const [first, second, year] = dateStr.split('.');
    const format = smartDetectDateFormat(first, second, '.');
    
    if (format === 'DD.MM') {
      const dateValue = new Date(`${year}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`);
      return dateValue;
    } else {
      const dateValue = new Date(`${year}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`);
      return dateValue;
    }
  }
  

  // Handle formats with dashes that weren't caught above (fallback)
  if (dateStr.includes('-') && dateStr.match(/^\d{1,2}-\d{1,2}-\d{2,4}$/)) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [first, second, year] = parts;
      const fullYear = year.length === 2 ? expandYear(year) : parseInt(year);
      const firstNum = parseInt(first);
      const secondNum = parseInt(second);
      
      if (firstNum > 12 && secondNum <= 12) {
        // DD-MM format
        const dateValue = new Date(`${fullYear}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`);
        return dateValue;
      } else {
        // MM-DD format (default)
        const dateValue = new Date(`${fullYear}-${first.padStart(2, '0')}-${second.padStart(2, '0')}`);
        return dateValue;
      }
    }
  }

  // Handle formats with dots that weren't caught above (fallback)
  if (dateStr.includes('.') && dateStr.match(/^\d{1,2}\.\d{1,2}\.\d{2,4}$/)) {
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      const [first, second, year] = parts;
      const fullYear = year.length === 2 ? expandYear(year) : parseInt(year);
      const firstNum = parseInt(first);
      const secondNum = parseInt(second);
      
      if (firstNum > 12 && secondNum <= 12) {
        // DD.MM format (European standard for dots)
        const dateValue = new Date(`${fullYear}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`);
        return dateValue;
      } else {
        // Default to DD.MM for dots (European standard)
        const dateValue = new Date(`${fullYear}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`);
        return dateValue;
      }
    }
  }
  
  // Try to parse as standard date (last resort)
  const dateValue = new Date(dateStr);
  
  // Return null if the date is invalid
  if (isNaN(dateValue.getTime())) {
    return null;
  }
  
  return dateValue;
};

// Helper function to find date field in row data
const findDateField = (row) => {
  const dateFields = [
    'date', 'Date', 'DATE', 
    'تاريخ', 'التاريخ',
    'Request Date', 'requestDate', 'request_date',
    'Birth Date', 'birthDate', 'birth_date', 'Date of Birth', 'dateOfBirth',
    'Request Fulfilling Date', 'requestFulfillingDate', 'request_fulfilling_date'
  ];
  
  for (const field of dateFields) {
    if (row[field] && row[field].toString().trim() !== '') {
      return { field, value: row[field] };
    }
  }
  
  return null;
};

// ========================================
// REFACTORED PROCESS ROW FUNCTIONS
// ========================================

/**
 * Process Vaccination row using unified helpers
 */
const processVaccinationRow = async (row, userId, errors) => {
  try {
    // Use unified processors
    const client = await processUnifiedClientEnhanced(row, userId);
    const dates = processUnifiedDatesEnhanced(row);
    const coordinates = processUnifiedCoordinatesEnhanced(row);
    const herdCounts = processHerdCounts(row, 'vaccination');
    
    // Create vaccination record
    const vaccination = new Vaccination({
      serialNo: await generateSerialNo(row, 'VAC', Vaccination),
      date: dates.mainDate,
      client: client._id,
      farmLocation: getFieldValue(row, [
        'Location', 'location', 'Farm Location', 'farmLocation',
        'الموقع', 'موقع المزرعة'
      ]) || 'N/A',
      supervisor: getFieldValue(row, [
        'Supervisor', 'supervisor', 'المشرف'
      ]) || 'Default Supervisor',
      team: getFieldValue(row, [
        'Team', 'team', 'الفريق'
      ]) || 'Default Team',
      vehicleNo: getFieldValue(row, [
        'Vehicle No.', 'Vehicle No', 'vehicleNo', 'vehicle_no',
        'رقم المركبة'
      ]) || 'N/A',
      vaccineType: getFieldValue(row, [
        'Vaccine', 'vaccineType', 'vaccine_type', 'Vaccine Type',
        'نوع اللقاح', 'اللقاح'
      ]) || 'Default Vaccine',
      vaccineCategory: processEnumValue(
        row,
        ['Category', 'vaccineCategory', 'vaccine_category', 'فئة اللقاح'],
        {
          'emergency': 'Emergency', 'urgent': 'Emergency', 'عاجل': 'Emergency',
          'preventive': 'Preventive', 'وقائي': 'Preventive', 'prevention': 'Preventive'
        },
        'Preventive'
      ),
      coordinates: coordinates,
      herdCounts: herdCounts,
      herdHealth: processEnumValue(
        row,
        ['Herd Health', 'herdHealth', 'herd_health', 'صحة القطيع'],
        {
          'healthy': 'Healthy', 'صحي': 'Healthy', 'سليم': 'Healthy',
          'sick': 'Sick', 'مريض': 'Sick', 'sporadic': 'Sick',
          'under treatment': 'Under Treatment', 'تحت العلاج': 'Under Treatment'
        },
        'Healthy'
      ),
      animalsHandling: processEnumValue(
        row,
        ['Animals Handling', 'animalsHandling', 'animals_handling', 'التعامل مع الحيوانات'],
        {
          'easy': 'Easy', 'سهل': 'Easy',
          'difficult': 'Difficult', 'صعب': 'Difficult', 'hard': 'Difficult'
        },
        'Easy'
      ),
      labours: processEnumValue(
        row,
        ['Labours', 'labours', 'العمالة'],
        {
          'available': 'Available', 'متوفر': 'Available',
          'not available': 'Not Available', 'غير متوفر': 'Not Available',
          'unavailable': 'Not Available', 'avaialable': 'Not Available' , 'not helpful': 'Not Helpful'
        },
        'Available'
      ),
      reachableLocation: processEnumValue(
        row,
        ['Reachable Location', 'reachableLocation', 'reachable_location', 'سهولة الوصول'],
        {
          'easy': 'Easy', 'سهل': 'Easy',
          'hard to reach': 'Hard to reach', 'صعب الوصول': 'Hard to reach',
          'difficult': 'Hard to reach', 'hard': 'Hard to reach'
        },
        'Easy'
      ),
      holdingCode: await processHoldingCodeReference(row, userId),
      request: processRequest(row, dates),
      remarks: getFieldValue(row, ['Remarks', 'remarks', 'ملاحظات']) || '',
      customImportData: processCustomImportData(row)
    });

    await vaccination.save();
    return vaccination;
  } catch (error) {
    throw new Error(`Error processing vaccination row: ${error.message}`);
  }
};

/**
 * Process ParasiteControl row using unified helpers
 */
const processParasiteControlRow = async (row, userId, errors) => {
  try {
    // Use unified processors
    const client = await processUnifiedClientEnhanced(row, userId);
    const dates = processUnifiedDatesEnhanced(row);
    const coordinates = processUnifiedCoordinatesEnhanced(row);
    const herdCounts = processHerdCounts(row, 'parasite');
    
    // Create parasite control record
    const parasiteControl = new ParasiteControl({
      serialNo: await generateSerialNo(row, 'PAR', ParasiteControl),
      date: dates.mainDate,
      client: client._id,
      herdLocation: (() => {
        const locationValue = getFieldValue(row, [
          'Herd Location', 'herdLocation', 'Location', 'location',
          'موقع القطيع', 'الموقع'
        ]);
        
        if (locationValue && locationValue !== '' && locationValue !== 'N/A' && locationValue !== 'null' && locationValue !== 'undefined') {
          return locationValue.toString().trim();
        }
        
        return ''; // Return empty string instead of 'N/A'
      })(),
      supervisor: (() => {
        const supervisorValue = getFieldValue(row, [
          'Supervisor', 'supervisor', 'المشرف'
        ]);
        
        if (supervisorValue && supervisorValue !== '' && supervisorValue !== 'N/A' && supervisorValue !== 'null' && supervisorValue !== 'undefined') {
          return supervisorValue.toString().trim();
        }
        
        return 'غير محدد'; // Return meaningful default in Arabic
      })(),
      vehicleNo: (() => {
        const vehicleValue = getFieldValue(row, [
          'Vehicle No.', 'Vehicle No', 'vehicleNo', 'vehicle_no',
          'رقم المركبة'
        ]);
        
        if (vehicleValue && vehicleValue !== '' && vehicleValue !== 'N/A' && vehicleValue !== 'null' && vehicleValue !== 'undefined') {
          return vehicleValue.toString().trim();
        }
        
        return 'غير محدد'; // Return meaningful default in Arabic
      })(),
      coordinates: coordinates,
      herdCounts: herdCounts,
      insecticide: (() => {
        // First try to get insecticide as JSON string
        const insecticideJson = getFieldValue(row, ['insecticide', 'Insecticide']);
        if (insecticideJson) {
          try {
            const parsed = JSON.parse(insecticideJson);
            return {
              type: parsed.type || 'N/A',
              method: parsed.method || 'N/A',
              volumeMl: parseInt(parsed.volumeMl || 0),
              status: parsed.status || 'Sprayed',
              category: parsed.category || 'N/A'
            };
          } catch (error) {
            logger.info('Failed to parse insecticide JSON using individual fields');
          }
        }
        
        // Fallback to individual fields
        return {
          type: (() => {
            const typeValue = getFieldValue(row, [
              'Type', 'Insecticide Type', 'insecticideType', 'insecticide_type',
              'نوع المبيد', 'المبيد المستخدم'
            ]);
            
            // Only use real data, avoid default values when actual data exists
            if (typeValue && typeValue !== '' && typeValue !== 'N/A' && typeValue !== 'null' && typeValue !== 'undefined') {
              return typeValue.toString().trim();
            }
            
            // Try to infer from other fields before throwing error
            const methodValue = getFieldValue(row, [
              'Method', 'Insecticide Method', 'insecticideMethod', 'insecticide_method',
              'Application Method', 'applicationMethod', 'application_method',
              'طريقة الرش', 'طريقة التطبيق', 'الطريقة'
            ]);
            
            const categoryValue = getFieldValue(row, [
              'Category', 'Insecticide Category', 'insecticideCategory', 'insecticide_category',
              'فئة المبيد'
            ]);
            
            // Try to infer type from method or category
            if (methodValue) {
              const methodLower = methodValue.toString().toLowerCase();
              if (methodLower.includes('pour')) return 'Pour-on Insecticide';
              if (methodLower.includes('spray')) return 'Spray Insecticide';
              if (methodLower.includes('oral') || methodLower.includes('drench')) return 'Oral Insecticide';
            }
            
            if (categoryValue) {
              const categoryLower = categoryValue.toString().toLowerCase();
              if (categoryLower.includes('pour')) return 'Pour-on Insecticide';
              if (categoryLower.includes('spray')) return 'Spray Insecticide';
              if (categoryLower.includes('oral')) return 'Oral Insecticide';
            }
            
            // If no type found, this will cause validation error which is better than fake data
            throw new Error('نوع المبيد مطلوب ولم يتم العثور عليه في البيانات');
          })(),
          method: (() => {
            // Try to get method from various fields
            let method = getFieldValue(row, [
              'Method', 'Insecticide Method', 'insecticideMethod', 'insecticide_method',
              'Application Method', 'applicationMethod', 'application_method',
              'طريقة الرش', 'طريقة التطبيق', 'الطريقة'
            ]);
            
            // Convert null/undefined to empty string for consistent handling
            if (method === null || method === undefined) {
              method = '';
            }
            
            if (!method || method === '' || method === 'N/A' || method === 'null' || method === 'undefined') {
              // Fallback to category if method not found
              const category = getFieldValue(row, [
                'Category', 'Insecticide Category', 'insecticideCategory', 'insecticide_category',
                'فئة المبيد'
              ]);
              
              // Map common categories to methods (only allowed values)
              if (category && category !== '' && category !== 'N/A') {
                const categoryLower = category.toLowerCase().trim();
                if (categoryLower.includes('pour') || categoryLower.includes('صب')) method = 'Pour on';
                else if (categoryLower.includes('spray') || categoryLower.includes('رش')) method = 'Spraying';
                else if (categoryLower.includes('oral') && categoryLower.includes('drench')) method = 'Oral Drenching';
                else if (categoryLower.includes('oral') || categoryLower.includes('فموي')) method = 'Oral Drenching';
                else method = 'Pour on'; // Default to Pour on
              } else {
                // If no category, try to infer from type
                const type = getFieldValue(row, [
                  'Type', 'Insecticide Type', 'insecticideType', 'insecticide_type',
                  'نوع المبيد', 'المبيد المستخدم'
                ]);
                
                if (type && type !== '' && type !== 'N/A') {
                  const typeLower = type.toLowerCase().trim();
                  if (typeLower.includes('pour') || typeLower.includes('صب')) method = 'Pour on';
                  else if (typeLower.includes('spray') || typeLower.includes('رش')) method = 'Spraying';
                  else if (typeLower.includes('oral') || typeLower.includes('فموي')) method = 'Oral Drenching';
                  else method = 'Pour on'; // Default to Pour on
                } else {
                  method = 'Pour on'; // Default fallback
                }
              }
            }
            
            // Ensure we have a method value, default to 'Pour on' if not
            if (!method) {
              method = 'Pour on';
            }
            
            // Clean and normalize method value (only allowed values)
            method = method.toString().trim().replace(/\s+/g, ' '); // Replace multiple spaces with single space
            
            // Handle common variations and typos - map to allowed values only
            const methodLower = method.toLowerCase().replace(/[^\w\s\u0600-\u06FF]/g, ''); // Remove special chars except Arabic
            
            // Exact matches first
            if (methodLower === 'pour on' || methodLower === 'pouron' || methodLower === 'pour-on') {
              method = 'Pour on';
            } else if (methodLower === 'spraying' || methodLower === 'spray') {
              method = 'Spraying';
            } else if (methodLower === 'oral drenching' || methodLower === 'oraldrenching') {
              method = 'Oral Drenching';
            }
            // Partial matches
            else if (methodLower.includes('pour') || methodLower.includes('صب')) {
              method = 'Pour on';
            } else if (methodLower.includes('spray') || methodLower.includes('رش')) {
              method = 'Spraying';
            } else if (methodLower.includes('oral') || methodLower.includes('drench') || methodLower.includes('فموي')) {
              method = 'Oral Drenching';
            } 
            // Legacy/unsupported methods
            else if (methodLower === 'other' || methodLower === 'dipping' || methodLower === 'injection' || 
                     methodLower === 'dip' || methodLower === 'inject' || methodLower === 'oral') {
              method = 'Pour on'; // Default for unsupported methods
            } else {
              // For any unrecognized method, default to Pour on
              method = 'Pour on';
            }
            
            // Validate method against allowed values (updated list)
            const validMethods = ['Pour on', 'Spraying', 'Oral Drenching'];
            
            // Log for debugging if method is not valid
            if (!validMethods.includes(method)) {
              logger.warn(`Invalid method found in row: "${method}". Converting to "Pour on". Original method value:`, {
                originalMethod: getFieldValue(row, [
                  'Method', 'Insecticide Method', 'insecticideMethod', 'insecticide_method',
                  'Application Method', 'applicationMethod', 'application_method',
                  'طريقة الرش', 'طريقة التطبيق', 'الطريقة'
                ]),
                processedMethod: method,
                rowData: row
              });
            }
            
            // Final validation - ensure we always return a valid method
            const finalMethod = validMethods.includes(method) ? method : 'Pour on';
            
            // Double check that finalMethod is not null/undefined
            return finalMethod || 'Pour on';
          })(),
          volumeMl: (() => {
            const volumeValue = getFieldValue(row, [
              'Volume (ml)', 'Volume', 'Insecticide Volume (ml)', 'insecticideVolume', 'insecticide_volume',
              'الحجم (مل)', 'الحجم'
            ]);
            
            if (!volumeValue || volumeValue === '' || volumeValue === 'N/A' || volumeValue === 'null' || volumeValue === 'undefined') {
              return 0;
            }
            
            const parsed = parseFloat(volumeValue);
            return isNaN(parsed) ? 0 : Math.max(0, Math.min(50000, parsed));
          })(),
          status: (() => {
            const statusValue = getFieldValue(row, [
              'Status', 'Insecticide Status', 'insecticideStatus', 'insecticide_status', 'حالة الرش'
            ]);
            
            if (!statusValue) return 'Not Sprayed';
            
            const statusLower = statusValue.toString().toLowerCase().trim();
            
            // Handle all variations
            if (statusLower.includes('spray') && !statusLower.includes('not')) return 'Sprayed';
            if (statusLower === 'yes' || statusLower === 'نعم' || statusLower === 'مرشوش') return 'Sprayed';
            if (statusLower.includes('not') || statusLower === 'no' || statusLower === 'لا') return 'Not Sprayed';
            if (statusLower.includes('avialable') || statusLower.includes('available')) return 'Not Sprayed';
            if (statusLower.includes('partial')) return 'Partially Sprayed';
            
            return 'Not Sprayed'; // Default
          })(),
          category: (() => {
            // Get category from various fields
            let category = getFieldValue(row, [
              'Category', 'Insecticide Category', 'insecticideCategory', 'insecticide_category',
              'فئة المبيد'
            ]);
            
            if (category && category !== '' && category !== 'N/A' && category !== 'null' && category !== 'undefined') {
              category = category.toString().trim();
              
              // Normalize common category variations
              const categoryLower = category.toLowerCase();
              
              // Map common variations to standard categories
              if (categoryLower.includes('pour') && categoryLower.includes('on')) {
                return 'Pour-on';
              } else if (categoryLower.includes('pour') || categoryLower.includes('صب')) {
                return 'Pour-on';
              } else if (categoryLower.includes('spray') || categoryLower.includes('رش')) {
                return 'Spraying';
              } else if (categoryLower.includes('oral') && categoryLower.includes('drench')) {
                return 'Oral Drenching';
              } else if (categoryLower.includes('oral') || categoryLower.includes('فموي')) {
                return 'Oral';
              } else if (categoryLower.includes('dip') || categoryLower.includes('غمس')) {
                return 'Dipping';
              } else if (categoryLower.includes('inject') || categoryLower.includes('حقن')) {
                return 'Injection';
              } else if (categoryLower.includes('parasite') && categoryLower.includes('control')) {
                return 'Parasite Control Activity';
              } else {
                // Return the original category if it doesn't match common patterns
                return category;
              }
            }
            
            // Fallback to type if category not found
            const type = getFieldValue(row, [
              'Type', 'Insecticide Type', 'insecticideType', 'insecticide_type',
              'نوع المبيد', 'المبيد المستخدم'
            ]);
            
            if (type && type !== '' && type !== 'N/A' && type !== 'null' && type !== 'undefined') {
              const typeLower = type.toLowerCase();
              
              // Infer category from type
              if (typeLower.includes('pour')) {
                return 'Pour-on';
              } else if (typeLower.includes('spray')) {
                return 'Spraying';
              } else if (typeLower.includes('oral')) {
                return 'Oral';
              } else {
                return type.toString().trim();
              }
            }
            
            // Fallback to method-based category (updated for new methods)
            const method = getFieldValue(row, [
              'Method', 'Insecticide Method', 'insecticideMethod', 'insecticide_method',
              'Application Method', 'applicationMethod', 'application_method',
              'طريقة الرش', 'طريقة التطبيق', 'الطريقة'
            ]);
            
            if (method && method !== '' && method !== 'N/A' && method !== 'null' && method !== 'undefined') {
              const methodLower = method.toLowerCase().trim();
              
              if (methodLower === 'pour on' || methodLower === 'pour-on') {
                return 'Pour-on';
              } else if (methodLower === 'spraying' || methodLower === 'spray') {
                return 'Spraying';
              } else if (methodLower.includes('oral') && methodLower.includes('drench')) {
                return 'Oral Drenching';
              } else if (methodLower === 'oral' || methodLower.includes('oral')) {
                return 'Oral Drenching';
              } else {
                return 'Pour-on'; // Default to Pour-on for unsupported methods
              }
            }
            
            // If no category found, use a default that makes sense
            return 'Parasite Control Activity';
          })(),
          // Extract concentration from type if available
          concentration: (() => {
            const type = getFieldValue(row, [
              'Type', 'Insecticide Type', 'insecticideType', 'insecticide_type',
              'نوع المبيد', 'المبيد المستخدم'
            ]);
            
            if (type) {
              // Extract percentage from type name (e.g., "Ultra-Pour 1%" -> "1%")
              const match = type.match(/(\d+(?:\.\d+)?%)/);
              return match ? match[1] : '';
            }
            return '';
          })(),
          manufacturer: getFieldValue(row, [
            'Manufacturer', 'manufacturer', 'الشركة المصنعة', 'المصنع'
          ]) || ''
        };
      })(),
      animalBarnSizeSqM: (() => {
        const sizeValue = getFieldValue(row, [
          'Size (sqM)', 'Size', 'Barn Size', 'animalBarnSize', 'animal_barn_size',
          'مساحة الحظيرة', 'الحجم (متر مربع)'
        ]);
        
        if (!sizeValue || sizeValue === '' || sizeValue === 'N/A' || sizeValue === 'null' || sizeValue === 'undefined') {
          return 0;
        }
        
        const parsed = parseFloat(sizeValue);
        return isNaN(parsed) ? 0 : Math.max(0, parsed);
      })(),
      breedingSites: (() => {
        // First try to get breedingSites as JSON string
        const breedingSitesJson = getFieldValue(row, ['breedingSites', 'Breeding Sites']);
        if (breedingSitesJson) {
          try {
            const parsed = JSON.parse(breedingSitesJson);
            if (Array.isArray(parsed)) {
              // Extract meaningful data from array
              const sites = parsed.map(site => {
                if (typeof site === 'string' && site.trim()) return site;
                
                const parts = [];
                if (site.type && site.type !== 'Not Available' && site.type.trim()) {
                  parts.push(site.type);
                }
                if (site.area && site.area > 0) {
                  parts.push(`المساحة: ${site.area} م²`);
                }
                if (site.treatment && site.treatment.trim()) {
                  parts.push(`المعالجة: ${site.treatment}`);
                }
                
                return parts.length > 0 ? parts.join(' - ') : null;
              }).filter(Boolean);
              
              return sites.length > 0 ? sites.join(' | ') : 'N/A';
            } else if (typeof parsed === 'object') {
              // Handle single object
              const parts = [];
              if (parsed.type && parsed.type !== 'Not Available') parts.push(parsed.type);
              if (parsed.area && parsed.area > 0) parts.push(`المساحة: ${parsed.area} م²`);
              if (parsed.treatment && parsed.treatment.trim()) parts.push(`المعالجة: ${parsed.treatment}`);
              return parts.length > 0 ? parts.join(' - ') : 'N/A';
            }
          } catch (error) {
            logger.info('Failed to parse breedingSites JSON using as string');
            return breedingSitesJson;
          }
        }
        
        // Fallback to individual fields or string value
        const breedingSitesValue = getFieldValue(row, [
          'Breeding Sites', 'breeding_sites', 'مواقع التكاثر'
        ]);
        
        if (breedingSitesValue && breedingSitesValue !== '' && breedingSitesValue !== 'N/A' && breedingSitesValue !== 'null' && breedingSitesValue !== 'undefined') {
          return breedingSitesValue.toString().trim();
        }
        
        return ''; // Return empty string instead of 'N/A'
      })(),
      parasiteControlVolume: (() => {
        const volumeValue = getFieldValue(row, [
          'Parasite Control Volume', 'parasiteControlVolume', 'parasite_control_volume',
          'حجم مكافحة الطفيليات'
        ]) || getFieldValue(row, ['Volume (ml)', 'Volume']);
        
        if (!volumeValue || volumeValue === '' || volumeValue === 'N/A' || volumeValue === 'null' || volumeValue === 'undefined') {
          return 0;
        }
        
        const parsed = parseFloat(volumeValue);
        return isNaN(parsed) ? 0 : Math.max(0, parsed);
      })(),
      parasiteControlStatus: (() => {
        const statusValue = getFieldValue(row, [
          'Parasite Control Status', 'parasiteControlStatus', 'parasite_control_status',
          'حالة مكافحة الطفيليات'
        ]) || getFieldValue(row, ['Insecticide']);
        
        if (statusValue && statusValue !== '' && statusValue !== 'N/A' && statusValue !== 'null' && statusValue !== 'undefined') {
          return statusValue.toString().trim();
        }
        
        return ''; // Return empty string instead of 'N/A'
      })(),
      herdHealthStatus: (() => {
        const healthValue = getFieldValue(row, [
          'Herd Health Status', 'herdHealthStatus', 'herd_health_status', 'حالة صحة القطيع'
        ]);
        
        if (!healthValue) return 'Healthy';
        
        const healthLower = healthValue.toString().toLowerCase().trim();
        
        // Handle all variations
        if (healthLower === 'healthy' || healthLower === 'صحي' || healthLower === 'سليم') return 'Healthy';
        if (healthLower === 'sick' || healthLower === 'مريض') return 'Sick';
        if (healthLower.includes('sporadic') || healthLower.includes('cases')) return 'Sporadic cases';
        if (healthLower.includes('treatment') || healthLower === 'تحت العلاج') return 'Sporadic cases';
        
        return 'Healthy'; // Default
      })(),
      complyingToInstructions: (() => {
        const complianceValue = getFieldValue(row, [
          'Complying to instructions', 'complyingToInstructions', 'complying_to_instructions', 'الالتزام بالتعليمات'
        ]);
        
        if (!complianceValue) return 'Comply';
        
        const complianceLower = complianceValue.toString().toLowerCase().trim();
        
        // Handle all variations
        if (complianceLower === 'comply' || complianceLower === 'true' || complianceLower === 'yes' || 
            complianceLower === 'ملتزم' || complianceLower === 'نعم') return 'Comply';
        
        if (complianceLower.includes('not') && complianceLower.includes('comply') || 
            complianceLower === 'false' || complianceLower === 'no' || 
            complianceLower === 'غير ملتزم' || complianceLower === 'لا') return 'Not Comply';
        
        if (complianceLower.includes('partial') || complianceLower.includes('parially') || 
            complianceLower === 'ملتزم جزئيا') return 'Partially Comply';
        
        return 'Comply'; // Default
      })(),
      holdingCode: await processHoldingCodeReference(row, userId),
      request: processRequest(row, dates),
      remarks: getFieldValue(row, ['Remarks', 'remarks', 'ملاحظات']) || '',
      // Calculate totals from herd counts
      totalHerdCount: (() => {
        const total = (herdCounts.sheep?.total || 0) + 
                     (herdCounts.goats?.total || 0) + 
                     (herdCounts.camel?.total || 0) + 
                     (herdCounts.cattle?.total || 0) + 
                     (herdCounts.horse?.total || 0);
        return total;
      })(),
      totalYoung: (() => {
        const total = (herdCounts.sheep?.young || 0) + 
                     (herdCounts.goats?.young || 0) + 
                     (herdCounts.camel?.young || 0) + 
                     (herdCounts.cattle?.young || 0) + 
                     (herdCounts.horse?.young || 0);
        return total;
      })(),
      totalFemale: (() => {
        const total = (herdCounts.sheep?.female || 0) + 
                     (herdCounts.goats?.female || 0) + 
                     (herdCounts.camel?.female || 0) + 
                     (herdCounts.cattle?.female || 0) + 
                     (herdCounts.horse?.female || 0);
        return total;
      })(),
      totalTreated: (() => {
        const total = (herdCounts.sheep?.treated || 0) + 
                     (herdCounts.goats?.treated || 0) + 
                     (herdCounts.camel?.treated || 0) + 
                     (herdCounts.cattle?.treated || 0) + 
                     (herdCounts.horse?.treated || 0);
        return total;
      })(),
      activityType: getFieldValue(row, ['Activity Type', 'activityType', 'نوع النشاط']) || 'Parasite Control Activity',
      importSource: 'excel',
      importDate: new Date(),
      customImportData: processCustomImportData(row),
      createdBy: userId
    });

    await parasiteControl.save();
    return parasiteControl;
  } catch (error) {
    throw new Error(`Error processing parasite control row: ${error.message}`);
  }
};

/**
 * Process MobileClinic row using unified helpers
 */
const processMobileClinicRow = async (row, userId, errors) => {
  try {
    // Use unified processors
    const client = await processUnifiedClientEnhanced(row, userId);
    const dates = processUnifiedDatesEnhanced(row);
    const coordinates = processUnifiedCoordinatesEnhanced(row);
    const animalCounts = processAnimalCounts(row);
    
    // Create mobile clinic record
    const categoriesResult = extractInterventionCategories(row, [
      'Intervention Categories', 'interventionCategories', 'Categories', 'categories',
      'Intervention Category', 'interventionCategory', 'intervention_category', 'فئة التدخل'
    ]);

    const mobileClinic = new MobileClinic({
      serialNo: await generateSerialNo(row, 'MC', MobileClinic),
      date: dates.mainDate,
      client: client._id,
      farmLocation: getFieldValue(row, [
        'Location', 'location', 'Farm Location', 'farmLocation',
        'الموقع', 'موقع المزرعة'
      ]) || 'N/A',
      supervisor: getFieldValue(row, [
        'Supervisor', 'supervisor', 'المشرف'
      ]) || 'Default Supervisor',
      vehicleNo: getFieldValue(row, [
        'Vehicle No.', 'Vehicle No', 'vehicleNo', 'vehicle_no',
        'رقم المركبة'
      ]) || 'N/A',
      coordinates: coordinates,
      animalCounts: animalCounts,
      diagnosis: getFieldValue(row, [
        'Diagnosis', 'diagnosis', 'التشخيص'
      ]) || '',
      interventionCategory: categoriesResult.primary || '',
      interventionCategories: categoriesResult.all,
      treatment: getFieldValue(row, [
        'Treatment', 'treatment', 'العلاج'
      ]) || '',
      medicationsUsed: parseJsonField(getFieldValue(row, [
        'Medications Used', 'medicationsUsed', 'medications_used', 'الأدوية المستخدمة'
      ]), []),
      request: processRequest(row, dates),
      followUpRequired: processEnumValue(
        row,
        ['Follow Up Required', 'followUpRequired', 'follow_up_required', 'مطلوب متابعة'],
        {
          'true': true, 'yes': true, 'نعم': true, '1': true,
          'false': false, 'no': false, 'لا': false, '0': false
        },
        false
      ),
      followUpDate: dates.followUpDate,
      holdingCode: await processHoldingCodeReference(row, userId),
      remarks: getFieldValue(row, ['Remarks', 'remarks', 'ملاحظات']) || '',
      customImportData: processCustomImportData(row),
      createdBy: userId
    });

    await mobileClinic.save();
    return mobileClinic;
  } catch (error) {
    throw new Error(`Error processing mobile clinic row: ${error.message}`);
  }
};

// ========================================
// ENHANCED UNIFIED IMPORT HELPERS
// ========================================

/**
 * Enhanced field value getter with case-insensitive fallback
 * Supports Arabic and English field names
 */
const getFieldValue = (row, fieldNames) => {
  // First try exact match
  for (const name of fieldNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== '' && row[name] !== '-') {
      // Handle multiple phone numbers separated by comma
      if (name.toLowerCase().includes('phone') && typeof row[name] === 'string' && row[name].includes(',')) {
        return row[name].split(',')[0].trim(); // Take first phone number
      }
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
      return rowKeysLower[lowerName];
    }
  }
  
  return undefined;
};

// ========================================
// LOCATION/VILLAGE HELPERS
// ========================================

const INVALID_LOCATION_VALUES = new Set([
  '',
  '-',
  'na',
  'n/a',
  'غير محدد',
  'غير  محدد',
  'غير محددة',
  'غير معروف',
  'غير معروفة',
  'غير معرف',
  'غير معرفه',
  'not specified',
  'not specified.',
  'not available',
  'غير متوفر',
  'غير متوفرة',
  'undefined',
  'null',
  'none',
  'n\u002fa'
].map(value => value.toLowerCase()));

const normalizeLocationString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  const stringValue = value.toString().trim();
  if (!stringValue) {
    return '';
  }

  const normalized = stringValue.replace(/\s+/g, ' ').toLowerCase();
  if (INVALID_LOCATION_VALUES.has(normalized)) {
    return '';
  }

  return stringValue;
};

const extractVillageName = (value) => {
  if (!value && value !== 0) {
    return '';
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = extractVillageName(item);
      if (result) {
        return result;
      }
    }
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return normalizeLocationString(value);
  }

  if (typeof value === 'object') {
    if (value === null) {
      return '';
    }

    const candidateKeys = [
      'nameArabic',
      'nameEnglish',
      'arabicName',
      'englishName',
      'name',
      'village',
      'label',
      'value',
      'title',
      'displayName',
      'text'
    ];

    for (const key of candidateKeys) {
      if (value[key]) {
        const result = normalizeLocationString(value[key]);
        if (result) {
          return result;
        }
      }
    }

    // Some structures may nest the actual value deeper
    if (value.metadata) {
      const nested = extractVillageName(value.metadata);
      if (nested) {
        return nested;
      }
    }

    if (value.details) {
      const nested = extractVillageName(value.details);
      if (nested) {
        return nested;
      }
    }
  }

  return '';
};

const getValueByPath = (source, path) => {
  if (!source || !path) {
    return undefined;
  }

  const parts = path.split('.');
  let current = source;

  for (const part of parts) {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      return undefined;
    }
  }

  return current;
};

const resolveRecordLocation = (record, fallbackPaths = []) => {
  if (!record) {
    return 'غير محدد';
  }

  const candidates = [];

  // Direct record fields
  candidates.push(record.village);
  candidates.push(record.clientVillage);
  candidates.push(record.herdLocation);
  candidates.push(record.farmLocation);
  candidates.push(record.location);
  candidates.push(record.owner?.village);
  candidates.push(record.owner?.location);
  candidates.push(record.request?.location);

  // Client based fields
  const client = record.client;
  if (client) {
    candidates.push(client.village);
    candidates.push(client.clientVillage);
    candidates.push(client.detailedAddress);
    candidates.push(client.address);
    candidates.push(client.location);
  }

  // Additional nested client data formats
  if (record.clientData) {
    candidates.push(record.clientData.village);
    candidates.push(record.clientData.location);
    candidates.push(record.clientData.address);
  }

  // Holding code village reference
  if (record.holdingCode) {
    candidates.push(record.holdingCode.village);
  }

  // Custom import metadata often stores village/location
  if (record.customImportData) {
    candidates.push(record.customImportData.village);
    candidates.push(record.customImportData.location);
  }

  // Apply explicit fallback paths supplied by caller
  for (const path of fallbackPaths) {
    const value = getValueByPath(record, path);
    if (value !== undefined && value !== null) {
      candidates.push(value);
    }
  }

  for (const candidate of candidates) {
    const resolved = extractVillageName(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return 'غير محدد';
};

/**
 * Smart holding code processor - finds existing or creates new holding code
 * Enhanced to handle duplicate codes across different villages
 */
const findOrCreateHoldingCodeImportExport = async (holdingCodeValue, village, userId) => {
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
      return holdingCode._id;
    }

    // If not found by code, try to find by village (since village should be unique)
    holdingCode = await HoldingCode.findOne({ 
      village: villageValue,
      isActive: true 
    });

    if (holdingCode) {
      return holdingCode._id;
    }

    // Check if the same code exists for a different village
    const existingCodeForDifferentVillage = await HoldingCode.findOne({ 
      code: codeValue,
      village: { $ne: villageValue },
      isActive: true 
    });

    if (existingCodeForDifferentVillage) {
      return existingCodeForDifferentVillage._id;
    }

    // If no holding code exists, create a new one
    
    const newHoldingCode = new HoldingCode({
      code: codeValue,
      village: villageValue,
      description: `Auto-created during import for village ${villageValue}`,
      isActive: true,
      createdBy: userId
    });

    await newHoldingCode.save();
    return newHoldingCode._id;

  } catch (error) {
    logger.error('Error in findOrCreateHoldingCodeImportExport:', { error: error });
    
    // If it's a duplicate error, try to find the existing one
    if (error.code === 11000 || error.code === 'DUPLICATE_HOLDING_CODE' || error.code === 'DUPLICATE_VILLAGE_HOLDING_CODE') {
      logger.info('Duplicate detected trying to find existing holding code');
      
      // Try to find by code first
      let existingCode = await HoldingCode.findOne({ 
        code: holdingCodeValue.toString().trim(),
        isActive: true 
      });
      
      if (existingCode) {
        return existingCode._id;
      }
      
      // Try to find by village
      existingCode = await HoldingCode.findOne({ 
        village: village.toString().trim(),
        isActive: true 
      });
      
      if (existingCode) {
        return existingCode._id;
      }
    }
    
    // If all fails, return null and continue without holding code
    return null;
  }
};

/**
 * Find or create village by name
 * Now accepts optional row parameter to extract serialNumber if provided
 */
const findOrCreateVillage = async (villageName, userId, row = null) => {
  try {
    if (!villageName || villageName.trim() === '') {
      return null;
    }

    // First try to find by exact name match
    let village = await Village.findOne({
      $or: [
        { nameArabic: villageName.trim() },
        { nameEnglish: villageName.trim() }
      ]
    });

    if (village) {
      return village._id;
    }

    // If not found, create a new village
    
    // Extract serial number from row if provided, otherwise auto-generate
    let serialNumber;
    if (row) {
      serialNumber = getFieldValue(row, [
        'Village Serial Number', 'villageSerialNumber', 'village_serial_number',
        'Village Serial', 'villageSerial', 'village_serial',
        'الرقم التسلسلي للقرية', 'رقم القرية التسلسلي'
      ]);
    }
    
    // If no serial number provided, auto-generate one
    if (!serialNumber) {
      serialNumber = `AUTO${Date.now().toString().slice(-6)}`;
    }
    
    // Extract sector from row if provided
    let sector = 'Unknown Sector';
    if (row) {
      const rowSector = getFieldValue(row, [
        'Village Sector', 'villageSector', 'village_sector',
        'Sector', 'sector',
        'قطاع القرية', 'القطاع'
      ]);
      if (rowSector) {
        sector = rowSector;
      }
    }
    
    const newVillage = new Village({
      serialNumber: serialNumber, // Use provided serial number or auto-generated
      sector: sector,
      nameArabic: villageName.trim(),
      nameEnglish: villageName.trim(), // Use same name for English
      createdBy: userId
    });

    await newVillage.save();
    return newVillage._id;
  } catch (error) {
    logger.error('Error findingcreating village:', { error: error });
    return null;
  }
};

/**
 * Process holding code reference - find HoldingCode by code and return ObjectId
 * Enhanced to create holding codes if they don't exist
 */
const processHoldingCodeReference = async (row, userId = null) => {
  try {
    const holdingCodeValue = getFieldValue(row, [
      'Holding Code', 'holdingCode', 'holding_code', 'Code','Holding Code',
      'رمز الحيازة', 'الرمز'
    ]);
    
    if (!holdingCodeValue || holdingCodeValue.trim() === '') {
      return null;
    }
    
    // Get village information for smart holding code creation
    const village = getFieldValue(row, [
      'Location', 'location', 'Village', 'village', 'clientVillage',
      'Farm Location', 'farmLocation', 'address',
      'القرية', 'الموقع', 'موقع المزرعة', 'العنوان', 'herd location' , 'Herd Location'
    ]);
    
    // Use smart holding code creation if we have userId and village
    if (userId && village) {
      return await findOrCreateHoldingCodeImportExport(holdingCodeValue, village, userId);
    }
    
    // Fallback to old logic (find only) if no userId or village
    const holdingCode = await HoldingCode.findOne({ 
      code: holdingCodeValue.trim(),
      isActive: true 
    });
    
    if (holdingCode) {
      return holdingCode._id;
    } else {
      return null;
    }
  } catch (error) {
    logger.error('Error processing holding code reference:', { error: error });
    return null;
  }
};

/**
 * Enhanced unified client processor with better validation
 */
const processUnifiedClientEnhanced = async (row, userId, options = {}) => {
  try {
    const { requireClient = false, createIfNotFound = true } = options;
    
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
      'القرية', 'الموقع', 'موقع المزرعة', 'العنوان', 'Herd Location'
    ]);
    
    const clientAddress = getFieldValue(row, [
      'Address', 'address', 'Detailed Address', 'detailedAddress', 'clientAddress',
      'العنوان', 'العنوان التفصيلي'
    ]);
    
    // Get holding code information
    const holdingCodeValue = getFieldValue(row, [
      'Holding Code', 'holdingCode', 'holding_code', 'Code','Holding Code',
      'رمز الحيازة', 'الرمز'
    ]);
    
    // Process village intelligently
    let villageId = null;
    if (clientVillage && userId) {
      villageId = await findOrCreateVillage(clientVillage, userId, row);
    }
    
    // Process holding code intelligently
    let holdingCodeId = null;
    if (holdingCodeValue && clientVillage && userId) {
      holdingCodeId = await findOrCreateHoldingCodeImportExport(holdingCodeValue, clientVillage, userId);
    }
    
    // For Laboratory and EquineHealth that store client as embedded data
    if (options.returnAsObject) {
      return {
        name: clientName || 'غير محدد',
        nationalId: clientId || generateValidNationalId(),
        phone: clientPhone || generateDefaultPhone(),
        village: clientVillage || '',
        detailedAddress: clientAddress || clientVillage || '',
        birthDate: parseBirthDate(row)
      };
    }
    
    // Validate if client is required
    if (requireClient && !clientName && !clientId) {
      throw new Error('Client information is required but not found');
    }
    
    // Find existing client
    let client = null;
    
    if (clientId) {
      client = await Client.findOne({ nationalId: clientId });
    }
    
    if (!client && clientName && clientName !== 'غير محدد') {
      client = await Client.findOne({ name: clientName });
    }
    
    // Create new client if not found and allowed
    if (!client && createIfNotFound) {
      try {
        const newClient = new Client({
          name: clientName || 'غير محدد',
          nationalId: clientId || generateValidNationalId(),
          phone: clientPhone || generateDefaultPhone(),
          village: villageId, // Use village ObjectId instead of string
          detailedAddress: clientAddress || clientVillage || '',
          birthDate: parseBirthDate(row),
          holdingCode: holdingCodeId, // Use ObjectId or null
          status: 'نشط',
          animals: [],
          availableServices: [],
          createdBy: userId
        });
        
        await newClient.save();
        client = newClient;
      } catch (saveError) {
        // If duplicate key error, try to find existing client again
        if (saveError.code === 11000 && saveError.keyPattern && saveError.keyPattern.nationalId) {
          client = await Client.findOne({ nationalId: clientId });
          if (client) {
          } else {
            throw new Error(`Client with nationalId ${clientId} exists but could not be retrieved`);
          }
        } else {
          throw saveError;
        }
      }
    }
    
    // Update existing client with holding code if provided and not already set
    if (client && holdingCodeId && !client.holdingCode) {
      try {
        client.holdingCode = holdingCodeId;
        await client.save();
      } catch (updateError) {
      }
    }
    
    return client;
  } catch (error) {
    throw new Error(`Error processing client: ${error.message}`);
  }
};

/**
 * Generate valid national ID
 */
const generateValidNationalId = () => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `${timestamp}${random}`; // 10 digits total
};

/**
 * Generate default phone number
 */
const generateDefaultPhone = () => {
  const timestamp = Date.now().toString().slice(-8);
  return `5${timestamp}`;
};

/**
 * Parse birth date from row
 */
const parseBirthDate = (row) => {
  const birthDateField = getFieldValue(row, [
    'Birth Date', 'birthDate', 'Date of Birth', 'dateOfBirth',
    'clientBirthDate', 'Client Birth Date',
    'تاريخ الميلاد'
  ]);
  
  if (birthDateField) {
    const parsedDate = parseDateField(birthDateField);
    if (parsedDate && !isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }
  return undefined;
};

/**
 * Enhanced unified dates processor
 */
const processUnifiedDatesEnhanced = (row) => {
  const mainDate = (() => {
    const dateField = findDateField(row);
    if (dateField) {
      const parsed = parseDateField(dateField.value);
      if (parsed && !isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  })();
  
  return {
    mainDate,
    requestDate: (() => {
      const field = getFieldValue(row, [
        'Request Date', 'requestDate', 'request_date',
        'تاريخ الطلب'
      ]);
      if (field) {
        const parsed = parseDateField(field);
        return parsed && !isNaN(parsed.getTime()) ? parsed : mainDate;
      }
      return mainDate;
    })(),
    fulfillingDate: (() => {
      const field = getFieldValue(row, [
        'Request Fulfilling Date', 'requestFulfillingDate', 
        'request_fulfilling_date', 'Fulfilling Date',
        'تاريخ تنفيذ الطلب'
      ]);
      if (field) {
        const parsed = parseDateField(field);
        if (parsed && !isNaN(parsed.getTime())) {
          // Get request date for comparison
          const requestField = getFieldValue(row, [
            'Request Date', 'requestDate', 'request_date',
            'تاريخ الطلب'
          ]);
          const requestDate = requestField ? parseDateField(requestField) : mainDate;
          
          // Ensure fulfilling date is not before request date
          if (parsed < (requestDate || mainDate)) {
            return requestDate || mainDate;
          }
          return parsed;
        }
      }
      return undefined;
    })(),
    followUpDate: (() => {
      const field = getFieldValue(row, [
        'Follow Up Date', 'followUpDate', 'follow_up_date',
        'تاريخ المتابعة'
      ]);
      if (field) {
        const parsed = parseDateField(field);
        return parsed && !isNaN(parsed.getTime()) ? parsed : undefined;
      }
      return undefined;
    })()
  };
};

/**
 * Enhanced coordinates processor
 */
const processUnifiedCoordinatesEnhanced = (row) => {
  const lat = parseFloat(getFieldValue(row, [
    'N', 'N Coordinate', 'latitude', 'lat', 'Latitude',
    'خط العرض'
  ]) || 0);
  
  const lng = parseFloat(getFieldValue(row, [
    'E', 'E Coordinate', 'longitude', 'lng', 'long', 'Longitude',
    'خط الطول'
  ]) || 0);
  
  return {
    latitude: isNaN(lat) ? 0 : lat,
    longitude: isNaN(lng) ? 0 : lng
  };
};

/**
 * Process herd counts for Vaccination and ParasiteControl
 */
const processHerdCounts = (row, type = 'vaccination') => {
  const isParasite = type === 'parasite';
  
  return {
    sheep: {
      total: parseInt(getFieldValue(row, [
        isParasite ? 'Total Sheep' : 'Sheep', 'sheep', 'sheepTotal',
        'الأغنام', 'أغنام'
      ]) || 0),
      young: parseInt(getFieldValue(row, [
        'Young Sheep', 'sheepYoung', 'young_sheep',
        'صغار الأغنام'
      ]) || 0),
      female: parseInt(getFieldValue(row, [
        isParasite ? 'Female Sheep' : 'F. Sheep', 'sheepFemale', 'female_sheep',
        'إناث الأغنام'
      ]) || 0),
      [isParasite ? 'treated' : 'vaccinated']: parseInt(getFieldValue(row, [
        isParasite ? 'Treated Sheep' : 'Vaccinated Sheep', 
        isParasite ? 'sheepTreated' : 'sheepVaccinated',
        isParasite ? 'الأغنام المعالجة' : 'الأغنام المحصنة'
      ]) || 0)
    },
    goats: {
      total: parseInt(getFieldValue(row, [
        isParasite ? 'Total Goats' : 'Goats', 'goats', 'goatsTotal',
        'الماعز', 'ماعز'
      ]) || 0),
      young: parseInt(getFieldValue(row, [
        'Young Goats', 'goatsYoung', 'young_goats',
        'صغار الماعز'
      ]) || 0),
      female: parseInt(getFieldValue(row, [
        isParasite ? 'Female Goats' : 'F. Goats', 'goatsFemale', 'female_goats',
        'إناث الماعز'
      ]) || 0),
      [isParasite ? 'treated' : 'vaccinated']: parseInt(getFieldValue(row, [
        isParasite ? 'Treated Goats' : 'Vaccinated Goats',
        isParasite ? 'goatsTreated' : 'goatsVaccinated',
        isParasite ? 'الماعز المعالج' : 'الماعز المحصن'
      ]) || 0)
    },
    camel: {
      total: parseInt(getFieldValue(row, [
        isParasite ? 'Total Camel' : 'Camel', 'camel', 'camelTotal',
        'الإبل', 'إبل', 'الجمال'
      ]) || 0),
      young: parseInt(getFieldValue(row, [
        'Young Camels', 'camelYoung', 'young_camels',
        'صغار الإبل'
      ]) || 0),
      female: parseInt(getFieldValue(row, [
        isParasite ? 'Female Camels' : 'F. Camel', 'camelFemale', 'female_camels',
        'إناث الإبل'
      ]) || 0),
      [isParasite ? 'treated' : 'vaccinated']: parseInt(getFieldValue(row, [
        isParasite ? 'Treated Camels' : 'Vaccinated Camels',
        isParasite ? 'camelTreated' : 'camelVaccinated',
        isParasite ? 'الإبل المعالجة' : 'الإبل المحصنة'
      ]) || 0)
    },
    cattle: {
      total: parseInt(getFieldValue(row, [
        isParasite ? 'Total Cattle' : 'Cattle', 'cattle', 'cattleTotal',
        'الأبقار', 'أبقار', 'البقر'
      ]) || 0),
      young: parseInt(getFieldValue(row, [
        'Young Cattle', 'cattleYoung', 'young_cattle',
        'صغار الأبقار'
      ]) || 0),
      female: parseInt(getFieldValue(row, [
        isParasite ? 'Female Cattle' : 'F. Cattle', 'cattleFemale', 'female_cattle',
        'إناث الأبقار'
      ]) || 0),
      [isParasite ? 'treated' : 'vaccinated']: parseInt(getFieldValue(row, [
        isParasite ? 'Treated Cattle' : 'Vaccinated Cattle',
        isParasite ? 'cattleTreated' : 'cattleVaccinated',
        isParasite ? 'الأبقار المعالجة' : 'الأبقار المحصنة'
      ]) || 0)
    },
    horse: {
      total: parseInt(getFieldValue(row, [
        'Horse', 'horse', 'horseTotal',
        'الخيول', 'خيول', 'الأحصنة'
      ]) || 0),
      young: parseInt(getFieldValue(row, [
        'Young Horses', 'horseYoung', 'young_horses',
        'صغار الخيول'
      ]) || 0),
      female: parseInt(getFieldValue(row, [
        'Female Horses', 'horseFemale', 'female_horses',
        'إناث الخيول'
      ]) || 0),
      [isParasite ? 'treated' : 'vaccinated']: parseInt(getFieldValue(row, [
        isParasite ? 'Treated Horses' : 'Vaccinated Horses',
        isParasite ? 'horseTreated' : 'horseVaccinated',
        isParasite ? 'الخيول المعالجة' : 'الخيول المحصنة'
      ]) || 0)
    }
  };
};

/**
 * Process animal counts for MobileClinic
 */
const processAnimalCounts = (row) => {
  return {
    sheep: parseInt(getFieldValue(row, [
      'Sheep', 'sheep', 'sheepCount',
      'الأغنام', 'أغنام'
    ]) || 0),
    goats: parseInt(getFieldValue(row, [
      'Goats', 'goats', 'goatsCount',
      'الماعز', 'ماعز'
    ]) || 0),
    camel: parseInt(getFieldValue(row, [
      'Camel', 'camel', 'camelCount',
      'الإبل', 'إبل', 'الجمال'
    ]) || 0),
    cattle: parseInt(getFieldValue(row, [
      'Cattle', 'cattle', 'cattleCount',
      'الأبقار', 'أبقار', 'البقر'
    ]) || 0),
    horse: parseInt(getFieldValue(row, [
      'Horse', 'horse', 'horseCount',
      'الخيول', 'خيول', 'الأحصنة'
    ]) || 0)
  };
};

/**
 * Process species counts for Laboratory
 */
const processSpeciesCounts = (row) => {
  return {
    sheep: parseInt(getFieldValue(row, [
      'Sheep', 'sheep', 'sheepCount',
      'الأغنام', 'أغنام'
    ]) || 0),
    goats: parseInt(getFieldValue(row, [
      'Goats', 'goats', 'goatsCount',
      'الماعز', 'ماعز'
    ]) || 0),
    camel: parseInt(getFieldValue(row, [
      'Camel', 'camel', 'camelCount',
      'الإبل', 'إبل', 'الجمال'
    ]) || 0),
    cattle: parseInt(getFieldValue(row, [
      'Cattle', 'cattle', 'cattleCount',
      'الأبقار', 'أبقار', 'البقر'
    ]) || 0),
    horse: parseInt(getFieldValue(row, [
      'Horse', 'horse', 'horseCount',
      'الخيول', 'خيول', 'الأحصنة'
    ]) || 0),
    other: getFieldValue(row, [
      'Other', 'other', 'Other (Species)', 'otherSpecies',
      'أخرى', 'أنواع أخرى'
    ]) || ''
  };
};

/**
 * Generate serial number - Returns the original serial number as-is
 * If no serial number is provided, generates a unique one
 */
const generateSerialNo = async (row, prefix, Model) => {
  const serialNo = getFieldValue(row, [
    'Serial No', 'serialNo', 'serial_no', 'Serial Number',
    'الرقم التسلسلي', 'رقم تسلسلي'
  ]);
  
  // If serial number exists in Excel, check for duplicates and handle them
  if (serialNo) {
    const originalSerialNo = serialNo.toString().trim();
    
    // Check if this serial number already exists in the database
    if (Model) {
      const existingRecord = await Model.findOne({ serialNo: originalSerialNo });
      if (existingRecord) {
        // Generate a unique serial number by appending a suffix
        let counter = 1;
        let uniqueSerialNo = `${originalSerialNo}-${counter}`;
        
        while (await Model.findOne({ serialNo: uniqueSerialNo })) {
          counter++;
          uniqueSerialNo = `${originalSerialNo}-${counter}`;
        }
        
        return uniqueSerialNo;
      }
    }
    
    return originalSerialNo;
  }
  
  // Only generate a new serial number if none was provided
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substr(2, 4);
  return `${prefix}-${timestamp}-${random}`;
};


/**
 * Process enum values with mapping
 */
const processEnumValue = (row, fieldNames, enumMap, defaultValue) => {
  const value = getFieldValue(row, fieldNames);
  if (!value) return defaultValue;
  
  const normalizedValue = value.toString().toLowerCase().trim();
  
  // Check map first
  if (enumMap[normalizedValue]) {
    return enumMap[normalizedValue];
  }
  
  // Check if it's already a valid value
  const validValues = Object.values(enumMap).filter((v, i, a) => a.indexOf(v) === i);
  if (validValues.includes(value)) {
    return value;
  }
  
  return defaultValue;
};

const INTERVENTION_CATEGORY_NORMALIZATION_MAP = {
  'emergency': 'Emergency',
  'urgent': 'Emergency',
  'routine': 'Routine',
  'regular': 'Routine',
  'preventive': 'Preventive',
  'prevention': 'Preventive',
  'follow-up': 'Follow-up',
  'follow up': 'Follow-up',
  'followup': 'Follow-up',
  'متابعة': 'Follow-up',
  'clinical examination': 'Clinical Examination',
  'فحص سريري': 'Clinical Examination',
  'ultrasonography': 'Ultrasonography',
  'تصوير بالموجات فوق الصوتية': 'Ultrasonography',
  'surgical operation': 'Surgical Operation',
  'عملية جراحية': 'Surgical Operation',
  'lab analysis': 'Lab Analysis',
  'laboratory analysis': 'Lab Analysis',
  'laboratory': 'Lab Analysis',
  'تحليل مخبري': 'Lab Analysis',
  'farriery': 'Farriery',
  'حدادة الخيل': 'Farriery'
};

const normalizeInterventionCategoryLabel = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  const stringValue = value.toString().trim();
  if (!stringValue) {
    return '';
  }

  const key = stringValue.toLowerCase();
  return INTERVENTION_CATEGORY_NORMALIZATION_MAP[key] || stringValue;
};

const splitMultiValueString = (value) => {
  if (!value || typeof value !== 'string') {
    return [];
  }

  return value
    .split(/[\n\r\|;,\/]+/)
    .map(item => item.trim())
    .filter(Boolean);
};

const parseInterventionCategoryValue = (value) => {
  if (value === undefined || value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'object') {
    return Object.values(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.values(parsed);
      }
    } catch (error) {
      // Not JSON - fall back to delimiter split
    }

    return splitMultiValueString(trimmed);
  }

  return [value];
};

const extractInterventionCategories = (row, fieldNames, defaultValue = '') => {
  const collectedValues = [];

  fieldNames.forEach((name) => {
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
      collectedValues.push(row[name]);
    }
  });

  let categories = collectedValues
    .flatMap(parseInterventionCategoryValue)
    .map(normalizeInterventionCategoryLabel)
    .filter(value => value && value !== '-');

  categories = [...new Set(categories)];

  if (!categories.length && defaultValue) {
    const normalizedDefault = normalizeInterventionCategoryLabel(defaultValue);
    if (normalizedDefault) {
      categories.push(normalizedDefault);
    }
  }

  return {
    primary: categories[0] || '',
    all: categories
  };
};

/**
 * Process request object
 */
const processRequest = (row, dates) => {
  // First try to get request as JSON string
  const requestJson = getFieldValue(row, ['request', 'Request']);
  if (requestJson) {
    try {
      const parsed = JSON.parse(requestJson);
      return {
        date: parsed.date ? new Date(parsed.date) : dates.requestDate,
        situation: parsed.situation || 'Ongoing',
        fulfillingDate: parsed.fulfillingDate ? new Date(parsed.fulfillingDate) : dates.fulfillingDate
      };
    } catch (error) {
      logger.info('Failed to parse request JSON using individual fields');
    }
  }
  
  // Fallback to individual fields
  const situation = processEnumValue(
    row,
    ['Request Status', 'Request Situation', 'requestSituation', 'requestStatus', 'حالة الطلب'],
    {
      'Ongoing': 'Ongoing', 'مفتوح': 'Ongoing', 'نشط': 'Ongoing', 'active': 'Ongoing',
      'closed': 'Closed', 'مغلق': 'Closed', 'منتهي': 'Closed', 'finished': 'Closed',
      'pending': 'Pending', 'في الانتظار': 'Pending', 'معلق': 'Pending', 'waiting': 'Pending'
    },
    'Ongoing'
  );

  // If status is Closed but no fulfilling date, use request date
  let fulfillingDate = dates.fulfillingDate;
  if (situation === 'Closed' && !fulfillingDate) {
    fulfillingDate = dates.requestDate;
  }

  return {
    date: dates.requestDate,
    situation: situation,
    fulfillingDate: fulfillingDate
  };
};

/**
 * Process custom import data
 */
const processCustomImportData = (row) => {
  const excludeKeys = [
    'Serial No', 'Date', 'Name', 'ID', 'Phone', 'Location', 
    'N Coordinate', 'E Coordinate', 'N', 'E',
    'Supervisor', 'Vehicle No.', 'Sheep', 'Goats', 'Camel', 'Horse', 'Cattle',
    'Diagnosis', 'Intervention Category', 'Treatment', 
    'Request Date', 'Request Status', 'Request Fulfilling Date',
    'category', 'Remarks'
  ];
  
  return {
    originalData: row,
    holdingCode: getFieldValue(row, ['Holding Code', 'holdingCode', 'رمز الحيازة']) || '',
    birthDate: getFieldValue(row, ['Birth Date', 'Date of Birth', 'birthDate', 'تاريخ الميلاد']) || '',
    ...Object.keys(row).reduce((acc, key) => {
      if (!excludeKeys.includes(key)) {
        acc[key] = row[key];
      }
      return acc;
    }, {})
  };
};

/**
 * Process Laboratory row using unified helpers
 * Note: Laboratory stores client data as embedded fields, not references
 */
const processLaboratoryRow = async (row, userId, errors) => {
  try {
    logger.info('Processing laboratory row with unified helpers');
    
    // First, create or find client in Clients table (this ensures client exists in database)
    const client = await processUnifiedClientEnhanced(row, userId, { createIfNotFound: true });
    const dates = processUnifiedDatesEnhanced(row);
    const coordinates = processUnifiedCoordinatesEnhanced(row);
    const speciesCounts = processSpeciesCounts(row);
    
    // Get client data for Laboratory record (embedded fields)
    const clientData = {
      name: client?.name || getFieldValue(row, ['Name', 'name', 'clientName', 'Client Name', 'الاسم']) || 'غير محدد',
      nationalId: client?.nationalId || getFieldValue(row, ['ID', 'id', 'clientId', 'Client ID', 'nationalId', 'رقم الهوية']) || '',
      phone: client?.phone || getFieldValue(row, ['Phone', 'phone', 'clientPhone', 'Client Phone', 'رقم الهاتف']) || 'N/A',
      village: client?.village ? (typeof client.village === 'object' ? client.village.nameArabic || client.village.nameEnglish : client.village) : '',
      detailedAddress: client?.detailedAddress || getFieldValue(row, ['Address', 'address', 'Detailed Address', 'العنوان']) || '',
      birthDate: client?.birthDate || parseBirthDate(row)
    };
    
    // For Laboratory, we allow any client data since validation is now flexible
    // No strict validation - accept whatever data is provided
    logger.info('Laboratory accepts flexible client data for import');
    
    
    // Get serial number as-is (preserve original value exactly as provided)
    const serialNoValue = getFieldValue(row, [
      'Serial No', 'serialNo', 'serial_no', 'Serial Number',
      'الرقم التسلسلي', 'رقم تسلسلي'
    ]);
    
    // Preserve the original serial number as-is (even if it's "1" or "2")
    // Only convert to number if it's a valid number, otherwise keep as-is and generate new
    let serialNo;
    if (serialNoValue) {
      const parsedValue = parseInt(serialNoValue);
      // If it's a valid number (including single digits like 1, 2, etc.), use it as-is
      if (!isNaN(parsedValue)) {
        serialNo = parsedValue; // Preserve even if it's "1" or "2"
      } else {
        // If not a valid number but has value, try to use it as string representation
        serialNo = Date.now() % 1000000;
      }
    } else {
      serialNo = Date.now() % 1000000;
    }
    
    // Create laboratory record
    const laboratory = new Laboratory({
      serialNo: serialNo,
      sampleCode: getFieldValue(row, [
        'sampleCode', 'Sample Code', 'code', 'sample_code',
        'رمز العينة', 'رمز'
      ]) || await generateSerialNo(row, 'LAB', Laboratory),
      date: dates.mainDate,
      client: client?._id || null, // Add client reference if available
      clientName: clientData.name || 'غير محدد',
      clientId: clientData.nationalId,
      clientBirthDate: clientData.birthDate,
      clientPhone: clientData.phone || 'N/A', // Default if missing
      farmLocation: getFieldValue(row, [
        'farmLocation', 'Location', 'location', 'Farm Location',
        'الموقع', 'موقع المزرعة'
      ]) || 'N/A',
      coordinates: coordinates.latitude !== 0 || coordinates.longitude !== 0 ? coordinates : undefined,
      speciesCounts: speciesCounts,
      collector: getFieldValue(row, [
        'collector', 'Sample Collector', 'Collector', 'sample_collector',
        'جامع العينة', 'المجمع'
      ]) || 'N/A',
      sampleType: getFieldValue(row, [
        'sampleType', 'Sample Type', 'Type', 'sample_type',
        'نوع العينة', 'نوع'
      ]) || 'Blood', // Accept any value, default to Blood
      sampleNumber: getFieldValue(row, [
        'sampleNumber', 'Sample Number', 'Samples Number', 'sample_number',
        'رقم العينة', 'عدد العينات'
      ]) || 'N/A',
      testType: getFieldValue(row, [
        'testType', 'Test Type', 'test_type',
        'نوع الفحص', 'الفحص'
      ]) || '',
      positiveCases: parseInt(getFieldValue(row, [
        'positiveCases', 'Positive Cases', 'positive_cases', 'positive cases',
        'الحالات الإيجابية', 'إيجابي'
      ]) || 0),
      negativeCases: parseInt(getFieldValue(row, [
        'negativeCases', 'Negative Cases', 'negative_cases', 'negative cases',
        'الحالات السلبية', 'سلبي'
      ]) || 0),
      testResults: parseJsonField(getFieldValue(row, [
        'testResults', 'Test Results', 'test_results', 'results',
        'النتائج', 'نتائج الفحص'
      ]), []),
      holdingCode: await processHoldingCodeReference(row, userId),
      remarks: getFieldValue(row, ['Remarks', 'remarks', 'ملاحظات']) || '',
      customImportData: processCustomImportData(row),
      createdBy: userId
    });

    await laboratory.save();
    
    // Update client's availableServices if client exists
    if (client && client._id) {
      try {
        if (!client.availableServices.includes('laboratory')) {
          client.availableServices.push('laboratory');
          await client.save();
        }
      } catch (error) {
      }
    }
    
    return laboratory;
  } catch (error) {
    throw new Error(`Error processing laboratory row: ${error.message}`);
  }
};

/**
 * Process EquineHealth row using unified helpers
 * Note: EquineHealth stores client data as embedded fields, not references
 */
const processEquineHealthRow = async (row, userId, errors) => {
  try {
    // First, create or find client in Clients table (this ensures client exists in database)
    const client = await processUnifiedClientEnhanced(row, userId, { createIfNotFound: true });
    const dates = processUnifiedDatesEnhanced(row);
    const coordinates = processUnifiedCoordinatesEnhanced(row);
    
    // Get client data for EquineHealth record (embedded fields)
    // Extract village name properly
    let villageName = '';
    if (client?.village) {
      if (typeof client.village === 'object' && client.village !== null) {
        villageName = client.village.nameArabic || client.village.nameEnglish || client.village.name || '';
      } else if (typeof client.village === 'string') {
        villageName = client.village;
      }
    }
    
    // If village not found from client, try to get from row data
    if (!villageName) {
      villageName = getFieldValue(row, [
        'Location', 'location', 'Village', 'village', 'clientVillage',
        'Farm Location', 'farmLocation', 'القرية', 'الموقع', 'موقع المزرعة'
      ]) || '';
    }
    
    const clientData = {
      name: client?.name || getFieldValue(row, ['Name', 'name', 'clientName', 'Client Name', 'الاسم']) || 'غير محدد',
      nationalId: client?.nationalId || getFieldValue(row, ['ID', 'id', 'clientId', 'Client ID', 'nationalId', 'رقم الهوية']) || '',
      phone: client?.phone || getFieldValue(row, ['Phone', 'phone', 'clientPhone', 'Client Phone', 'رقم الهاتف']) || '',
      village: villageName || 'غير محدد',
      detailedAddress: client?.detailedAddress || getFieldValue(row, ['Address', 'address', 'Detailed Address', 'العنوان']) || '',
      birthDate: client?.birthDate || parseBirthDate(row)
    };
    
    // Get diagnosis and treatment
    const diagnosis = getFieldValue(row, [
      'Diagnosis', 'diagnosis', 'التشخيص'
    ]);
    const treatment = getFieldValue(row, [
      'Treatment', 'treatment', 'العلاج'
    ]);
    
    // Provide default values for empty fields
    const finalDiagnosis = diagnosis || 'غير محدد';
    const finalTreatment = treatment || 'غير محدد';
    
    
    // For EquineHealth, we allow "غير محدد" as a valid name since it stores client data directly
    if (!clientData.nationalId || !clientData.phone) {
      throw new Error(`Missing required client data: ID=${clientData.nationalId}, Phone=${clientData.phone}`);
    }
    
    
    // Create equine health record
    // Note: EquineHealth uses embedded client data (not ObjectId reference)
    const equineHealth = new EquineHealth({
      serialNo: await generateSerialNo(row, 'EH', EquineHealth),
      date: dates.mainDate,
      client: {
        name: clientData.name || 'غير محدد',
        nationalId: clientData.nationalId,
        phone: clientData.phone,
        village: clientData.village && clientData.village !== '' ? clientData.village : 'غير محدد',
        detailedAddress: clientData.detailedAddress || clientData.village || 'غير محدد',
        birthDate: clientData.birthDate
      },
      farmLocation: getFieldValue(row, [
        'Farm Location', 'farmLocation', 'farm_location',
        'موقع المزرعة', 'الموقع'
      ]) || clientData.village,
      coordinates: coordinates.latitude !== 0 || coordinates.longitude !== 0 ? coordinates : undefined,
      supervisor: getFieldValue(row, [
        'Supervisor', 'supervisor', 'المشرف'
      ]) || 'N/A',
      vehicleNo: getFieldValue(row, [
        'Vehicle No.', 'Vehicle No', 'vehicleNo', 'vehicle_no',
        'رقم المركبة'
      ]) || 'N/A',
      horseCount: parseInt(getFieldValue(row, [
        'Horse Count', 'horseCount', 'horse_count',
        'عدد الخيول', 'عدد الأحصنة'
      ]) || 1),
      horseDetails: (() => {
        // First try to get horseDetails as JSON string
        const horseDetailsJson = getFieldValue(row, ['horseDetails', 'Horse Details']);
        if (horseDetailsJson) {
          try {
            const parsed = JSON.parse(horseDetailsJson);
            if (Array.isArray(parsed)) {
              return parsed.map(horse => ({
                horseId: horse.horseId || 'N/A',
                breed: horse.breed || 'N/A',
                age: horse.age || 'N/A',
                gender: horse.gender || 'N/A',
                color: horse.color || 'N/A',
                healthStatus: horse.healthStatus || 'N/A',
                weight: horse.weight || 'N/A',
                temperature: horse.temperature || 'N/A',
                heartRate: horse.heartRate || 'N/A',
                respiratoryRate: horse.respiratoryRate || 'N/A'
              }));
            } else if (typeof parsed === 'object') {
              // Handle single horse object
              return [{
                horseId: parsed.horseId || 'N/A',
                breed: parsed.breed || 'N/A',
                age: parsed.age || 'N/A',
                gender: parsed.gender || 'N/A',
                color: parsed.color || 'N/A',
                healthStatus: parsed.healthStatus || 'N/A',
                weight: parsed.weight || 'N/A',
                temperature: parsed.temperature || 'N/A',
                heartRate: parsed.heartRate || 'N/A',
                respiratoryRate: parsed.respiratoryRate || 'N/A'
              }];
            }
          } catch (error) {
            logger.info('Failed to parse horseDetails JSON using individual fields');
          }
        }
        
        // Fallback to individual fields for single horse
        const horseId = getFieldValue(row, ['Horse ID', 'horseId', 'horse_id', 'معرف الحصان']);
        const breed = getFieldValue(row, ['Horse Breed', 'horseBread', 'horse_breed', 'سلالة الحصان']);
        const age = getFieldValue(row, ['Horse Age', 'horseAge', 'horse_age', 'عمر الحصان']);
        
        if (horseId || breed || age) {
          return [{
            horseId: horseId || 'N/A',
            breed: breed || 'N/A',
            age: age || 'N/A',
            gender: getFieldValue(row, ['Horse Gender', 'horseGender', 'horse_gender', 'جنس الحصان']) || 'N/A',
            color: getFieldValue(row, ['Horse Color', 'horseColor', 'horse_color', 'لون الحصان']) || 'N/A',
            healthStatus: getFieldValue(row, ['Horse Health Status', 'horseHealthStatus', 'horse_health_status', 'حالة صحة الحصان']) || 'N/A',
            weight: getFieldValue(row, ['Horse Weight', 'horseWeight', 'horse_weight', 'وزن الحصان']) || 'N/A',
            temperature: getFieldValue(row, ['Horse Temperature', 'horseTemperature', 'horse_temperature', 'حرارة الحصان']) || 'N/A',
            heartRate: getFieldValue(row, ['Horse Heart Rate', 'horseHeartRate', 'horse_heart_rate', 'نبض الحصان']) || 'N/A',
            respiratoryRate: getFieldValue(row, ['Horse Respiratory Rate', 'horseRespiratoryRate', 'horse_respiratory_rate', 'تنفس الحصان']) || 'N/A'
          }];
        }
        
        return [];
      })(),
      diagnosis: finalDiagnosis,
      interventionCategory: (() => {
        const categoriesResult = extractInterventionCategories(row, [
          'Intervention Category', 'interventionCategory', 'intervention_category', 'فئة التدخل'
        ], 'Clinical Examination');

        const normalizedCategories = normalizeEquineInterventionCategoryList(
          categoriesResult.all,
          { fallback: categoriesResult.primary || 'Clinical Examination' }
        );

        return normalizedCategories[0] || 'Clinical Examination';
      })(),
      treatment: finalTreatment,
      medication: (() => {
        // First try to get medication as JSON string
        const medicationJson = getFieldValue(row, ['medication', 'Medication']);
        if (medicationJson) {
          try {
            const parsed = JSON.parse(medicationJson);
            return {
              name: parsed.name || 'N/A',
              dosage: parsed.dosage || 'N/A',
              quantity: parsed.quantity || 'N/A',
              route: parsed.route || 'N/A',
              frequency: parsed.frequency || 'N/A',
              duration: parsed.duration || 'N/A'
            };
          } catch (error) {
            logger.info('Failed to parse medication JSON using individual fields');
          }
        }
        
        // Fallback to individual fields
        return {
          name: getFieldValue(row, [
            'Medication Name', 'medicationName', 'medication_name',
            'اسم الدواء', 'الدواء'
          ]) || 'N/A',
          dosage: getFieldValue(row, [
            'Medication Dosage', 'medicationDosage', 'medication_dosage',
            'جرعة الدواء', 'الجرعة'
          ]) || 'N/A',
          quantity: getFieldValue(row, [
            'Medication Quantity', 'medicationQuantity', 'medication_quantity',
            'كمية الدواء', 'الكمية'
          ]) || 'N/A',
          route: getFieldValue(row, [
            'Administration Route', 'administrationRoute', 'administration_route',
            'طريقة الإعطاء'
          ]) || 'N/A',
          frequency: getFieldValue(row, [
            'Medication Frequency', 'medicationFrequency', 'medication_frequency',
            'تكرار الدواء', 'التكرار'
          ]) || 'N/A',
          duration: getFieldValue(row, [
            'Medication Duration', 'medicationDuration', 'medication_duration',
            'مدة الدواء', 'المدة'
          ]) || 'N/A'
        };
      })(),
      medicationsUsed: parseJsonField(getFieldValue(row, [
        'Medications Used', 'medicationsUsed', 'medications_used', 'الأدوية المستخدمة'
      ]), []),
      followUpRequired: processEnumValue(
        row,
        ['Follow Up Required', 'followUpRequired', 'follow_up_required', 'مطلوب متابعة'],
        {
          'true': true, 'yes': true, 'نعم': true, '1': true,
          'false': false, 'no': false, 'لا': false, '0': false
        },
        false
      ),
      followUpDate: dates.followUpDate,
      request: processRequest(row, dates),
      remarks: getFieldValue(row, ['Remarks', 'remarks', 'ملاحظات']) || '',
      customImportData: processCustomImportData(row),
      createdBy: userId
    });

    await equineHealth.save();
    
    // Update client's availableServices if client exists
    if (client && client._id) {
      try {
        if (!client.availableServices.includes('equine_health')) {
          client.availableServices.push('equine_health');
          await client.save();
        }
      } catch (error) {
      }
    }
    
    return equineHealth;
  } catch (error) {
    throw new Error(`Error processing equine health row: ${error.message}`);
  }
};

// Export routes with proper field definitions
router.get('/clients/export', auth, async (req, res) => {
  try {
    const { format = 'excel' } = req.query;

    const { match, servicesFilter, totalAnimalsRange } = buildClientExportFilters(req.query);

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: 'mobileclinics',
          localField: '_id',
          foreignField: 'client',
          as: 'mobileClinics'
        }
      },
      {
        $lookup: {
          from: 'vaccinations',
          localField: '_id',
          foreignField: 'client',
          as: 'vaccinations'
        }
      },
      {
        $lookup: {
          from: 'equinehealths',
          localField: '_id',
          foreignField: 'client',
          as: 'equineHealths'
        }
      },
      {
        $lookup: {
          from: 'laboratories',
          localField: '_id',
          foreignField: 'client',
          as: 'laboratories'
        }
      },
      {
        $lookup: {
          from: 'parasitecontrols',
          localField: '_id',
          foreignField: 'client',
          as: 'parasiteControls'
        }
      },
      {
        $addFields: {
          servicesReceived: {
            $setUnion: [
              { $map: { input: '$mobileClinics', as: 'mc', in: 'mobile_clinic' } },
              { $map: { input: '$vaccinations', as: 'v', in: 'vaccination' } },
              { $map: { input: '$equineHealths', as: 'eh', in: 'equine_health' } },
              { $map: { input: '$laboratories', as: 'lab', in: 'laboratory' } },
              { $map: { input: '$parasiteControls', as: 'pc', in: 'parasite_control' } }
            ]
          },
          birthDateFromForms: {
            $let: {
              vars: {
                vaccinationBirthDate: { $arrayElemAt: ['$vaccinations.client.birthDate', 0] },
                laboratoryBirthDate: { $arrayElemAt: ['$laboratories.clientBirthDate', 0] },
                mobileClinicBirthDate: { $arrayElemAt: ['$mobileClinics.client.birthDate', 0] }
              },
              in: {
                $cond: [
                  { $ne: ['$$vaccinationBirthDate', null] },
                  '$$vaccinationBirthDate',
                  {
                    $cond: [
                      { $ne: ['$$laboratoryBirthDate', null] },
                      '$$laboratoryBirthDate',
                      '$$mobileClinicBirthDate'
                    ]
                  }
                ]
              }
            }
          },
          totalVisits: {
            $add: [
              { $size: '$mobileClinics' },
              { $size: '$vaccinations' },
              { $size: '$equineHealths' },
              { $size: '$laboratories' },
              { $size: '$parasiteControls' }
            ]
          },
          lastServiceDate: {
            $max: {
              $concatArrays: [
                { $map: { input: '$mobileClinics', as: 'mc', in: '$$mc.date' } },
                { $map: { input: '$vaccinations', as: 'v', in: '$$v.date' } },
                { $map: { input: '$equineHealths', as: 'eh', in: '$$eh.date' } },
                { $map: { input: '$laboratories', as: 'lab', in: '$$lab.date' } },
                { $map: { input: '$parasiteControls', as: 'pc', in: '$$pc.date' } }
              ]
            }
          }
        }
      },
      {
        $addFields: {
          totalAnimals: {
            $sum: {
              $map: {
                input: '$animals',
                as: 'animal',
                in: '$$animal.animalCount'
              }
            }
          }
        }
      }
    ];

    applyServicesMatch(pipeline, servicesFilter);
    applyTotalAnimalsMatch(pipeline, totalAnimalsRange);

    pipeline.push(
      {
        $lookup: {
          from: 'villages',
          localField: 'village',
          foreignField: '_id',
          as: 'villageInfo'
        }
      },
      {
        $addFields: {
          village: {
            $cond: [
              { $gt: [{ $size: '$villageInfo' }, 0] },
              { $arrayElemAt: ['$villageInfo', 0] },
              '$village'
            ]
          }
        }
      },
      {
        $project: {
          villageInfo: 0,
          mobileClinics: 0,
          vaccinations: 0,
          equineHealths: 0,
          laboratories: 0,
          parasiteControls: 0
        }
      },
      { $sort: { createdAt: -1 } }
    );

    const records = await Client.aggregate(pipeline);
    
    logger.info('Clients Export - Found clients matching filter', { count: records.length });
    logger.info('Export pipeline', { data: JSON.stringify(pipeline, null, 2) });

    const transformedRecords = records.map(record => {
      const birthDateValue = record.birthDate || record.birthDateFromForms;
      const formatDate = (value) => {
        if (!value) return '';
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
      };

      // Map services to Arabic names
      const serviceNames = {
        'mobile_clinic': 'العيادة المتنقلة',
        'vaccination': 'التحصين',
        'equine_health': 'صحة الخيول',
        'laboratory': 'المختبر',
        'parasite_control': 'مكافحة الطفيليات'
      };
      
      const servicesText = (record.servicesReceived || [])
        .map(service => serviceNames[service] || service)
        .join(', ') || 'لا توجد خدمات';

      // Get village name and code
      const villageName = (() => {
        if (!record.village) return 'غير محدد';
        if (typeof record.village === 'object') {
          return record.village.nameArabic || record.village.nameEnglish || record.village.name || 'غير محدد';
        }
        return record.village;
      })();
      
      const villageCode = (() => {
        if (record.village && typeof record.village === 'object') {
          return record.village.serialNumber || '';
        }
        return '';
      })();
      
      return {
        'الرقم القومي': record.nationalId || '',
        'الاسم': record.name || '',
        'رقم الهاتف': record.phone || '',
        'القرية': villageName,
        'رمز القرية': villageCode,
        'تاريخ الميلاد': formatDate(birthDateValue),
        'الخدمات المستلمة': servicesText,
        'إجمالي الزيارات': record.totalVisits || 0,
        'آخر خدمة': formatDate(record.lastServiceDate)
      };
    });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(transformedRecords);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=clients-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } else if (format === 'excel') {
      const XLSX = require('xlsx');
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(transformedRecords);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'المربيين');
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=clients-${new Date().toISOString().split('T')[0]}.xlsx`);
      res.send(excelBuffer);
    } else {
      res.json({
        success: true,
        data: { records: transformedRecords }
      });
    }
  } catch (error) {
    logger.error('Error exporting clients records:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error exporting clients records',
      error: error.message
    });
  }
});

router.get('/vaccination/export', auth, async (req, res) => {
  try {
    const { format = 'excel' } = req.query;
    
    const filter = filterBuilder.buildVaccinationFilter(req.query);

    const records = await Vaccination.find(filter)
      .populate({
        path: 'client',
        select: 'name nationalId phone village detailedAddress birthDate',
        populate: {
          path: 'village',
          select: 'nameArabic nameEnglish arabicName englishName name value label sector serialNumber'
        }
      })
      .populate('holdingCode', 'code village description isActive')
      .sort({ serialNo: 1 }); // Sort by serialNo ascending

    // Transform data for export to match table columns exactly
    const transformedRecords = records.map(record => {
      const herdCounts = record.herdCounts || {};
      
      return {
        'Serial No': record.serialNo,
        'Date': record.date ? record.date.toISOString().split('T')[0] : '',
        'Name': record.client?.name || '',
        'ID': record.client?.nationalId || '',
        'Birth Date': record.client?.birthDate ? record.client.birthDate.toISOString().split('T')[0] : '',
        'Phone': record.client?.phone || '',
        'Holding Code': record.holdingCode?.code || '',
        'Location': resolveRecordLocation(record, [
          'herdLocation',
          'farmLocation',
          'location',
          'clientVillage'
        ]),
        'N': (() => {
          if (record.coordinates) {
            if (typeof record.coordinates === 'string') {
              try {
                const parsed = JSON.parse(record.coordinates);
                return parsed.latitude || '';
              } catch (e) {
                return '';
              }
            }
            return record.coordinates.latitude || '';
          }
          return '';
        })(),
        'E': (() => {
          if (record.coordinates) {
            if (typeof record.coordinates === 'string') {
              try {
                const parsed = JSON.parse(record.coordinates);
                return parsed.longitude || '';
              } catch (e) {
                return '';
              }
            }
            return record.coordinates.longitude || '';
          }
          return '';
        })(),
        'Supervisor': record.supervisor || '',
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
        'Herd Number': record.herdNumber || 0,
        'Herd Females': record.herdFemales || 0,
        'Total Vaccinated': record.totalVaccinated || 0,
        'Herd Health': record.herdHealth || '',
        'Animals Handling': record.animalsHandling || '',
        'Labours ': record.labours || '',
        'Reachable Location': record.reachableLocation || '',
        'Request Date': record.request?.date ? record.request.date.toISOString().split('T')[0] : '',
        'Situation': record.request?.situation || '',
        'Request Fulfilling Date': record.request?.fulfillingDate ? record.request.fulfillingDate.toISOString().split('T')[0] : '',
        'Vaccine': record.vaccineType || '',
        'Section': record.vaccineCategory || ''
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
        data: { records: transformedRecords }
      });
    }
  } catch (error) {
    logger.error('Error exporting vaccination records:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error exporting vaccination records',
      error: error.message
    });
  }
});

router.get('/parasite-control/export', auth, async (req, res) => {
  try {
    const { format = 'excel' } = req.query;
    
    const filter = filterBuilder.buildParasiteControlFilter(req.query);

    const records = await ParasiteControl.find(filter)
      .populate({
        path: 'client',
        select: 'name nationalId phone village detailedAddress birthDate',
        populate: {
          path: 'village',
          select: 'nameArabic nameEnglish sector serialNumber'
        }
      })
      .populate('holdingCode', 'code village description isActive')
      .sort({ serialNo: 1 }); // Sort by serialNo ascending

    // Transform data for export to match table columns exactly
    const transformedRecords = records.map(record => {
      const herdCounts = record.herdCounts || {};
      
      // Calculate totals
      const totalYoung = (herdCounts.sheep?.young || 0) + (herdCounts.goats?.young || 0) + 
                        (herdCounts.camel?.young || 0) + (herdCounts.cattle?.young || 0) + 
                        (herdCounts.horse?.young || 0);
      const totalFemale = (herdCounts.sheep?.female || 0) + (herdCounts.goats?.female || 0) + 
                         (herdCounts.camel?.female || 0) + (herdCounts.cattle?.female || 0) + 
                         (herdCounts.horse?.female || 0);
      const totalTreated = (herdCounts.sheep?.treated || 0) + (herdCounts.goats?.treated || 0) + 
                          (herdCounts.camel?.treated || 0) + (herdCounts.cattle?.treated || 0) + 
                          (herdCounts.horse?.treated || 0);
      const totalHerd = (herdCounts.sheep?.total || 0) + (herdCounts.goats?.total || 0) + 
                       (herdCounts.camel?.total || 0) + (herdCounts.cattle?.total || 0) + 
                       (herdCounts.horse?.total || 0);
      
      return {
        'Serial No': record.serialNo,
        'Date': record.date ? record.date.toISOString().split('T')[0] : '',
        'Name': record.client?.name || '',
        'ID': record.client?.nationalId || '',
        'Date of Birth': record.client?.birthDate ? record.client.birthDate.toISOString().split('T')[0] : '',
        'Phone': record.client?.phone || '',
        'Holding Code': record.holdingCode?.code || '',
        'Holding Code Village': extractVillageName(record.holdingCode?.village) || '',
        'Location': resolveRecordLocation(record, [
          'herdLocation',
          'farmLocation',
          'location',
          'customImportData.village',
          'customImportData.location',
          'owner.village',
          'clientVillage'
        ]),
        'E': (() => {
          if (record.coordinates) {
            if (typeof record.coordinates === 'string') {
              try {
                const parsed = JSON.parse(record.coordinates);
                return parsed.longitude || '';
              } catch (e) {
                return '';
              }
            }
            return record.coordinates.longitude || '';
          }
          return '';
        })(),
        'N': (() => {
          if (record.coordinates) {
            if (typeof record.coordinates === 'string') {
              try {
                const parsed = JSON.parse(record.coordinates);
                return parsed.latitude || '';
              } catch (e) {
                return '';
              }
            }
            return record.coordinates.latitude || '';
          }
          return '';
        })(),
        'Supervisor': record.supervisor || '',
        'Vehicle No.': record.vehicleNo || '',
        'Total Sheep': herdCounts.sheep?.total || 0,
        'Young sheep': herdCounts.sheep?.young || 0,
        'Female Sheep': herdCounts.sheep?.female || 0,
        'Treated Sheep': herdCounts.sheep?.treated || 0,
        'Total Goats': herdCounts.goats?.total || 0,
        'Young Goats': herdCounts.goats?.young || 0,
        'Female Goats': herdCounts.goats?.female || 0,
        'Treated Goats': herdCounts.goats?.treated || 0,
        'Total Camel': herdCounts.camel?.total || 0,
        'Young Camels': herdCounts.camel?.young || 0,
        'Female Camels': herdCounts.camel?.female || 0,
        'Treated Camels': herdCounts.camel?.treated || 0,
        'Total Cattle': herdCounts.cattle?.total || 0,
        'Young Cattle': herdCounts.cattle?.young || 0,
        'Female Cattle': herdCounts.cattle?.female || 0,
        'Treated Cattle': herdCounts.cattle?.treated || 0,
        'Total Herd': totalHerd,
        'Total Young': totalYoung,
        'Total Female': totalFemale,
        'Total Treated': totalTreated,
        'Type': record.insecticide?.type || '',
        'Volume (ml)': record.insecticide?.volumeMl || 0,
        'Category': record.insecticide?.category || '',
        'Status': record.insecticide?.status || '',
        'Size (sqM)': record.animalBarnSizeSqM || 0,
        'Insecticide': (() => {
          if (record.breedingSites) {
            if (typeof record.breedingSites === 'string') {
              try {
                const parsed = JSON.parse(record.breedingSites);
                if (Array.isArray(parsed)) {
                  const sites = parsed.map(site => {
                    if (typeof site === 'string' && site.trim()) return site;
                    
                    const parts = [];
                    if (site.type && site.type !== 'Not Available' && site.type.trim()) {
                      parts.push(site.type);
                    }
                    if (site.area && site.area > 0) {
                      parts.push(`المساحة: ${site.area} م²`);
                    }
                    if (site.treatment && site.treatment.trim()) {
                      parts.push(`المعالجة: ${site.treatment}`);
                    }
                    
                    return parts.length > 0 ? parts.join(' - ') : null;
                  }).filter(Boolean);
                  
                  return sites.length > 0 ? sites.join(' | ') : '';
                }
              } catch (error) {
                return record.breedingSites;
              }
            }
            return record.breedingSites;
          }
          return '';
        })(),
        'Volume': record.parasiteControlVolume || 0,
        'Status ': record.parasiteControlStatus || '',
        'Herd Health Status': record.herdHealthStatus || '',
        'Complying to instructions': record.complyingToInstructions || 'Comply',
        'Request Date': record.request?.date ? record.request.date.toISOString().split('T')[0] : '',
        'Request Situation': record.request?.situation || '',
        'Request Fulfilling Date': record.request?.fulfillingDate ? record.request.fulfillingDate.toISOString().split('T')[0] : '',
        '': '', // Empty column as per your headers
        'Remarks': record.remarks || ''
      };
    });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(transformedRecords);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=parasite-control-records.csv');
      res.send(csv);
    } else if (format === 'excel') {
      const XLSX = require('xlsx');
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(transformedRecords);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Parasite Control Records');
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=parasite-control-records.xlsx');
      res.send(excelBuffer);
    } else {
      res.json({
        success: true,
        data: { records: transformedRecords }
      });
    }
  } catch (error) {
    logger.error('Error exporting parasite control records:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error exporting parasite control records',
      error: error.message
    });
  }
});

router.get('/mobile-clinics/export', auth, async (req, res) => {
  try {
    const { format = 'excel' } = req.query;
    
    const filter = filterBuilder.buildMobileClinicFilter(req.query);

    const records = await MobileClinic.find(filter)
      .populate({
        path: 'client',
        select: 'name nationalId phone village detailedAddress birthDate',
        populate: {
          path: 'village',
          select: 'nameArabic nameEnglish arabicName englishName name value label sector serialNumber'
        }
      })
      .populate('holdingCode', 'code village description isActive')
      .sort({ serialNo: 1 }); // Sort by serialNo ascending

    // Transform data for export to match table columns exactly
    const transformedRecords = records.map(record => {
      const animalCounts = record.animalCounts || {};
      
      return {
        'Serial No': record.serialNo,
        'Date': record.date ? record.date.toISOString().split('T')[0] : '',
        'Name': record.client?.name || '',
        'ID': record.client?.nationalId || '',
        'Birth Date': record.client?.birthDate ? record.client.birthDate.toISOString().split('T')[0] : '',
        'Phone': record.client?.phone || '',
        'Holding Code': record.holdingCode?.code || '',
        'Location': resolveRecordLocation(record, [
          'clientVillage',
          'farmLocation',
          'location',
          'visitLocation',
          'request.location'
        ]),
        'N ': (() => {
          if (record.coordinates) {
            if (typeof record.coordinates === 'string') {
              try {
                const parsed = JSON.parse(record.coordinates);
                return parsed.latitude || '';
              } catch (e) {
                return '';
              }
            }
            return record.coordinates.latitude || '';
          }
          return '';
        })(),
        'E ': (() => {
          if (record.coordinates) {
            if (typeof record.coordinates === 'string') {
              try {
                const parsed = JSON.parse(record.coordinates);
                return parsed.longitude || '';
              } catch (e) {
                return '';
              }
            }
            return record.coordinates.longitude || '';
          }
          return '';
        })(),
        'Supervisor': record.supervisor || '',
        'Vehicle No.': record.vehicleNo || '',
        'Sheep': animalCounts.sheep || 0,
        'Goats': animalCounts.goats || 0,
        'Camel': animalCounts.camel || 0,
        'Horse': animalCounts.horse || 0,
        'Cattle': animalCounts.cattle || 0,
        'Diagnosis': record.diagnosis || '',
        'Intervention Category': (() => {
          if (Array.isArray(record.interventionCategories) && record.interventionCategories.length > 0) {
            return record.interventionCategories.join(' | ');
          }
          return record.interventionCategory || '';
        })(),
        'Treatment': record.treatment || '',
        'Request Date': record.request?.date ? record.request.date.toISOString().split('T')[0] : '',
        'Request Status': record.request?.situation || '',
        'Request Fulfilling Date': record.request?.fulfillingDate ? record.request.fulfillingDate.toISOString().split('T')[0] : '',
        'Treatment ': record.medicationsUsed || '',
        'Remarks': record.remarks || '',
        'Location ': extractVillageName(record.farmLocation) || '',
        'Mobile': record.followUpRequired ? 'Yes' : 'No'
      };
    });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(transformedRecords);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=mobile-clinics-records.csv');
      res.send(csv);
    } else if (format === 'excel') {
      const XLSX = require('xlsx');
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(transformedRecords);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Mobile Clinics Records');
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=mobile-clinics-records.xlsx');
      res.send(excelBuffer);
    } else {
      res.json({
        success: true,
        data: { records: transformedRecords }
      });
    }
  } catch (error) {
    logger.error('Error exporting mobile clinics records:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error exporting mobile clinics records',
      error: error.message
    });
  }
});

router.get('/laboratories/export', auth, async (req, res) => {
  try {
    const { format = 'excel' } = req.query;
    
    const filter = filterBuilder.buildLaboratoryFilter(req.query);

    const records = await Laboratory.find(filter)
      .populate({
        path: 'client',
        select: 'name nationalId phone village detailedAddress birthDate',
        populate: {
          path: 'village',
          select: 'nameArabic nameEnglish arabicName englishName name value label sector serialNumber'
        }
      })
      .sort({ serialNo: 1 }); // Sort by serialNo ascending

    // Transform data for export to match table columns exactly
    const transformedRecords = records.map(record => {
      const speciesCounts = record.speciesCounts || {};
      
      return {
        'Serial ': record.serialNo,
        'date': record.date ? record.date.toISOString().split('T')[0] : '',
        'Sample Code': record.sampleCode || '',
        'Name': record.clientName || record.client?.name || '',
        'ID': record.clientId || record.client?.nationalId || '',
        'Birth Date': (() => {
          const birthDate = record.clientBirthDate || record.client?.birthDate;
          if (birthDate) {
            try {
              return new Date(birthDate).toISOString().split('T')[0];
            } catch (e) {
              return '';
            }
          }
          return '';
        })(),
        'phone': record.clientPhone || record.client?.phone || '',
        'Location': resolveRecordLocation(record, [
          'farmLocation',
          'location',
          'clientVillage'
        ]),
        'N': (() => {
          if (record.coordinates) {
            if (typeof record.coordinates === 'string') {
              try {
                const parsed = JSON.parse(record.coordinates);
                return parsed.latitude || '';
              } catch (e) {
                return '';
              }
            }
            return record.coordinates.latitude || '';
          }
          return '';
        })(),
        'E': (() => {
          if (record.coordinates) {
            if (typeof record.coordinates === 'string') {
              try {
                const parsed = JSON.parse(record.coordinates);
                return parsed.longitude || '';
              } catch (e) {
                return '';
              }
            }
            return record.coordinates.longitude || '';
          }
          return '';
        })(),
        'Sheep': speciesCounts.sheep || 0,
        'Goats': speciesCounts.goats || 0,
        'Camel': speciesCounts.camel || 0,
        'Horse': speciesCounts.horse || 0,
        'Cattle': speciesCounts.cattle || 0,
        'Other (Species)': speciesCounts.other || '',
        'Sample Collector': record.collector || '',
        '': '', // Empty column as per header
        'Sample Type': record.sampleType || '',
        'Samples Number': record.sampleNumber || '',
        'Test Type': record.testType || '',
        'positive cases': record.positiveCases || 0,
        'Negative Cases': record.negativeCases || 0,
        'Remarks': record.remarks || ''
      };
    });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(transformedRecords);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=laboratories-records.csv');
      res.send(csv);
    } else if (format === 'excel') {
      const XLSX = require('xlsx');
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(transformedRecords);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Laboratories Records');
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=laboratories-records.xlsx');
      res.send(excelBuffer);
    } else {
      res.json({
        success: true,
        data: { records: transformedRecords }
      });
    }
  } catch (error) {
    logger.error('Error exporting laboratories records:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error exporting laboratories records',
      error: error.message
    });
  }
});

router.get('/equine-health/export', auth, async (req, res) => {
  try {
    const { format = 'excel' } = req.query;
    
    const filter = filterBuilder.buildEquineHealthFilter(req.query);

    const records = await EquineHealth.find(filter)
      .populate({
        path: 'client',
        select: 'name nationalId phone village detailedAddress birthDate',
        populate: {
          path: 'village',
          select: 'nameArabic nameEnglish arabicName englishName name value label sector serialNumber'
        }
      })
      .populate('holdingCode', 'code village description isActive')
      .sort({ serialNo: 1 }); // Sort by serialNo ascending

    // Transform data for export to match table columns exactly
    const transformedRecords = records.map(record => {
      return {
        'Serial No': record.serialNo,
        'Date': record.date ? record.date.toISOString().split('T')[0] : '',
        'Name': record.client?.name || '',
        'ID': record.client?.nationalId || '',
        'Birth Date': record.client?.birthDate ? record.client.birthDate.toISOString().split('T')[0] : '',
        'Phone': record.client?.phone || '',
        'Location': resolveRecordLocation(record, [
          'farmLocation',
          'location',
          'clientVillage',
          'owner.village'
        ]),
        'N Coordinate': (() => {
          if (record.coordinates) {
            if (typeof record.coordinates === 'string') {
              try {
                const parsed = JSON.parse(record.coordinates);
                return parsed.latitude || '';
              } catch (e) {
                return '';
              }
            }
            return record.coordinates.latitude || '';
          }
          return '';
        })(),
        'E Coordinate': (() => {
          if (record.coordinates) {
            if (typeof record.coordinates === 'string') {
              try {
                const parsed = JSON.parse(record.coordinates);
                return parsed.longitude || '';
              } catch (e) {
                return '';
              }
            }
            return record.coordinates.longitude || '';
          }
          return '';
        })(),
        'Diagnosis': record.diagnosis || '',
        'Intervention Category': record.interventionCategory || '',
        'Treatment': record.treatment || '',
        'Request Date': record.request?.date ? record.request.date.toISOString().split('T')[0] : '',
        'Request Status': record.request?.situation || '',
        'Request Fulfilling Date': record.request?.fulfillingDate ? record.request.fulfillingDate.toISOString().split('T')[0] : '',
        '': '', // Empty column 1
        ' ': '', // Empty column 2
        '  ': '', // Empty column 3
        'category': (() => {
          if (Array.isArray(record.interventionCategories) && record.interventionCategories.length > 0) {
            return record.interventionCategories[0];
          }
          return record.interventionCategory || '';
        })(),
        'Remarks': record.remarks || ''
      };
    });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const parser = new Parser();
      const csv = parser.parse(transformedRecords);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=equine-health-records.csv');
      res.send(csv);
    } else if (format === 'excel') {
      const XLSX = require('xlsx');
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(transformedRecords);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Equine Health Records');
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=equine-health-records.xlsx');
      res.send(excelBuffer);
    } else {
      res.json({
        success: true,
        data: { records: transformedRecords }
      });
    }
  } catch (error) {
    logger.error('Error exporting equine health records:', { error: error });
    res.status(500).json({
      success: false,
      message: 'Error exporting equine health records',
      error: error.message
    });
  }
});

// Template routes
router.get('/clients/template', auth, handleTemplate([
  {
    'Name': 'عطا الله ابراهيم البلوي',
    'National ID': '1028544243',
    'Birth Date': '7/19/1958',
    'Phone': '501834996',
    'Village': 'فضلا',
    'Village Sector': 'القطاع الأول',
    'Village Serial Number': 'V001',
    'Total Animals': '10',
    'Created Date': '2024-01-01',
    'Updated Date': '2024-01-01'
  }
], 'clients-template'));

router.get('/vaccination/template', auth, handleTemplate([
  {
    'Serial No': '1',
    'Date': '2024-09-01',
    'Name': 'سعد رجاء ناهض البلوي',
    'ID': '1004458947',
    'Birth Date': '1961-08-12',
    'Phone': '0543599283',
    'Holding Code': '6820030001222',
    'Location': 'ابو خريط',
    'N': '26.263183',
    'E': '37.974167',
    'Supervisor': 'M.Tahir',
    'Vehicle No.': 'V1',
    'Sheep': '67',
    'F. Sheep': '49',
    'Vaccinated Sheep': '57',
    'Goats': '33',
    'F.Goats': '29',
    'Vaccinated Goats': '33',
    'Camel': '0',
    'F. Camel': '0',
    'Vaccinated Camels': '0',
    'Cattel': '0',
    'F. Cattle': '0',
    'Vaccinated Cattle': '0',
    'Herd Number': '100',
    'Herd Females': '78',
    'Total Vaccinated': '90',
    'Herd Health': 'Healthy',
    'Animals Handling': 'Easy handling',
    'Labours ': 'Available',
    'Reachable Location': 'Easy',
    'Request Date': '2024-08-31',
    'Situation': 'Closed',
    'Request Fulfilling Date': '2024-09-01',
    'Vaccine': 'PPR',
    'Section': 'Vaccination'
  }
], 'vaccination-template'));

router.get('/parasite-control/template', auth, handleTemplate([
  {
    'Serial No': '1',
    'Date': '2024-08-24',
    'Name': 'زعل عبد الله سليمان البلوي',
    'ID': '1038582498',
    'Date of Birth': '1946-05-11',
    'Phone': '0508762550',
    'Holding Code': '6820030001222',
    'Holding Code Village': 'كتيفه',
    'Location': 'كتيفه',
    'E': '38.080037',
    'N': '26.080534',
    'Supervisor': 'Ibrahim',
    'Vehicle No.': 'P1',
    'Total Sheep': '32',
    'Young sheep': '0',
    'Female Sheep': '27',
    'Treated Sheep': '32',
    'Total Goats': '85',
    'Young Goats': '0',
    'Female Goats': '0',
    'Treated Goats': '85',
    'Total Camel': '0',
    'Young Camels': '0',
    'Female Camels': '0',
    'Treated Camels': '0',
    'Total Cattle': '0',
    'Young Cattle': '0',
    'Female Cattle': '0',
    'Treated Cattle': '0',
    'Total Horse': '0',
    'Young Horse': '0',
    'Female Horse': '0',
    'Treated Horse': '0',
    'Total Herd': '117',
    'Total Young': '0',
    'Total Female': '27',
    'Total Treated': '117',
    'Insecticide Used': 'Albendazole 2.5%',
    'Type': 'Clinical Examination',
    'Volume (ml)': '100',
    'Category': 'Internal Parasite',
    'Status': 'Sprayed',
    'Size (sqM)': '50',
    'Herd Health Status': 'Healthy',
    'Complying to instructions': 'Comply',
    'Request Date': '2024-08-21',
    'Request Situation': 'Closed',
    'Request Fulfilling Date': '2024-08-24',
    'Remarks': 'Internal Parasite Campaign'
  }
], 'parasite-control-template'));

router.get('/mobile-clinics/template', auth, handleTemplate([
  {
    'Serial No': '1',
    'Date': '2024-08-24',
    'Name': 'عطا الله ابراهيم البلوي',
    'ID': '1028544243',
    'Birth Date': '1958-07-19',
    'Phone': '0501834996',
    'Holding Code': '6820030001295',
    'Location': 'فضلا',
    'N ': '26.37038',
    'E ': '37.84097',
    'Supervisor': 'kandil',
    'Vehicle No.': 'C2',
    'Sheep': '2',
    'Goats': '1',
    'Camel': '0',
    'Horse': '0',
    'Cattle': '0',
    'Diagnosis': 'Pneumonia',
    'Intervention Category': 'Clinical Examination',
    'Treatment': 'Zuprevo, Meloxicam',
    'Request Date': '2024-08-24',
    'Request Status': 'Closed',
    'Request Fulfilling Date': '2024-08-24',
    'Treatment ': 'Zuprevo, Meloxicam',
    'Remarks': 'Mobile clinic treatment',
    'Location ': 'فضلا',
    'Mobile': 'Yes'
  }
], 'mobile-clinics-template'));

router.get('/laboratories/template', auth, handleTemplate([
  {
    'Serial ': '1',
    'date': '2024-08-24',
    'Sample Code': 'LAB-001',
    'Name': 'عطا الله ابراهيم البلوي',
    'ID': '1028544243',
    'Birth Date': '1958-07-19',
    'phone': '0501834996',
    'Location': 'فضلا',
    'N': '26.37038',
    'E': '37.84097',
    'Sheep': '2',
    'Goats': '1',
    'Camel': '0',
    'Horse': '0',
    'Cattle': '0',
    'Other (Species)': '',
    'Sample Collector': 'kandil',
    '': '',
    'Sample Type': 'Blood',
    'Samples Number': 'S001',
    'Test Type': 'Brucella ICT',
    'positive cases': '0',
    'Negative Cases': '3',
    'Remarks': 'All tests negative'
  }
], 'laboratories-template'));

router.get('/equine-health/template', auth, handleTemplate([
  {
    'Serial No': '1',
    'Date': '2024-08-24',
    'Name': 'عطا الله ابراهيم البلوي',
    'ID': '1028544243',
    'Birth Date': '1958-07-19',
    'Phone': '0501834996',
    'Location': 'فضلا',
    'N Coordinate': '26.37038',
    'E Coordinate': '37.84097',
    'Diagnosis': 'فحص روتيني',
    'Intervention Category': 'Clinical Examination',
    'Treatment': 'علاج وقائي',
    'Request Date': '2024-08-24',
    'Request Status': 'Closed',
    'Request Fulfilling Date': '2024-08-24',

    'category': 'Clinical Examination',
    'Remarks': 'تم الفحص بنجاح'
  }
], 'equine-health-template'));

// Import routes
router.post('/clients/import', auth, handleImport(Client, async (row, userId, errors) => {
  try {
    const client = new Client({
      name: row.name || row.client_name,
      nationalId: row.nationalId || row.client_id,
      phone: row.phone || row.client_phone,
      village: row.village || row.client_village,
      animals: [],
      availableServices: [],
      createdBy: userId
    });

    await client.save();
    return client;
  } catch (error) {
    throw new Error(`Error processing client row: ${error.message}`);
  }
}));

router.post('/vaccination/import', auth, handleImport(Vaccination, processVaccinationRow));
router.post('/parasite-control/import', auth, handleImport(ParasiteControl, processParasiteControlRow));
router.post('/mobile-clinics/import', auth, handleImport(MobileClinic, processMobileClinicRow));
router.post('/laboratories/import', auth, handleImport(Laboratory, processLaboratoryRow));
router.post('/equine-health/import', auth, handleImport(EquineHealth, processEquineHealthRow));

// Enhanced import routes with better error handling
router.post('/laboratories/import-enhanced', auth, (req, res, next) => {
  logger.info('Enhanced laboratories import route called');
  handleImport(Laboratory, processLaboratoryRow)(req, res, next);
});

router.post('/equine-health/import-enhanced', auth, (req, res, next) => {
  logger.info('Enhanced equine health import route called');
  handleImport(EquineHealth, processEquineHealthRow)(req, res, next);
});

// Inventory routes (placeholder - will be implemented when inventory model is available)
router.get('/inventory/export', auth, (req, res) => {
  res.json({
    success: false,
    message: 'Inventory export not implemented yet'
  });
});

router.get('/inventory/template', auth, (req, res) => {
  res.json({
    success: false,
    message: 'Inventory template not implemented yet'
  });
});

router.post('/inventory/import', auth, (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Inventory import not implemented yet'
  });
});

// Dromo import routes
router.post('/laboratories/import-dromo', auth, (req, res, next) => {
  logger.info('Dromo laboratories import route called');
  handleImport(Laboratory, processLaboratoryRow)(req, res, next);
});

router.post('/vaccination/import-dromo', auth, (req, res, next) => {
  logger.info('Dromo vaccination import route called');
  handleImport(Vaccination, processVaccinationRow)(req, res, next);
});

router.post('/parasite-control/import-dromo', auth, (req, res, next) => {
  logger.info('Dromo parasite control import route called');
  handleImport(ParasiteControl, processParasiteControlRow)(req, res, next);
});

router.post('/mobile-clinics/import-dromo', auth, (req, res, next) => {
  logger.info('Dromo mobile clinics import route called');
  handleImport(MobileClinic, processMobileClinicRow)(req, res, next);
});

router.post('/equine-health/import-dromo', auth, (req, res, next) => {
  logger.info('Dromo equine health import route called');
  handleImport(EquineHealth, processEquineHealthRow)(req, res, next);
});

module.exports = router;
