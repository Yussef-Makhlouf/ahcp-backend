const multer = require('multer');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const Client = require('../models/Client');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// CSV generation helper
const generateCSV = (data, fields) => {
  const headers = fields.join(',');
  const rows = data.map(row => 
    fields.map(field => {
      const value = row[field] || '';
      // Escape commas and quotes in CSV
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [headers, ...rows].join('\n');
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
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
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
    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    let rows = [];
    
    if (fileExtension === 'csv') {
      // Process CSV
      const csvData = file.buffer.toString('utf8');
      const lines = csvData.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          rows.push(row);
        }
      }
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      // Process Excel
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      rows = jsonData;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported file format. Please use CSV or Excel files.'
      });
    }
    
    // Process each row
    for (const row of rows) {
      try {
        const result = await processRowFunction(row, user._id, Client, Model, errors);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        errors.push({
          row: row,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Import completed. ${results.length} records processed successfully.`,
      results: results,
      errors: errors,
      totalRows: rows.length,
      successCount: results.length,
      errorCount: errors.length
    });
    
  } catch (error) {
    console.error('Import processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing import: ' + error.message
    });
  }
};

// Helper function to find or create client
const findOrCreateClient = async (row, userId, ClientModel = Client) => {
  let client;
  
  if (row.clientNationalId || row.clientId || row.nationalId) {
    const nationalId = row.clientNationalId || row.clientId || row.nationalId;
    client = await ClientModel.findOne({ nationalId });
  }
  
  if (!client && (row.clientName || row.client_name || row.name)) {
    const clientName = row.clientName || row.client_name || row.name;
    const nationalId = row.clientNationalId || row.clientId || row.nationalId || `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let phone = row.clientPhone || row.client_phone || row.phone || '';
    
    // Format phone number for Saudi Arabia if it's a local number
    if (phone && !phone.startsWith('+')) {
      // If it's a 9-digit number starting with 5, add +966
      if (phone.length === 9 && phone.startsWith('5')) {
        phone = `+966${phone}`;
      }
      // If it's a 10-digit number starting with 05, replace 0 with +966
      else if (phone.length === 10 && phone.startsWith('05')) {
        phone = `+966${phone.substring(1)}`;
      }
      // If it's a 13-digit number starting with 966, add +
      else if (phone.length === 13 && phone.startsWith('966')) {
        phone = `+${phone}`;
      }
      // If it's a 12-digit number starting with 966, add +
      else if (phone.length === 12 && phone.startsWith('966')) {
        phone = `+${phone}`;
      }
    }
    
    const village = row.clientVillage || row.client_village || row.village || '';
    const detailedAddress = row.clientAddress || row.client_address || row.address || '';
    
    client = new ClientModel({
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

// Parse file data helper
const parseFileData = (file) => {
  const fileExtension = file.originalname.split('.').pop().toLowerCase();
  
  if (fileExtension === 'csv') {
    return new Promise((resolve, reject) => {
      const results = [];
      const stream = require('stream');
      const bufferStream = new stream.PassThrough();
      bufferStream.end(file.buffer);
      
      bufferStream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  } else {
    throw new Error('Unsupported file format. Please use CSV or Excel files.');
  }
};

// Export handler
const handleExport = (Model, filename = 'export') => {
  return async (req, res) => {
    try {
      const data = await Model.find({});
      const fields = Object.keys(data[0]?.toObject() || {});
      const csvContent = generateCSV(data, fields);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
      res.send(csvContent);
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating export: ' + error.message
      });
    }
  };
};

module.exports = {
  handleTemplate,
  handleImport,
  handleExport,
  findOrCreateClient,
  parseFileData,
  generateCSV,
  processImportFromMemory
};
