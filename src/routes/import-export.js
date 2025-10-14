const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const mongoose = require('mongoose');

// Import middleware
const { auth } = require('../middleware/auth');

// Import models
const Client = require('../models/Client');
const Vaccination = require('../models/Vaccination');
const ParasiteControl = require('../models/ParasiteControl');
const MobileClinic = require('../models/MobileClinic');
const Laboratory = require('../models/Laboratory');
const EquineHealth = require('../models/EquineHealth');

const router = express.Router();

// Arabic headers mapping for better user experience
const arabicHeaders = {
  // Clients
  'name': 'الاسم',
  'nationalId': 'رقم الهوية',
  'phone': 'رقم الهاتف',
  'email': 'البريد الإلكتروني',
  'village': 'القرية',
  'detailedAddress': 'العنوان التفصيلي',
  'status': 'الحالة',
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
      console.log(`📊 CSV Headers:`, headers);
      
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          console.log(`📊 Row ${i}:`, Object.keys(row), Object.values(row));
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
      
      console.log(`📊 Excel Headers:`, Object.keys(jsonData[0] || {}));
      
      // Convert Excel data to same format as CSV
      jsonData.forEach((row, index) => {
        console.log(`📊 Excel Row ${index + 1}:`, Object.keys(row), Object.values(row));
        results.push(row);
      });
    } else {
      throw new Error('Unsupported file format. Please use CSV or Excel files.');
    }
    
    console.log(`📊 Successfully parsed ${results.length} rows from ${fileName}`);
    return results;
  } catch (error) {
    console.error('Error parsing file:', error);
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
  
  console.log(`🔍 Total rows to validate: ${data.length}`);
  console.log(`🔍 First row keys:`, data[0] ? Object.keys(data[0]) : 'No data');
  
  // Check for required fields based on model
  const requiredFields = getRequiredFields(Model);
  console.log(`🔍 Required fields for ${Model.modelName}:`, requiredFields);
  
  data.forEach((row, index) => {
    console.log(`🔍 Validating row ${index + 1}:`, Object.keys(row));
    console.log(`🔍 Row data sample:`, Object.entries(row).slice(0, 3)); // Show first 3 fields
    console.log(`🔍 Full row data:`, row); // Show all data for debugging
    
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
        ...(field === 'Name' ? ['اسم', 'الاسم', 'اسم المالك', 'اسم المالك'] : []),
        ...(field === 'Date' ? ['تاريخ', 'التاريخ', 'تاريخ التقرير'] : []),
        // Common variations
        ...(field === 'Name' ? ['Client Name', 'clientName', 'client_name', 'owner_name', 'ownerName', 'اسم العميل', 'اسم المالك', 'Name', 'name'] : []),
        ...(field === 'Date' ? ['Report Date', 'reportDate', 'report_date', 'visit_date', 'visitDate', 'تاريخ التقرير', 'تاريخ الزيارة', 'Date', 'date'] : []),
        // Excel common column names
        ...(field === 'Name' ? ['Name', 'name', 'NAME', 'اسم', 'الاسم'] : []),
        ...(field === 'Date' ? ['Date', 'date', 'DATE', 'تاريخ', 'التاريخ'] : [])
      ];
      
      console.log(`🔍 Checking field '${field}' with variants:`, fieldVariants);
      
      const hasField = fieldVariants.some(variant => {
        const value = row[variant];
        const hasValue = value && value.toString().trim() !== '';
        console.log(`  - Variant '${variant}': ${value} (hasValue: ${hasValue})`);
        return hasValue;
      });
      
      // Additional check: look for any field that might contain the required data
      if (!hasField && (field === 'Name' || field === 'Date')) {
        console.log(`🔍 Searching for ${field} in all row keys...`);
        const allKeys = Object.keys(row);
        const foundKey = allKeys.find(key => {
          const value = row[key];
          const hasValue = value && value.toString().trim() !== '';
          console.log(`  - Checking key '${key}': ${value} (hasValue: ${hasValue})`);
          return hasValue;
        });
        
        if (foundKey) {
          console.log(`✅ Found ${field} data in key '${foundKey}'`);
          // Don't add error if we found the data
          return;
        }
      }
      
      // Special handling for Date field - check if we found it but it's not in the first loop
      if (field === 'Date' && !hasField) {
        console.log(`🔍 Special Date check - looking for any date-like field...`);
        const allKeys = Object.keys(row);
        const dateLikeKeys = allKeys.filter(key => {
          const value = row[key];
          if (!value || value.toString().trim() === '') return false;
          
          const valueStr = value.toString().trim();
          console.log(`🔍 Checking key '${key}' for date: ${valueStr}`);
          // Check if it looks like a date (D-Mon format or other date formats)
          if (valueStr.match(/^\d{1,2}-[A-Za-z]{3}$/)) {
            console.log(`🔍 Found D-Mon date in key '${key}': ${valueStr}`);
            return true;
          }
          if (valueStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
            console.log(`🔍 Found DD/MM/YYYY date in key '${key}': ${valueStr}`);
            return true;
          }
          if (valueStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            console.log(`🔍 Found YYYY-MM-DD date in key '${key}': ${valueStr}`);
            return true;
          }
          // Don't treat pure numbers as dates unless they're in specific date formats
          if (valueStr.match(/^\d{1,2}-\d{1,2}-\d{4}$/) || 
              valueStr.match(/^\d{4}-\d{1,2}-\d{1,2}$/) ||
              valueStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
            console.log(`🔍 Found valid date format in key '${key}': ${valueStr}`);
            return true;
          }
          return false;
        });
        
        if (dateLikeKeys.length > 0) {
          console.log(`✅ Found date-like data in keys: ${dateLikeKeys.join(', ')}`);
          return; // Don't add error
        }
      }
      
      if (!hasField) {
        console.log(`❌ Field '${field}' not found in row ${index + 1}`);
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
        console.log(`✅ Field '${field}' found in row ${index + 1}`);
      }
    });
    
    // Only validate date if Date is a required field and we haven't found it yet
    if (requiredFields.includes('Date')) {
      const dateFields = ['date', 'Date', 'DATE', 'تاريخ', 'التاريخ'];
      let hasValidDate = false;
      
      dateFields.forEach(dateField => {
        if (row[dateField] && !hasValidDate) {
          const dateString = row[dateField].toString().trim();
          console.log(`🔍 Date validation for ${dateField}: ${dateString}`);
          
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
          
          console.log(`🔍 Parsed date: ${dateValue} (valid: ${!isNaN(dateValue.getTime())})`);
          if (!isNaN(dateValue.getTime())) {
            hasValidDate = true;
          }
        }
      });
      
      // Only add date error if no valid date found AND we don't already have a date error
      if (!hasValidDate) {
        // Check if we already have a date error for this row
        const existingDateError = errors.find(err => 
          err.row === index + 1 && err.field === 'Date'
        );
        if (!existingDateError) {
          errors.push({
            row: index + 1,
            field: 'Date',
            message: 'Date is required and must be in valid format'
          });
        }
      }
    }
    
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

