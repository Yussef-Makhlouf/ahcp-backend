/**
 * Unified Multer Configuration
 * Centralizes file upload configuration to eliminate code duplication
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  logger.info('Created uploads directory', { path: uploadDir });
}

/**
 * Disk storage configuration for local/traditional hosting
 */
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `import-${uniqueSuffix}-${sanitizedName}`);
  }
});

/**
 * Memory storage configuration for serverless environments (Vercel, Netlify, etc.)
 */
const memoryStorage = multer.memoryStorage();

/**
 * File filter to validate uploaded files
 * Only allows CSV and Excel files
 */
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/csv',
    'text/x-csv',
  ];
  
  const allowedExtensions = ['.csv', '.xlsx', '.xls'];
  
  const hasValidMimeType = allowedMimeTypes.includes(file.mimetype);
  const ext = path.extname(file.originalname).toLowerCase();
  const hasValidExtension = allowedExtensions.includes(ext);
  
  if (hasValidMimeType || hasValidExtension) {
    logger.info('File upload accepted', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
    cb(null, true);
  } else {
    logger.warn('File upload rejected - invalid type', {
      filename: file.originalname,
      mimetype: file.mimetype,
    });
    cb(new Error('Only CSV and Excel files are allowed (.csv, .xlsx, .xls)'));
  }
};

/**
 * Disk-based upload configuration (for traditional hosting)
 */
const diskUpload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1,
  },
  fileFilter,
});

/**
 * Memory-based upload configuration (for serverless)
 */
const memoryUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB for serverless
    files: 1,
  },
  fileFilter,
});

/**
 * Auto-detect best storage method based on environment
 */
const autoUpload = process.env.VERCEL || process.env.NETLIFY 
  ? memoryUpload 
  : diskUpload;

/**
 * Export middleware functions
 */
module.exports = {
  // Disk storage upload
  diskUpload,
  uploadSingle: diskUpload.single('file'),
  uploadMultiple: diskUpload.array('files', 10),
  
  // Memory storage upload
  memoryUpload,
  uploadMemorySingle: memoryUpload.single('file'),
  uploadMemoryMultiple: memoryUpload.array('files', 10),
  
  // Auto-detect upload
  autoUpload,
  uploadAuto: autoUpload.single('file'),
  
  // Configuration values
  config: {
    uploadDir,
    maxFileSize: 50 * 1024 * 1024,
    maxFileSizeServerless: 5 * 1024 * 1024,
    allowedExtensions: ['.csv', '.xlsx', '.xls'],
  },
};

