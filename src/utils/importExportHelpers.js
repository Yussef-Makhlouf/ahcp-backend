const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const json2csv = require('json2csv');
const Parser = json2csv.Parser || json2csv;

/**
 * Configure multer for file uploads
 */
const configureMulter = () => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, '../../uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, `import-${Date.now()}-${file.originalname}`);
    }
  });
  
  return multer({ 
    storage,
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        cb(null, true);
      } else {
        cb(new Error('Only CSV files are allowed'));
      }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });
};

/**
 * Generic export handler
 */
const handleExport = async (Model, filter = {}, fields = [], filename = 'export') => {
  return async (req, res) => {
    try {
      const { format = 'json' } = req.query;
      
      // Apply additional filters from query
      const queryFilter = { ...filter };
      if (req.query.startDate && req.query.endDate) {
        queryFilter.date = {
          $gte: new Date(req.query.startDate),
          $lte: new Date(req.query.endDate)
        };
      }
      
      let query = Model.find(queryFilter).sort({ createdAt: -1 });
      
      // Try to populate client if the model has client field
      try {
        const sampleDoc = await Model.findOne(queryFilter);
        if (sampleDoc && sampleDoc.client) {
          query = query.populate('client', 'name nationalId phone village detailedAddress');
        }
      } catch (populateError) {
        // Continue without populate if it fails
        console.warn('Could not populate client field:', populateError.message);
      }
      
      const records = await query;

      if (format === 'csv') {
        const parser = new Parser({ fields });
        const csv = parser.parse(records);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
        res.send(csv);
      } else {
        res.json({
          success: true,
          data: records
        });
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

/**
 * Generic template handler
 */
const handleTemplate = (templateData, filename = 'template') => {
  return async (req, res) => {
    try {
      const fields = Object.keys(templateData[0]);
      const parser = new Parser({ fields });
      const csv = parser.parse(templateData);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
      res.send(csv);
    } catch (error) {
      console.error('Template error:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating template: ' + error.message
      });
    }
  };
};

/**
 * Generic import handler
 */
const handleImport = (Model, ClientModel, processRowFunction) => {
  const upload = configureMulter().single('file');
  
  return async (req, res) => {
    upload(req, res, async (err) => {
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
      
      const results = [];
      const errors = [];
      let rowNumber = 0;
      
      try {
        // Parse CSV file
        await new Promise((resolve, reject) => {
          fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (data) => {
              rowNumber++;
              results.push({ ...data, rowNumber });
            })
            .on('end', resolve)
            .on('error', reject);
        });
        
        let successCount = 0;
        let errorCount = 0;
        const importedRecords = [];
        
        // Process each row
        for (const row of results) {
          try {
            const record = await processRowFunction(row, req.user._id, ClientModel, Model, errors);
            if (record) {
              importedRecords.push(record);
              successCount++;
            }
          } catch (error) {
            errors.push({
              row: row.rowNumber,
              field: 'processing',
              message: error.message
            });
            errorCount++;
          }
        }
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        
        res.json({
          success: errorCount === 0,
          totalRows: results.length,
          successRows: successCount,
          errorRows: errorCount,
          errors: errors,
          importedRecords: importedRecords
        });
        
      } catch (error) {
        // Clean up uploaded file on error
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
          success: false,
          message: 'Error processing file: ' + error.message
        });
      }
    });
  };
};

/**
 * Helper function to find or create client
 */
const findOrCreateClient = async (row, userId, ClientModel) => {
  let client;
  
  if (row.clientNationalId) {
    client = await ClientModel.findOne({ nationalId: row.clientNationalId });
  }
  
  if (!client && row.clientName) {
    client = new ClientModel({
      name: row.clientName,
      nationalId: row.clientNationalId || `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      phone: row.clientPhone || '',
      village: row.clientVillage || '',
      detailedAddress: row.clientDetailedAddress || '',
      status: 'نشط',
      animals: [],
      availableServices: [],
      createdBy: userId
    });
    await client.save();
  }
  
  return client;
};

module.exports = {
  configureMulter,
  handleExport,
  handleTemplate,
  handleImport,
  findOrCreateClient
};