// Get required fields for each model
const getRequiredFields = (Model) => {
  const modelName = Model.modelName;
  
  switch (modelName) {
    case 'Client':
      return ['name', 'nationalId', 'phone'];
    case 'Vaccination':
      return ['Date', 'Name']; // Remove Serial No as it can be auto-generated
    case 'ParasiteControl':
      return ['Date', 'Name']; // Remove Serial No as it can be auto-generated
    case 'MobileClinic':
      return ['Date', 'Name']; // Remove Serial No as it can be auto-generated
    case 'Laboratory':
      return ['Name']; // Remove Sample Code as it can be auto-generated
    case 'EquineHealth':
      return ['Date', 'Name']; // Remove Serial No as it can be auto-generated
    default:
      return ['date']; // Default required field
  }
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
  
  console.log('📊 Available fields in main record:', availableFields);
  console.log('📊 Available fields in client:', clientFields);
  console.log('📊 All available fields:', allAvailableFields);
  
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

  console.log('📊 generateExcel called with:', {
    dataLength: data ? data.length : 0,
    headers: headers
  });

  // Process data to flatten nested objects and arrays
  const processedData = data.map((row, rowIndex) => {
    const processedRow = {};
    
    headers.forEach((header, index) => {
      let value = row[header];
      
      // Check if field exists in client object
      if (value === undefined && row.client && row.client[header] !== undefined) {
        value = row.client[header];
        console.log(`📊 Found field ${header} in client data:`, value);
      }
      
      // Handle animal count fields from nested objects
      if (value === undefined || value === '') {
        console.log(`🔍 Looking for ${header} in row data:`, {
          hasHerdCounts: !!row.herdCounts,
          hasAnimalCounts: !!row.animalCounts,
          hasSpeciesCounts: !!row.speciesCounts,
          herdCounts: row.herdCounts,
          animalCounts: row.animalCounts,
          speciesCounts: row.speciesCounts
        });
        
        if (header === 'sheep' && row.herdCounts && row.herdCounts.sheep) {
          value = row.herdCounts.sheep.total || 0;
          console.log(`✅ Found sheep in herdCounts: ${value}`);
        } else if (header === 'sheepFemale' && row.herdCounts && row.herdCounts.sheep) {
          value = row.herdCounts.sheep.female || 0;
          console.log(`✅ Found sheepFemale in herdCounts: ${value}`);
        } else if (header === 'sheepVaccinated' && row.herdCounts && row.herdCounts.sheep) {
          value = row.herdCounts.sheep.vaccinated || 0;
          console.log(`✅ Found sheepVaccinated in herdCounts: ${value}`);
        } else if (header === 'goats' && row.herdCounts && row.herdCounts.goats) {
          value = row.herdCounts.goats.total || 0;
          console.log(`✅ Found goats in herdCounts: ${value}`);
        } else if (header === 'goatsFemale' && row.herdCounts && row.herdCounts.goats) {
          value = row.herdCounts.goats.female || 0;
          console.log(`✅ Found goatsFemale in herdCounts: ${value}`);
        } else if (header === 'goatsVaccinated' && row.herdCounts && row.herdCounts.goats) {
          value = row.herdCounts.goats.vaccinated || 0;
          console.log(`✅ Found goatsVaccinated in herdCounts: ${value}`);
        } else if (header === 'camel' && row.herdCounts && row.herdCounts.camel) {
          value = row.herdCounts.camel.total || 0;
          console.log(`✅ Found camel in herdCounts: ${value}`);
        } else if (header === 'camelFemale' && row.herdCounts && row.herdCounts.camel) {
          value = row.herdCounts.camel.female || 0;
          console.log(`✅ Found camelFemale in herdCounts: ${value}`);
        } else if (header === 'camelVaccinated' && row.herdCounts && row.herdCounts.camel) {
          value = row.herdCounts.camel.vaccinated || 0;
          console.log(`✅ Found camelVaccinated in herdCounts: ${value}`);
        } else if (header === 'cattle' && row.herdCounts && row.herdCounts.cattle) {
          value = row.herdCounts.cattle.total || 0;
          console.log(`✅ Found cattle in herdCounts: ${value}`);
        } else if (header === 'cattleFemale' && row.herdCounts && row.herdCounts.cattle) {
          value = row.herdCounts.cattle.female || 0;
          console.log(`✅ Found cattleFemale in herdCounts: ${value}`);
        } else if (header === 'cattleVaccinated' && row.herdCounts && row.herdCounts.cattle) {
          value = row.herdCounts.cattle.vaccinated || 0;
          console.log(`✅ Found cattleVaccinated in herdCounts: ${value}`);
        } else if (header === 'herdNumber' && row.herdCounts) {
          value = (row.herdCounts.sheep?.total || 0) + (row.herdCounts.goats?.total || 0) + (row.herdCounts.camel?.total || 0) + (row.herdCounts.cattle?.total || 0);
          console.log(`✅ Calculated herdNumber: ${value}`);
        } else if (header === 'herdFemales' && row.herdCounts) {
          value = (row.herdCounts.sheep?.female || 0) + (row.herdCounts.goats?.female || 0) + (row.herdCounts.camel?.female || 0) + (row.herdCounts.cattle?.female || 0);
          console.log(`✅ Calculated herdFemales: ${value}`);
        } else if (header === 'totalVaccinated' && row.herdCounts) {
          value = (row.herdCounts.sheep?.vaccinated || 0) + (row.herdCounts.goats?.vaccinated || 0) + (row.herdCounts.camel?.vaccinated || 0) + (row.herdCounts.cattle?.vaccinated || 0);
          console.log(`✅ Calculated totalVaccinated: ${value}`);
        }
        // Handle animalCounts for Mobile Clinic
        else if (header === 'sheep' && row.animalCounts && row.animalCounts.sheep) {
          value = row.animalCounts.sheep || 0;
          console.log(`✅ Found sheep in animalCounts: ${value}`);
        } else if (header === 'goats' && row.animalCounts && row.animalCounts.goats) {
          value = row.animalCounts.goats || 0;
          console.log(`✅ Found goats in animalCounts: ${value}`);
        } else if (header === 'camel' && row.animalCounts && row.animalCounts.camel) {
          value = row.animalCounts.camel || 0;
          console.log(`✅ Found camel in animalCounts: ${value}`);
        } else if (header === 'cattle' && row.animalCounts && row.animalCounts.cattle) {
          value = row.animalCounts.cattle || 0;
          console.log(`✅ Found cattle in animalCounts: ${value}`);
        } else if (header === 'horse' && row.animalCounts && row.animalCounts.horse) {
          value = row.animalCounts.horse || 0;
          console.log(`✅ Found horse in animalCounts: ${value}`);
        }
        // Handle speciesCounts for Laboratory
        else if (header === 'sheep' && row.speciesCounts && row.speciesCounts.sheep) {
          value = row.speciesCounts.sheep || 0;
          console.log(`✅ Found sheep in speciesCounts: ${value}`);
        } else if (header === 'goats' && row.speciesCounts && row.speciesCounts.goats) {
          value = row.speciesCounts.goats || 0;
          console.log(`✅ Found goats in speciesCounts: ${value}`);
        } else if (header === 'camel' && row.speciesCounts && row.speciesCounts.camel) {
          value = row.speciesCounts.camel || 0;
          console.log(`✅ Found camel in speciesCounts: ${value}`);
        } else if (header === 'cattle' && row.speciesCounts && row.speciesCounts.cattle) {
          value = row.speciesCounts.cattle || 0;
          console.log(`✅ Found cattle in speciesCounts: ${value}`);
        } else if (header === 'horse' && row.speciesCounts && row.speciesCounts.horse) {
          value = row.speciesCounts.horse || 0;
          console.log(`✅ Found horse in speciesCounts: ${value}`);
        } else if (header === 'otherSpecies' && row.speciesCounts && row.speciesCounts.other) {
          value = row.speciesCounts.other || '';
          console.log(`✅ Found otherSpecies in speciesCounts: ${value}`);
        } else {
          console.log(`❌ Field ${header} not found in any nested object`);
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
      
      if (rowIndex === 0) {
        console.log(`📊 Field ${header}: ${value} (type: ${typeof value})`);
      }
    });
    
    return processedRow;
  });

  console.log('📊 Processed data:', processedData[0]);
  console.log('📊 Processed data keys:', Object.keys(processedData[0]));

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
      
      console.log(`📊 Starting export for ${filename} with filter:`, queryFilter);
      console.log(`📊 Requested fields:`, fields);
      
      // Optimized query with lean() for better performance
      let query = Model.find(queryFilter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) || 1000)
        .lean(); // Use lean() for better performance
      
      // Try to populate client if the model has client field
      try {
        const sampleDoc = await Model.findOne(queryFilter).lean();
        if (sampleDoc && sampleDoc.client) {
          console.log('📊 Client field found, adding populate');
          query = Model.find(queryFilter)
            .populate('client', 'name nationalId phone email village detailedAddress status totalAnimals')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit) || 1000)
            .lean();
        }
      } catch (populateError) {
        // Continue without populate if it fails
        console.warn('Could not populate client field:', populateError.message);
      }
      
      console.log(`📊 Exporting ${filename} with format: ${format}`);
      const records = await query;
      console.log(`📊 Found ${records.length} records to export`);
      
      // Debug: Log first record structure if records exist
      if (records.length > 0) {
        console.log('📊 First record structure:', Object.keys(records[0]));
        console.log('📊 First record data:', JSON.stringify(records[0], null, 2));
        
        if (records[0].client) {
          console.log('📊 Client data structure:', Object.keys(records[0].client));
          console.log('📊 Client data:', JSON.stringify(records[0].client, null, 2));
        }
        
        // Check field mapping using validation function
        const validation = validateFieldMapping(records, fields);
        console.log('📊 Field mapping validation:', validation);
        
        if (!validation.isValid) {
          console.log('⚠️ Field mapping issues:', validation.message);
        } else {
          console.log('✅ All requested fields are available');
        }
      }

      // If no records found, still create a file with headers
      if (records.length === 0) {
        console.log('⚠️ No records found, creating empty file with headers');
        if (format === 'csv') {
          const csvContent = generateCSV([], fields);
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
          res.send(csvContent);
        } else {
          const excelBuffer = generateExcel([], fields);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
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
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
        res.send(excelBuffer);
      }
    } catch (error) {
      console.error('Export error:', error);
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
      console.error('Template error:', error);
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
        console.error('Upload middleware error:', err);
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      
      if (!req.file) {
        console.error('No file uploaded');
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }
      
      console.log(`📥 Processing import for ${req.file.originalname}`);
      
      // Check if user is authenticated
      if (!req.user) {
        console.error('User not authenticated');
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
    
    console.log(`📥 Processing import for ${file.originalname}`);
    
    // Parse file from memory buffer (CSV or Excel)
    const fileData = await parseFileData(file.buffer, file.originalname);
    console.log(`📊 Parsed ${fileData.length} rows from file`);
    
    if (!fileData || fileData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No data found in file or file is empty'
      });
    }
    
    // Validate required fields before processing
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
      
      console.log(`📊 Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(results.length / batchSize)}`);
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
    console.error('❌ Import processing error:', error);
    
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
    
    console.log(`📥 Processing import for ${file.originalname}`);
    
    // Parse file (CSV or Excel)
    const fileData = await parseFileData(file.path, file.originalname);
    console.log(`📊 Parsed ${fileData.length} rows from file`);
    
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
      
      console.log(`📊 Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(results.length / batchSize)}`);
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
    console.error('❌ Import processing error:', error);
    
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
  
  console.log(`🔍 Looking for client in row:`, {
    clientNationalId: row.clientNationalId,
    clientId: row.clientId,
    clientName: row.clientName,
    client_name: row.client_name,
    Name: row.Name,
    ID: row.ID
  });
  
  // Check multiple possible field names for client data
  const clientName = row.clientName || row.client_name || row.Name || row.name;
  const clientId = row.clientNationalId || row.clientId || row.ID || row.id;
  const clientPhone = row.clientPhone || row.client_phone || row.Phone || row.phone;
  const clientVillage = row.clientVillage || row.client_village || row.Location || row.location;
  const clientAddress = row.clientAddress || row.client_address || row.Location || row.location;
  
  console.log(`🔍 Extracted client data:`, {
    clientName,
    clientId,
    clientPhone,
    clientVillage,
    clientAddress
  });
  
  if (clientId) {
    client = await Client.findOne({ nationalId: clientId });
    console.log(`🔍 Found existing client by ID:`, client ? 'Yes' : 'No');
  }
  
  if (!client && clientName) {
    console.log(`🔍 Creating new client with name: ${clientName}`);
    const nationalId = clientId || `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      client = new Client({
        name: clientName,
        nationalId: nationalId,
        phone: clientPhone || '',
        village: clientVillage || '',
        detailedAddress: clientAddress || '',
        status: 'نشط',
        animals: [],
        availableServices: [],
        createdBy: userId
      });
      await client.save();
      console.log(`✅ Successfully created client: ${client.name} (${client.nationalId})`);
    } catch (error) {
      console.error(`❌ Error creating client:`, error);
      throw new Error(`Failed to create client: ${error.message}`);
    }
  }
  
  if (!client) {
    console.log(`❌ No client found or created`);
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
    console.warn('Failed to parse JSON field:', error.message);
    return defaultValue;
  }
};

// Enhanced date parsing function to handle D-Mon format
const parseDateField = (dateString) => {
  if (!dateString || dateString.toString().trim() === '') {
    return null;
  }
  
  const dateStr = dateString.toString().trim();
  console.log(`🔍 Parsing date: ${dateStr}`);
  
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
      console.log(`🔍 Converted D-Mon format: ${dateStr} -> ${fullDate} -> ${dateValue}`);
      return dateValue;
    }
  }
  
  // Handle other date formats
  const dateValue = new Date(dateStr);
  console.log(`🔍 Parsed date: ${dateValue} (valid: ${!isNaN(dateValue.getTime())})`);
  return dateValue;
};

// Process row functions for each model with improved validation
const processVaccinationRow = async (row, userId, errors) => {
  try {
    // Validate required fields using new field names
    if (!row['Date'] && !row.date) {
      throw new Error('Date is required');
    }
    
    if (!row['Name'] && !row.name && !row.clientName) {
      throw new Error('Client name is required');
    }

    // Find or create client using new field names
    const client = await findOrCreateClient({
      Name: row['Name'],
      ID: row['ID'],
      Phone: row['Phone'],
      Location: row['Location'],
      name: row.name,
      id: row.id,
      phone: row.phone,
      location: row.location,
      clientName: row.clientName,
      clientId: row.clientId,
      clientPhone: row.clientPhone,
      clientVillage: row.clientVillage,
      clientAddress: row.clientAddress
    }, userId);
    
    if (!client) {
      throw new Error('Client not found and could not be created');
    }

    // Validate date - handle multiple date formats using enhanced parser
    const dateString = row['Date'] || row.date || row.DATE;
    console.log(`🔍 Processing date: ${dateString}`);
    
    const dateValue = parseDateField(dateString);
    
    if (!dateValue || isNaN(dateValue.getTime())) {
      throw new Error(`Invalid date format: ${dateString}`);
    }

    // Create vaccination record with new field names
    const vaccination = new Vaccination({
      serialNo: row['Serial No'] || row.serialNo || `VAC-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: dateValue,
      client: client._id,
      farmLocation: row['Location'] || row.location || 'N/A',
      supervisor: row['Supervisor'] || row.supervisor || '',
      team: row['Team'] || row.team || '',
      vehicleNo: row['Vehicle No.'] || row.vehicleNo || row['Vehicle No'] || 'N/A',
      vaccineType: row['Vaccine'] || row.vaccineType || '',
      vaccineCategory: row['Category'] || row.vaccineCategory || 'Preventive',
      // Animal counts as separate fields for better display
      sheep: parseInt(row['Sheep'] || row.sheep || 0),
      sheepFemale: parseInt(row['F. Sheep'] || row.sheepFemale || 0),
      sheepVaccinated: parseInt(row['Vaccinated Sheep'] || row.sheepVaccinated || 0),
      goats: parseInt(row['Goats'] || row.goats || 0),
      goatsFemale: parseInt(row['F. Goats'] || row.goatsFemale || 0),
      goatsVaccinated: parseInt(row['Vaccinated Goats'] || row.goatsVaccinated || 0),
      camel: parseInt(row['Camel'] || row.camel || 0),
      camelFemale: parseInt(row['F. Camel'] || row.camelFemale || 0),
      camelVaccinated: parseInt(row['Vaccinated Camels'] || row.camelVaccinated || 0),
      cattle: parseInt(row['Cattle'] || row.cattle || 0),
      cattleFemale: parseInt(row['F. Cattle'] || row.cattleFemale || 0),
      cattleVaccinated: parseInt(row['Vaccinated Cattle'] || row.cattleVaccinated || 0),
      herdNumber: parseInt(row['Herd Number'] || row.herdNumber || 0),
      herdFemales: parseInt(row['Herd Females'] || row.herdFemales || 0),
      totalVaccinated: parseInt(row['Total Vaccinated'] || row.totalVaccinated || 0),
      herdHealth: row['Herd Health'] || row.herdHealth || 'Healthy',
      animalsHandling: row['Animals Handling'] || row.animalsHandling || 'Easy',
      labours: row['Labours'] || row.labours || 'Available',
      reachableLocation: row['Reachable Location'] || row.reachableLocation || 'Easy',
      request: {
        date: new Date(row['Request Date'] || row.requestDate || row.date),
        situation: row['Situation'] || row.requestSituation || 'Open',
        fulfillingDate: row['Request Fulfilling Date'] ? new Date(row['Request Fulfilling Date']) : undefined
      },
      remarks: row['Remarks'] || row.remarks || '',
      createdBy: userId
    });

    await vaccination.save();
    return vaccination;
  } catch (error) {
    throw new Error(`Error processing vaccination row: ${error.message}`);
  }
};

