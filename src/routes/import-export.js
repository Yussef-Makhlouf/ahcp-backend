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
      jsonData.forEach(row => results.push(row));
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
  
  // Check for required fields based on model
  const requiredFields = getRequiredFields(Model);
  
  data.forEach((row, index) => {
    requiredFields.forEach(field => {
      // Check multiple possible field names
      const fieldVariants = [
        field,
        field.replace(/([A-Z])/g, '_$1').toLowerCase(), // camelCase to snake_case
        field.replace(/_/g, ''), // remove underscores
      ];
      
      const hasField = fieldVariants.some(variant => 
        row[variant] && row[variant].toString().trim() !== ''
      );
      
      if (!hasField) {
        errors.push({
          row: index + 1,
          field: field,
          message: `Required field '${field}' is missing or empty`
        });
      }
    });
    
    // Validate date fields
    if (row.date) {
      const dateValue = new Date(row.date);
      if (isNaN(dateValue.getTime())) {
        errors.push({
          row: index + 1,
          field: 'date',
          message: 'Invalid date format'
        });
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
      return ['Serial No', 'Date', 'Name'];
    case 'ParasiteControl':
      return ['Serial No', 'Date', 'Name'];
    case 'MobileClinic':
      return ['Serial No', 'Date', 'Name'];
    case 'Laboratory':
      return ['Sample Code', 'Name'];
    case 'EquineHealth':
      return ['Serial No', 'Date', 'Name'];
    default:
      return ['date']; // Default required field
  }
};

// Helper function to generate CSV content with Arabic headers
const generateCSV = (data, headers, arabicHeaders = null) => {
  if (!data || data.length === 0) {
    const headerRow = arabicHeaders ? arabicHeaders.join(',') : headers.join(',');
    return headerRow;
  }
  
  // Use Arabic headers if provided, otherwise use original headers
  const csvHeaders = arabicHeaders ? arabicHeaders.join(',') : headers.join(',');
  const csvRows = data.map(row => 
    headers.map(header => {
      let value = row[header] || '';
      
      // Handle nested objects (like client data)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.name) {
          value = value.name;
        } else if (value._id) {
          value = value._id.toString();
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

// Helper function to generate Excel content with Arabic headers
const generateExcel = (data, headers, arabicHeaders = null) => {
  if (!data || data.length === 0) {
    // Create empty worksheet with headers only
    const emptyData = [{}];
    const displayHeaders = arabicHeaders || headers;
    displayHeaders.forEach(header => {
      emptyData[0][header] = '';
    });
    const worksheet = XLSX.utils.json_to_sheet(emptyData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  // Process data to flatten nested objects and arrays
  const processedData = data.map(row => {
    const processedRow = {};
    
    headers.forEach((header, index) => {
      let value = row[header];
      
      // Handle nested objects (like client data)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.name) {
          value = value.name;
        } else if (value._id) {
          value = value._id.toString();
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
      
      // Use Arabic header as key if available
      const displayHeader = arabicHeaders ? arabicHeaders[index] : header;
      processedRow[displayHeader] = value;
    });
    
    return processedRow;
  });

  // Create worksheet with processed data
  const worksheet = XLSX.utils.json_to_sheet(processedData);
  
  // Set column widths for better readability
  const displayHeaders = arabicHeaders || headers;
  const colWidths = displayHeaders.map(header => ({
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
      
      // Optimized query with lean() for better performance
      let query = Model.find(queryFilter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) || 1000)
        .lean(); // Use lean() for better performance
      
      // Try to populate client if the model has client field
      try {
        const sampleDoc = await Model.findOne(queryFilter).lean();
        if (sampleDoc && sampleDoc.client) {
          query = Model.find(queryFilter)
            .populate('client', 'name nationalId phone village detailedAddress')
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

      // If no records found, still create a file with headers
      if (records.length === 0) {
        console.log('⚠️ No records found, creating empty file with headers');
        if (format === 'csv') {
          const csvContent = generateCSV([], fields, fields.map(field => arabicHeaders[field] || field));
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
          res.send(csvContent);
        } else {
          const excelBuffer = generateExcel([], fields, fields.map(field => arabicHeaders[field] || field));
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
          res.send(excelBuffer);
        }
        return;
      }

      // Use Arabic headers for better user experience
      const arabicFields = fields.map(field => arabicHeaders[field] || field);

      if (format === 'csv') {
        const csvContent = generateCSV(records, fields, arabicFields);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
        res.send(csvContent);
      } else {
        // Default to Excel format
        const excelBuffer = generateExcel(records, fields, arabicFields);
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
  
  if (row.clientNationalId || row.clientId) {
    const nationalId = row.clientNationalId || row.clientId;
    client = await Client.findOne({ nationalId });
  }
  
  if (!client && (row.clientName || row.client_name)) {
    const clientName = row.clientName || row.client_name;
    const nationalId = row.clientNationalId || row.clientId || `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const phone = row.clientPhone || row.client_phone || '';
    const village = row.clientVillage || row.client_village || '';
    const detailedAddress = row.clientAddress || row.client_address || '';
    
    client = new Client({
      name: clientName,
      nationalId: nationalId,
      phone: phone,
      village: village,
      detailedAddress: detailedAddress,
      status: 'نشط',
      animals: [],
      availableServices: [],
      createdBy: userId
    });
    await client.save();
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
      name: row['Name'] || row.name || row.clientName,
      nationalId: row['ID'] || row.id || row.nationalId,
      phone: row['Phone'] || row.phone,
      village: row['Location'] || row.location,
      detailedAddress: row['Location'] || row.location
    }, userId);
    
    if (!client) {
      throw new Error('Client not found and could not be created');
    }

    // Validate date
    const dateValue = new Date(row['Date'] || row.date);
    if (isNaN(dateValue.getTime())) {
      throw new Error('Invalid date format');
    }

    // Create vaccination record with new field names
    const vaccination = new Vaccination({
      serialNo: row['Serial No'] || row.serialNo || `VAC-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: dateValue,
      client: client._id,
      farmLocation: row['Location'] || row.location || '',
      supervisor: row['Supervisor'] || row.supervisor || '',
      team: row['Team'] || row.team || '',
      vehicleNo: row.vehicleNo || '',
      vaccineType: row['Vaccine'] || row.vaccineType || '',
      vaccineCategory: row['Category'] || row.vaccineCategory || 'Preventive',
      herdCounts: {
        sheep: {
          total: parseInt(row['Sheep'] || row.sheep || 0),
          young: parseInt(row.sheepYoung || 0),
          female: parseInt(row['F. Sheep'] || row.sheepFemale || 0),
          vaccinated: parseInt(row['Vaccinated Sheep'] || row.sheepVaccinated || 0)
        },
        goats: {
          total: parseInt(row['Goats'] || row.goats || 0),
          young: parseInt(row.goatsYoung || 0),
          female: parseInt(row['F. Goats'] || row.goatsFemale || 0),
          vaccinated: parseInt(row['Vaccinated Goats'] || row.goatsVaccinated || 0)
        },
        camel: {
          total: parseInt(row['Camel'] || row.camel || 0),
          young: parseInt(row.camelYoung || 0),
          female: parseInt(row['F. Camel'] || row.camelFemale || 0),
          vaccinated: parseInt(row['Vaccinated Camels'] || row.camelVaccinated || 0)
        },
        cattle: {
          total: parseInt(row['Cattle'] || row.cattle || 0),
          young: parseInt(row.cattleYoung || 0),
          female: parseInt(row['F. Cattle'] || row.cattleFemale || 0),
          vaccinated: parseInt(row['Vaccinated Cattle'] || row.cattleVaccinated || 0)
        },
        horse: {
          total: parseInt(row.horse || 0),
          young: parseInt(row.horseYoung || 0),
          female: parseInt(row.horseFemale || 0),
          vaccinated: parseInt(row.horseVaccinated || 0)
        }
      },
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
      name: row['Name'] || row.name || row.clientName,
      nationalId: row['ID'] || row.id || row.nationalId,
      phone: row['Phone'] || row.phone,
      village: row['Location'] || row.location,
      detailedAddress: row['Location'] || row.location
    }, userId);
    
    if (!client) {
      throw new Error('Client not found and could not be created');
    }

    // Create parasite control record with new field names
    const parasiteControl = new ParasiteControl({
      serialNo: row['Serial No'] || row.serialNo || `PAR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: new Date(row['Date'] || row.date),
      client: client._id,
      herdLocation: row['Location'] || row.location || '',
      supervisor: row['Supervisor'] || row.supervisor || '',
      vehicleNo: row['Vehicle No.'] || row.vehicleNo || '',
      herdCounts: {
        sheep: {
          total: parseInt(row['Total Sheep'] || row.sheepTotal || 0),
          young: parseInt(row['Young sheep'] || row.sheepYoung || 0),
          female: parseInt(row['Female Sheep'] || row.sheepFemale || 0),
          treated: parseInt(row['Treated Sheep'] || row.sheepTreated || 0)
        },
        goats: {
          total: parseInt(row['Total Goats'] || row.goatsTotal || 0),
          young: parseInt(row['Young Goats'] || row.goatsYoung || 0),
          female: parseInt(row['Female Goats'] || row.goatsFemale || 0),
          treated: parseInt(row['Treated Goats'] || row.goatsTreated || 0)
        },
        camel: {
          total: parseInt(row['Total Camel'] || row.camelTotal || 0),
          young: parseInt(row['Young Camels'] || row.camelYoung || 0),
          female: parseInt(row['Female Camels'] || row.camelFemale || 0),
          treated: parseInt(row['Treated Camels'] || row.camelTreated || 0)
        },
        cattle: {
          total: parseInt(row['Total Cattle'] || row.cattleTotal || 0),
          young: parseInt(row['Young Cattle'] || row.cattleYoung || 0),
          female: parseInt(row['Female Cattle'] || row.cattleFemale || 0),
          treated: parseInt(row['Treated Cattle'] || row.cattleTreated || 0)
        },
        horse: {
          total: parseInt(row.horseTotal || 0),
          young: parseInt(row.horseYoung || 0),
          female: parseInt(row.horseFemale || 0),
          treated: parseInt(row.horseTreated || 0)
        }
      },
      insecticide: {
        type: row['Insecticide Used'] || row['Insecticide'] || row.insecticideType || '',
        method: row['Type'] || row.insecticideMethod || '',
        volumeMl: parseInt(row['Volume (ml)'] || row['Volume'] || row.insecticideVolume || 0),
        status: row['Status'] || row.insecticideStatus || 'Sprayed',
        category: row['Category'] || row.insecticideCategory || ''
      },
      animalBarnSizeSqM: parseInt(row['Size (sqM)'] || row.animalBarnSize || 0),
      breedingSites: row.breedingSites || '',
      parasiteControlVolume: parseInt(row['Volume (ml)'] || row['Volume'] || row.parasiteControlVolume || 0),
      parasiteControlStatus: row['Status'] || row.parasiteControlStatus || '',
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
      name: row['Name'] || row.name,
      nationalId: row['ID'] || row.id || row.nationalId,
      phone: row['Phone'] || row.phone,
      village: row['Location'] || row.location,
      detailedAddress: row['Location'] || row.location
    }, userId);
    
    if (!client) {
      throw new Error('Client not found and could not be created');
    }

    // Create mobile clinic record with new field names
    const mobileClinic = new MobileClinic({
      serialNo: row['Serial No'] || row.serialNo || `MC-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: new Date(row['Date'] || row.date),
      client: client._id,
      farmLocation: row['Location'] || row.location || '',
      supervisor: row['Supervisor'] || row.supervisor || '',
      vehicleNo: row['Vehicle No.'] || row.vehicleNo || '',
      animalCounts: {
        sheep: parseInt(row['Sheep'] || row.sheep || 0),
        goats: parseInt(row['Goats'] || row.goats || 0),
        camel: parseInt(row['Camel'] || row.camel || 0),
        cattle: parseInt(row['Cattle'] || row.cattle || 0),
        horse: parseInt(row['Horse'] || row.horse || 0)
      },
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
      farmLocation: row['Location'] || row.location || '',
      speciesCounts: {
        sheep: parseInt(row['Sheep'] || row.sheepCount || 0),
        goats: parseInt(row['Goats'] || row.goatsCount || 0),
        camel: parseInt(row['Camel'] || row.camelCount || 0),
        cattle: parseInt(row['Cattle'] || row.cattleCount || 0),
        horse: parseInt(row['Horse'] || row.horseCount || 0),
        other: row['Other (Species)'] || row.otherSpecies || ''
      },
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
      name: row['Name'] || row.name || row.clientName,
      nationalId: row['ID'] || row.id || row.nationalId,
      phone: row['Phone'] || row.phone,
      village: row['Location'] || row.location,
      detailedAddress: row['Location'] || row.location
    }, userId);
    
    if (!client) {
      throw new Error('Client not found and could not be created');
    }

    // Validate date
    const dateValue = new Date(row['Date'] || row.date);
    if (isNaN(dateValue.getTime())) {
      throw new Error('Invalid date format');
    }

    // Create equine health record with new field names
    const equineHealth = new EquineHealth({
      serialNo: row['Serial No'] || row.serialNo || `EH-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: dateValue,
      client: client._id,
      farmLocation: row['Location'] || row.location || '',
      coordinates: {
        latitude: parseFloat(row['N Coordinate'] || row.latitude || 0),
        longitude: parseFloat(row['E Coordinate'] || row.longitude || 0)
      },
      supervisor: row.supervisor || '',
      vehicleNo: row.vehicleNo || '',
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
  'Serial No', 'Date', 'Name', 'ID', 'Birth Date', 'Phone', 'Location', 
  'N Coordinate', 'E Coordinate', 'Supervisor', 'Team', 'Sheep', 'F. Sheep', 
  'Vaccinated Sheep', 'Goats', 'F. Goats', 'Vaccinated Goats', 'Camel', 
  'F. Camel', 'Vaccinated Camels', 'Cattle', 'F. Cattle', 'Vaccinated Cattle', 
  'Herd Number', 'Herd Females', 'Total Vaccinated', 'Herd Health', 
  'Animals Handling', 'Labours', 'Reachable Location', 'Request Date', 
  'Situation', 'Request Fulfilling Date', 'Vaccine', 'Category', 'Remarks'
], 'vaccination'));

router.get('/parasite-control/export', auth, handleExport(ParasiteControl, {}, [
  'Serial No', 'Date', 'Name', 'ID', 'Date of Birth', 'Phone', 'E', 'N', 
  'Supervisor', 'Vehicle No.', 'Total Sheep', 'Young sheep', 'Female Sheep', 
  'Treated Sheep', 'Total Goats', 'Young Goats', 'Female Goats', 'Treated Goats', 
  'Total Camel', 'Young Camels', 'Female Camels', 'Treated Camels', 'Total Cattle', 
  'Young Cattle', 'Female Cattle', 'Treated Cattle', 'Total Herd', 'Total Young', 
  'Total Female', 'Total Treated', 'Insecticide Used', 'Type', 'Volume (ml)', 
  'Category', 'Status', 'Size (sqM)', 'Insecticide', 'Volume', 'Herd Health Status', 
  'Complying to instructions', 'Request Date', 'Request Situation', 'Request Fulfilling Date', 'Remarks'
], 'parasite-control'));

router.get('/mobile-clinics/export', auth, handleExport(MobileClinic, {}, [
  'Serial No', 'Date', 'Name', 'ID', 'Birth Date', 'Phone', 'Holding Code', 
  'Location', 'N Coordinate', 'E Coordinate', 'Supervisor', 'Vehicle No.', 
  'Sheep', 'Goats', 'Camel', 'Horse', 'Cattle', 'Diagnosis', 
  'Intervention Category', 'Treatment', 'Request Date', 'Request Status', 
  'Request Fulfilling Date', 'category', 'Remarks'
], 'mobile-clinics'));

router.get('/laboratories/export', auth, handleExport(Laboratory, {}, [
  'Serial', 'date', 'Sample Code', 'Name', 'ID', 'Birth Date', 'phone', 
  'Location', 'N', 'E', 'Sheep', 'Goats', 'Camel', 'Horse', 'Cattle', 
  'Other (Species)', 'Sample Collector', 'Sample Type', 'Samples Number', 
  'positive cases', 'Negative Cases', 'Remarks'
], 'laboratories'));

router.get('/equine-health/export', auth, handleExport(EquineHealth, {}, [
  'Serial No', 'Date', 'Name', 'ID', 'Birth Date', 'Phone', 'Location', 
  'N Coordinate', 'E Coordinate', 'Diagnosis', 'Intervention Category', 
  'Treatment', 'Request Date', 'Request Status', 'Request Fulfilling Date', 
  'category', 'Remarks'
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
