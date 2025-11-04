/**
 * Serverless-compatible storage utility
 * Handles file uploads in serverless environments like Vercel
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

/**
 * Create serverless-compatible multer storage
 */
const createServerlessStorage = (subDir = '') => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      if (isServerless) {
        // Use /tmp directory in serverless environments
        cb(null, '/tmp');
        return;
      }
      
      // Local development - use uploads directory
      const uploadDir = path.join(__dirname, '../../uploads', subDir);
      
      try {
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
      } catch (error) {
        console.warn('Could not create upload directory, using /tmp:', error.message);
        cb(null, '/tmp');
      }
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const extension = path.extname(file.originalname);
      cb(null, `import-${uniqueSuffix}-${file.originalname}`);
    }
  });
};

/**
 * Standard file filter for CSV and Excel files
 */
const standardFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  const allowedExtensions = ['.csv', '.xlsx', '.xls'];
  
  const hasValidMimeType = allowedMimeTypes.includes(file.mimetype);
  const hasValidExtension = allowedExtensions.some(ext => 
    file.originalname.toLowerCase().endsWith(ext)
  );
  
  if (hasValidMimeType || hasValidExtension) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and Excel files are allowed (.csv, .xlsx, .xls)'));
  }
};

/**
 * Create standard multer upload configuration
 */
const createStandardUpload = (subDir = '') => {
  return multer({
    storage: createServerlessStorage(subDir),
    limits: { 
      fileSize: 50 * 1024 * 1024, // 50MB limit
      files: 1
    },
    fileFilter: standardFileFilter
  });
};

module.exports = {
  createServerlessStorage,
  standardFileFilter,
  createStandardUpload,
  isServerless
};