const processParasiteControlRow = async (row, userId, errors) => {
  try {
    // Find or create client using new field names
    const client = await findOrCreateClient({
      Name: row['Name'],
      ID: row['ID'],
      Phone: row['Phone'],
      Location: row['Location'],
      name: row.name,
      id: row.id,
      phone: row.phone,
      location: row.location,
      clientName: row.clientName,
      clientId: row.clientId,
      clientPhone: row.clientPhone,
      clientVillage: row.clientVillage,
      clientAddress: row.clientAddress
    }, userId);
    
    if (!client) {
      throw new Error('Client not found and could not be created');
    }

    // Create parasite control record with new field names
    const parasiteControl = new ParasiteControl({
      serialNo: row['Serial No'] || row.serialNo || `PAR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: new Date(row['Date'] || row.date),
      client: client._id,
      herdLocation: row['Location'] || row.location || 'N/A',
      supervisor: row['Supervisor'] || row.supervisor || '',
      vehicleNo: row['Vehicle No.'] || row.vehicleNo || row['Vehicle No'] || 'N/A',
      // Animal counts as separate fields for better display
      sheepTotal: parseInt(row['Total Sheep'] || row.sheepTotal || 0),
      sheepYoung: parseInt(row['Young sheep'] || row.sheepYoung || 0),
      sheepFemale: parseInt(row['Female Sheep'] || row.sheepFemale || 0),
      sheepTreated: parseInt(row['Treated Sheep'] || row.sheepTreated || 0),
      goatsTotal: parseInt(row['Total Goats'] || row.goatsTotal || 0),
      goatsYoung: parseInt(row['Young Goats'] || row.goatsYoung || 0),
      goatsFemale: parseInt(row['Female Goats'] || row.goatsFemale || 0),
      goatsTreated: parseInt(row['Treated Goats'] || row.goatsTreated || 0),
      camelTotal: parseInt(row['Total Camel'] || row.camelTotal || 0),
      camelYoung: parseInt(row['Young Camels'] || row.camelYoung || 0),
      camelFemale: parseInt(row['Female Camels'] || row.camelFemale || 0),
      camelTreated: parseInt(row['Treated Camels'] || row.camelTreated || 0),
      cattleTotal: parseInt(row['Total Cattle'] || row.cattleTotal || 0),
      cattleYoung: parseInt(row['Young Cattle'] || row.cattleYoung || 0),
      cattleFemale: parseInt(row['Female Cattle'] || row.cattleFemale || 0),
      cattleTreated: parseInt(row['Treated Cattle'] || row.cattleTreated || 0),
      horseTotal: parseInt(row.horseTotal || 0),
      horseYoung: parseInt(row.horseYoung || 0),
      horseFemale: parseInt(row.horseFemale || 0),
      horseTreated: parseInt(row.horseTreated || 0),
      totalHerd: parseInt(row['Total Herd'] || row.totalHerd || 0),
      totalYoung: parseInt(row['Total Young'] || row.totalYoung || 0),
      totalFemale: parseInt(row['Total Female'] || row.totalFemale || 0),
      totalTreated: parseInt(row['Total Treated'] || row.totalTreated || 0),
      insecticide: {
        type: row['Insecticide Used'] || row['Insecticide'] || row.insecticideType || 'N/A',
        method: row['Type'] || row.insecticideMethod || 'N/A',
        volumeMl: parseInt(row['Volume (ml)'] || row['Volume'] || row.insecticideVolume || 0),
        status: (() => {
          const statusValue = row['Status'] || row.insecticideStatus || 'Sprayed';
          const lowerStatus = statusValue.toLowerCase();
          if (lowerStatus === 'sprayed' || lowerStatus === 'yes' || lowerStatus === 'true' || lowerStatus === '1') {
            return 'Sprayed';
          } else {
            return 'Not Sprayed';
          }
        })(),
        category: row['Category'] || row.insecticideCategory || 'N/A'
      },
      animalBarnSizeSqM: parseInt(row['Size (sqM)'] || row.animalBarnSize || 0),
      breedingSites: row.breedingSites || 'N/A',
      parasiteControlVolume: parseInt(row['Volume (ml)'] || row['Volume'] || row.parasiteControlVolume || 0),
      parasiteControlStatus: row['Status'] || row.parasiteControlStatus || 'N/A',
      herdHealthStatus: row['Herd Health Status'] || row.herdHealthStatus || 'Healthy',
      complyingToInstructions: row['Complying to instructions'] === 'true' || row.complyingToInstructions === 'true',
      request: {
        date: new Date(row['Request Date'] || row.requestDate || row.date),
        situation: row['Request Situation'] || row.requestSituation || 'Open',
        fulfillingDate: row['Request Fulfilling Date'] ? new Date(row['Request Fulfilling Date']) : undefined
      },
      remarks: row['Remarks'] || row.remarks || '',
      createdBy: userId
    });

    await parasiteControl.save();
    return parasiteControl;
  } catch (error) {
    throw new Error(`Error processing parasite control row: ${error.message}`);
  }
};

const processMobileClinicRow = async (row, userId, errors) => {
  try {
    // Find or create client using new field names
    const client = await findOrCreateClient({
      Name: row['Name'],
      ID: row['ID'],
      Phone: row['Phone'],
      Location: row['Location'],
      name: row.name,
      id: row.id,
      phone: row.phone,
      location: row.location,
      clientName: row.clientName,
      clientId: row.clientId,
      clientPhone: row.clientPhone,
      clientVillage: row.clientVillage,
      clientAddress: row.clientAddress
    }, userId);
    
    if (!client) {
      throw new Error('Client not found and could not be created');
    }

    // Create mobile clinic record with new field names
    const mobileClinic = new MobileClinic({
      serialNo: row['Serial No'] || row.serialNo || `MC-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: new Date(row['Date'] || row.date),
      client: client._id,
      farmLocation: row['Location'] || row.location || 'N/A',
      supervisor: row['Supervisor'] || row.supervisor || '',
      vehicleNo: row['Vehicle No.'] || row.vehicleNo || row['Vehicle No'] || 'N/A',
      // Animal counts as separate fields for better display
      sheep: parseInt(row['Sheep'] || row.sheep || 0),
      goats: parseInt(row['Goats'] || row.goats || 0),
      camel: parseInt(row['Camel'] || row.camel || 0),
      cattle: parseInt(row['Cattle'] || row.cattle || 0),
      horse: parseInt(row['Horse'] || row.horse || 0),
      diagnosis: row['Diagnosis'] || row.diagnosis || '',
      interventionCategory: row['Intervention Category'] || row.interventionCategory || 'Routine',
      treatment: row['Treatment'] || row.treatment || '',
      medicationsUsed: parseJsonField(row.medicationsUsed, []),
      request: {
        date: new Date(row['Request Date'] || row.requestDate || row.date),
        situation: row['Request Status'] || row.requestStatus || 'Open',
        fulfillingDate: row['Request Fulfilling Date'] ? new Date(row['Request Fulfilling Date']) : undefined
      },
      followUpRequired: row.followUpRequired === 'true' || row.follow_up_required === 'true',
      followUpDate: row.followUpDate ? new Date(row.followUpDate) : undefined,
      remarks: row['Remarks'] || row.remarks || '',
      createdBy: userId
    });

    await mobileClinic.save();
    return mobileClinic;
  } catch (error) {
    throw new Error(`Error processing mobile clinic row: ${error.message}`);
  }
};

