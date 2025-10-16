const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Ensure upload directory exists (skip in serverless environment)
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir) && process.env.VERCEL !== '1') {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (error) {
    console.warn('Could not create upload directory:', error.message);
  }
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // In serverless environment, use memory storage
    if (process.env.VERCEL === '1') {
      cb(null, '/tmp'); // Use /tmp directory in serverless
      return;
    }
    
    const subDir = req.params.type || 'general';
    const fullPath = path.join(uploadDir, subDir);
    
    // Create subdirectory if it doesn't exist
    if (!fs.existsSync(fullPath)) {
      try {
        fs.mkdirSync(fullPath, { recursive: true });
      } catch (error) {
        console.warn('Could not create subdirectory:', error.message);
        cb(null, '/tmp'); // Fallback to /tmp
        return;
      }
    }
    
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB default
    files: 5 // Maximum 5 files per request
  }
});

/**
 * @swagger
 * /api/upload/{type}:
 *   post:
 *     summary: Upload files
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [avatars, documents, images, reports]
 *         description: Upload type/category
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Files uploaded successfully
 *       400:
 *         description: Upload error
 */
router.post('/:type',
  auth,
  upload.array('files', 5),
  asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded',
        error: 'NO_FILES'
      });
    }

    const uploadedFiles = [];

    for (const file of req.files) {
      let processedFile = {
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
        url: `/uploads/${req.params.type}/${file.filename}`
      };

      // Process images
      if (file.mimetype.startsWith('image/')) {
        try {
          // Create thumbnail for images
          const thumbnailPath = path.join(
            path.dirname(file.path),
            'thumb_' + file.filename
          );

          await sharp(file.path)
            .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toFile(thumbnailPath);

          processedFile.thumbnail = `/uploads/${req.params.type}/thumb_${file.filename}`;

          // Get image metadata
          const metadata = await sharp(file.path).metadata();
          processedFile.metadata = {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format
          };
        } catch (error) {
          console.error('Error processing image:', error);
        }
      }

      uploadedFiles.push(processedFile);
    }

    res.json({
      success: true,
      message: `${uploadedFiles.length} file(s) uploaded successfully`,
      data: {
        files: uploadedFiles
      }
    });
  })
);

/**
 * @swagger
 * /api/upload/avatar:
 *   post:
 *     summary: Upload user avatar
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully
 *       400:
 *         description: Upload error
 */
router.post('/avatar',
  auth,
  upload.single('avatar'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No avatar file uploaded',
        error: 'NO_FILE'
      });
    }

    // Validate that it's an image
    if (!req.file.mimetype.startsWith('image/')) {
      // Delete uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Avatar must be an image file',
        error: 'INVALID_FILE_TYPE'
      });
    }

    try {
      // Process avatar image
      const avatarPath = path.join(uploadDir, 'avatars', req.file.filename);
      
      await sharp(req.file.path)
        .resize(200, 200, { fit: 'cover' })
        .jpeg({ quality: 90 })
        .toFile(avatarPath);

      // Delete original file if different
      if (req.file.path !== avatarPath) {
        fs.unlinkSync(req.file.path);
      }

      const avatarUrl = `/uploads/avatars/${req.file.filename}`;

      // Update user avatar in database
      const User = require('../models/User');
      await User.findByIdAndUpdate(req.user._id, { avatar: avatarUrl });

      res.json({
        success: true,
        message: 'Avatar uploaded successfully',
        data: {
          avatarUrl
        }
      });
    } catch (error) {
      // Clean up file on error
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/upload/import/csv:
 *   post:
 *     summary: Import data from CSV file
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: model
 *         required: true
 *         schema:
 *           type: string
 *           enum: [clients, parasite-control, vaccination, mobile-clinics, equine-health, laboratory]
 *         description: Data model to import to
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               csvFile:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Data imported successfully
 *       400:
 *         description: Import error
 */
router.post('/import/csv',
  auth,
  upload.single('csvFile'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No CSV file uploaded',
        error: 'NO_FILE'
      });
    }

    const { model } = req.query;
    if (!model) {
      return res.status(400).json({
        success: false,
        message: 'Model parameter is required',
        error: 'MISSING_MODEL'
      });
    }

    try {
      const csvParser = require('csv-parser');
      const results = [];
      
      // Parse CSV file
      await new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
          .pipe(csvParser())
          .on('data', (data) => results.push(data))
          .on('end', resolve)
          .on('error', reject);
      });

      // Import data based on model
      const importResults = await importCSVData(model, results, req.user._id);

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        message: 'CSV data imported successfully',
        data: importResults
      });
    } catch (error) {
      // Clean up file on error
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/upload/files:
 *   get:
 *     summary: List uploaded files
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by file type/category
 *     responses:
 *       200:
 *         description: Files listed successfully
 */
router.get('/files',
  auth,
  asyncHandler(async (req, res) => {
    const { type } = req.query;
    const searchDir = type ? path.join(uploadDir, type) : uploadDir;

    if (!fs.existsSync(searchDir)) {
      return res.json({
        success: true,
        data: { files: [] }
      });
    }

    const files = [];
    const items = fs.readdirSync(searchDir, { withFileTypes: true });

    for (const item of items) {
      if (item.isFile()) {
        const filePath = path.join(searchDir, item.name);
        const stats = fs.statSync(filePath);
        
        files.push({
          name: item.name,
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          url: `/uploads/${type ? type + '/' : ''}${item.name}`
        });
      }
    }

    res.json({
      success: true,
      data: { files }
    });
  })
);

/**
 * @swagger
 * /api/upload/files/{filename}:
 *   delete:
 *     summary: Delete uploaded file
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: File name to delete
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: File type/category
 *     responses:
 *       200:
 *         description: File deleted successfully
 *       404:
 *         description: File not found
 */
router.delete('/files/:filename',
  auth,
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const { type } = req.query;
    
    const filePath = path.join(uploadDir, type || '', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found',
        error: 'FILE_NOT_FOUND'
      });
    }

    // Delete main file
    fs.unlinkSync(filePath);

    // Delete thumbnail if exists
    const thumbnailPath = path.join(path.dirname(filePath), 'thumb_' + filename);
    if (fs.existsSync(thumbnailPath)) {
      fs.unlinkSync(thumbnailPath);
    }

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  })
);

// Helper function to import CSV data
async function importCSVData(model, data, userId) {
  const Client = require('../models/Client');
  
  let imported = 0;
  let errors = [];

  for (const row of data) {
    try {
      switch (model) {
        case 'clients':
          await Client.create({
            ...row,
            createdBy: userId
          });
          imported++;
          break;
        // Add other models as needed
        default:
          throw new Error(`Unsupported model: ${model}`);
      }
    } catch (error) {
      errors.push({
        row: data.indexOf(row) + 1,
        error: error.message
      });
    }
  }

  return {
    totalRows: data.length,
    imported,
    errors: errors.length,
    errorDetails: errors.slice(0, 10) // Return first 10 errors
  };
}

module.exports = router;