const processLaboratoryRow = async (row, userId, errors) => {
  try {
    // Create laboratory record with new field names
    const laboratory = new Laboratory({
      serialNo: parseInt(row['Serial'] || row.serialNo || 0),
      date: new Date(row['date'] || row.date),
      sampleCode: row['Sample Code'] || row.sampleCode || `LAB-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      clientName: row['Name'] || row.clientName || '',
      clientId: row['ID'] || row.clientId || '',
      clientBirthDate: row['Birth Date'] ? new Date(row['Birth Date']) : undefined,
      clientPhone: row['phone'] || row.clientPhone || '',
      farmLocation: row['Location'] || row.location || 'N/A',
      // Animal counts as separate fields for better display
      sheep: parseInt(row['Sheep'] || row.sheepCount || 0),
      goats: parseInt(row['Goats'] || row.goatsCount || 0),
      camel: parseInt(row['Camel'] || row.camelCount || 0),
      cattle: parseInt(row['Cattle'] || row.cattleCount || 0),
      horse: parseInt(row['Horse'] || row.horseCount || 0),
      otherSpecies: row['Other (Species)'] || row.otherSpecies || '',
      collector: row['Sample Collector'] || row.collector || '',
      sampleType: row['Sample Type'] || row.sampleType || 'Blood',
      sampleNumber: row['Samples Number'] || row.sampleNumber || '',
      positiveCases: parseInt(row['positive cases'] || row.positiveCases || 0),
      negativeCases: parseInt(row['Negative Cases'] || row.negativeCases || 0),
      testResults: parseJsonField(row.testResults, []),
      remarks: row['Remarks'] || row.remarks || '',
      createdBy: userId
    });

    await laboratory.save();
    return laboratory;
  } catch (error) {
    throw new Error(`Error processing laboratory row: ${error.message}`);
  }
};

const processEquineHealthRow = async (row, userId, errors) => {
  try {
    // Validate required fields using new field names
    if (!row['Date'] && !row.date) {
      throw new Error('Date is required');
    }
    
    if (!row['Name'] && !row.name && !row.clientName) {
      throw new Error('Client name is required');
    }

    // Find or create client using new field names
    const client = await findOrCreateClient({
      Name: row['Name'],
      ID: row['ID'],
      Phone: row['Phone'],
      Location: row['Location'],
      name: row.name,
      id: row.id,
      phone: row.phone,
      location: row.location,
      clientName: row.clientName,
      clientId: row.clientId,
      clientPhone: row.clientPhone,
      clientVillage: row.clientVillage,
      clientAddress: row.clientAddress
    }, userId);
    
    if (!client) {
      throw new Error('Client not found and could not be created');
    }

    // Validate date - handle multiple date formats using enhanced parser
    const dateString = row['Date'] || row.date || row.DATE;
    console.log(`🔍 Processing date: ${dateString}`);
    
    const dateValue = parseDateField(dateString);
    
    if (!dateValue || isNaN(dateValue.getTime())) {
      throw new Error(`Invalid date format: ${dateString}`);
    }

    // Create equine health record with new field names
    const equineHealth = new EquineHealth({
      serialNo: row['Serial No'] || row.serialNo || `EH-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: dateValue,
      client: client._id,
      farmLocation: row['Location'] || row.location || 'N/A',
      coordinates: {
        latitude: parseFloat(row['N Coordinate'] || row.latitude || 0),
        longitude: parseFloat(row['E Coordinate'] || row.longitude || 0)
      },
      supervisor: row['Supervisor'] || row.supervisor || '',
      vehicleNo: row['Vehicle No.'] || row.vehicleNo || row['Vehicle No'] || 'N/A',
      // Animal counts as separate fields for better display
      horseCount: parseInt(row.horseCount || 1),
      diagnosis: row['Diagnosis'] || row.diagnosis || '',
      interventionCategory: row['Intervention Category'] || row.interventionCategory || 'Routine',
      treatment: row['Treatment'] || row.treatment || '',
      followUpRequired: row.followUpRequired === 'true' || row.follow_up_required === 'true',
      followUpDate: row.followUpDate ? new Date(row.followUpDate) : undefined,
      request: {
        date: new Date(row['Request Date'] || row.requestDate || row.date),
        situation: row['Request Status'] || row.requestSituation || 'Open',
        fulfillingDate: row['Request Fulfilling Date'] ? new Date(row['Request Fulfilling Date']) : undefined
      },
      remarks: row['Remarks'] || row.remarks || '',
      createdBy: userId
    });

    await equineHealth.save();
    return equineHealth;
  } catch (error) {
    throw new Error(`Error processing equine health row: ${error.message}`);
  }
};

// Export routes with proper field definitions
router.get('/clients/export', auth, handleExport(Client, {}, [
  'name', 'nationalId', 'phone', 'email', 'village', 'detailedAddress', 'status', 'totalAnimals'
], 'clients'));

router.get('/vaccination/export', auth, handleExport(Vaccination, {}, [
  'serialNo', 'date', 'client', 'farmLocation', 'supervisor', 'team', 'vehicleNo', 
  'vaccineType', 'vaccineCategory', 'sheep', 'sheepFemale', 'sheepVaccinated', 
  'goats', 'goatsFemale', 'goatsVaccinated', 'camel', 'camelFemale', 'camelVaccinated', 
  'cattle', 'cattleFemale', 'cattleVaccinated', 'herdNumber', 'herdFemales', 
  'totalVaccinated', 'herdHealth', 'animalsHandling', 'labours', 'reachableLocation', 'remarks'
], 'vaccination'));

router.get('/parasite-control/export', auth, handleExport(ParasiteControl, {}, [
  'serialNo', 'date', 'client', 'herdLocation', 'supervisor', 'vehicleNo', 
  'sheepTotal', 'sheepYoung', 'sheepFemale', 'sheepTreated', 'goatsTotal', 
  'goatsYoung', 'goatsFemale', 'goatsTreated', 'camelTotal', 'camelYoung', 
  'camelFemale', 'camelTreated', 'cattleTotal', 'cattleYoung', 'cattleFemale', 
  'cattleTreated', 'horseTotal', 'horseYoung', 'horseFemale', 'horseTreated', 
  'totalHerd', 'totalYoung', 'totalFemale', 'totalTreated', 'insecticide', 
  'animalBarnSizeSqM', 'breedingSites', 'parasiteControlVolume', 
  'parasiteControlStatus', 'herdHealthStatus', 'complyingToInstructions', 'remarks'
], 'parasite-control'));

router.get('/mobile-clinics/export', auth, handleExport(MobileClinic, {}, [
  'serialNo', 'date', 'client', 'farmLocation', 'supervisor', 'vehicleNo', 
  'sheep', 'goats', 'camel', 'cattle', 'horse', 'diagnosis', 'interventionCategory', 
  'treatment', 'medicationsUsed', 'followUpRequired', 'followUpDate', 'remarks'
], 'mobile-clinics'));

router.get('/laboratories/export', auth, handleExport(Laboratory, {}, [
  'serialNo', 'date', 'sampleCode', 'clientName', 'clientId', 'clientPhone', 
  'sheep', 'goats', 'camel', 'cattle', 'horse', 'otherSpecies', 'collector', 
  'sampleType', 'sampleNumber', 'positiveCases', 'negativeCases', 'testResults', 'remarks'
], 'laboratories'));

router.get('/equine-health/export', auth, handleExport(EquineHealth, {}, [
  'serialNo', 'date', 'client', 'farmLocation', 'coordinates', 'supervisor', 
  'vehicleNo', 'horseCount', 'diagnosis', 'interventionCategory', 
  'treatment', 'followUpRequired', 'followUpDate', 'remarks'
], 'equine-health'));

// Template routes
router.get('/clients/template', auth, handleTemplate([
  {
    name: 'عطا الله ابراهيم البلوي',
    nationalId: '1028544243',
    phone: '501834996',
    email: 'client@example.com',
    village: 'فضلا',
    detailedAddress: 'منطقة فضلا',
    status: 'نشط',
    totalAnimals: '10'
  }
], 'clients-template'));

router.get('/vaccination/template', auth, handleTemplate([
  {
    'Serial No': '1',
    'Date': '24-Aug',
    'Name': 'عطا الله ابراهيم البلوي',
    'ID': '1028544243',
    'Birth Date': '1985-01-15',
    'Phone': '501834996',
    'Location': 'فضلا',
    'N Coordinate': '24.7136',
    'E Coordinate': '46.6753',
    'Supervisor': 'kandil',
    'Team': 'فريق أ',
    'Sheep': '10',
    'F. Sheep': '5',
    'Vaccinated Sheep': '8',
    'Goats': '15',
    'F. Goats': '8',
    'Vaccinated Goats': '12',
    'Camel': '3',
    'F. Camel': '2',
    'Vaccinated Camels': '2',
    'Cattle': '5',
    'F. Cattle': '3',
    'Vaccinated Cattle': '4',
    'Herd Number': '33',
    'Herd Females': '18',
    'Total Vaccinated': '26',
    'Herd Health': 'Healthy',
    'Animals Handling': 'Easy',
    'Labours': 'Available',
    'Reachable Location': 'Easy',
    'Request Date': '8/24/2025',
    'Situation': 'Closed',
    'Request Fulfilling Date': '8/24/2025',
    'Vaccine': 'لقاح وقائي',
    'Category': 'Preventive',
    'Remarks': 'تم التحصين بنجاح'
  }
], 'vaccination-template'));

router.get('/parasite-control/template', auth, handleTemplate([
  {
    'Serial No': '1',
    'Date': '22-Jun',
    'Name': 'حسن عبد الله حسن أبو الخير',
    'ID': '1006010530',
    'Date of Birth': '1980-05-15',
    'Phone': '503321959',
    'E': '46.6753',
    'N': '24.7136',
    'Supervisor': 'Ibrahim',
    'Vehicle No.': 'P1',
    'Total Sheep': '149',
    'Young sheep': '0',
    'Female Sheep': '145',
    'Treated Sheep': '149',
    'Total Goats': '34',
    'Young Goats': '0',
    'Female Goats': '30',
    'Treated Goats': '32',
    'Total Camel': '0',
    'Young Camels': '0',
    'Female Camels': '0',
    'Treated Camels': '0',
    'Total Cattle': '0',
    'Young Cattle': '0',
    'Female Cattle': '0',
    'Treated Cattle': '0',
    'Total Herd': '183',
    'Total Young': '0',
    'Total Female': '175',
    'Total Treated': '181',
    'Insecticide Used': 'Cypermethrin 10%',
    'Type': 'Spraying',
    'Volume (ml)': '370',
    'Category': 'Insecticide',
    'Status': 'Sprayed',
    'Size (sqM)': '150',
    'Insecticide': 'Cypermethrin 10%',
    'Volume': '370',
    'Herd Health Status': 'Healthy',
    'Complying to instructions': 'true',
    'Request Date': '19-Jun',
    'Request Situation': 'Closed',
    'Request Fulfilling Date': '22-Jun',
    'Remarks': 'تم المكافحة بنجاح'
  }
], 'parasite-control-template'));

router.get('/mobile-clinics/template', auth, handleTemplate([
  {
    'Serial No': '1',
    'Date': '24-Aug',
    'Name': 'عطا الله ابراهيم البلوي',
    'ID': '1028544243',
    'Birth Date': '1985-01-15',
    'Phone': '501834996',
    'Holding Code': 'HC001',
    'Location': 'فضلا',
    'N Coordinate': '24.7136',
    'E Coordinate': '46.6753',
    'Supervisor': 'kandil',
    'Vehicle No.': 'C2',
    'Sheep': '2',
    'Goats': '1',
    'Camel': '0',
    'Horse': '0',
    'Cattle': '0',
    'Diagnosis': 'Pnemonia',
    'Intervention Category': 'Clinical Examination',
    'Treatment': 'Zuprevo , Meloxicam',
    'Request Date': '8/24/2025',
    'Request Status': 'Closed',
    'Request Fulfilling Date': '8/24/2025',
    'category': 'Emergency',
    'Remarks': 'Emergency Cases'
  }
], 'mobile-clinics-template'));

router.get('/laboratories/template', auth, handleTemplate([
  {
    'Serial': '1',
    'date': '24-Aug',
    'Sample Code': 'LAB-001',
    'Name': 'عطا الله ابراهيم البلوي',
    'ID': '1028544243',
    'Birth Date': '1985-01-15',
    'phone': '501834996',
    'Location': 'فضلا',
    'N': '24.7136',
    'E': '46.6753',
    'Sheep': '10',
    'Goats': '15',
    'Camel': '5',
    'Horse': '3',
    'Cattle': '8',
    'Other (Species)': 'Poultry',
    'Sample Collector': 'kandil',
    'Sample Type': 'Blood',
    'Samples Number': 'S001',
    'positive cases': '2',
    'Negative Cases': '8',
    'Remarks': 'تم الفحص بنجاح'
  }
], 'laboratories-template'));

router.get('/equine-health/template', auth, handleTemplate([
  {
    'Serial No': '1',
    'Date': '24-Aug',
    'Name': 'عطا الله ابراهيم البلوي',
    'ID': '1028544243',
    'Birth Date': '1985-01-15',
    'Phone': '501834996',
    'Location': 'فضلا',
    'N Coordinate': '24.7136',
    'E Coordinate': '46.6753',
    'Diagnosis': 'فحص روتيني',
    'Intervention Category': 'Clinical Examination',
    'Treatment': 'علاج وقائي',
    'Request Date': '8/24/2025',
    'Request Status': 'Closed',
    'Request Fulfilling Date': '8/24/2025',
    'category': 'Routine',
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
      email: row.email || row.client_email,
      village: row.village || row.client_village,
      detailedAddress: row.detailedAddress || row.client_address,
      status: row.status || 'نشط',
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
  res.json({
    success: false,
    message: 'Inventory import not implemented yet'
  });
});

module.exports = router;
