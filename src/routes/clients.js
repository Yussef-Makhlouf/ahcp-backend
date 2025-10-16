const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Client = require('../models/Client');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { handleTemplate, handleImport } = require('../utils/importExportHelpers');

const router = express.Router();
// Configure multer for file uploads
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

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB limit - increased for large files
    files: 1
  },
  fileFilter: (req, file, cb) => {
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
  }
});

/**
 * @swagger
 * /api/clients:
 *   get:
 *     summary: Get all clients
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of clients per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [نشط, غير نشط]
 *         description: Filter by status
 *       - in: query
 *         name: village
 *         schema:
 *           type: string
 *         description: Filter by village
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in name, national ID, or phone
 *     responses:
 *       200:
 *         description: Clients retrieved successfully
 */
router.get('/',
  auth,
  validateQuery(schemas.paginationQuery),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 30, status, village, search, animalType, includeServices = 'true' } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (village) filter.village = { $regex: village, $options: 'i' };
    if (animalType) filter['animals.animalType'] = animalType;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { nationalId: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { village: { $regex: search, $options: 'i' } }
      ];
    }

    // Get clients with error handling
    let clients = [];
    let total = 0;
    
    try {
      if (includeServices === 'true') {
        // Use aggregation pipeline to gather data from all forms
        const aggregationPipeline = [
          { $match: filter },
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
              // Aggregate services received
              servicesReceived: {
                $concatArrays: [
                  { $map: { input: '$mobileClinics', as: 'mc', in: 'mobile_clinic' } },
                  { $map: { input: '$vaccinations', as: 'v', in: 'vaccination' } },
                  { $map: { input: '$equineHealths', as: 'eh', in: 'equine_health' } },
                  { $map: { input: '$laboratories', as: 'l', in: 'laboratory' } },
                  { $map: { input: '$parasiteControls', as: 'pc', in: 'parasite_control' } }
                ]
              },
              // Get birth date from any form that has it
              birthDateFromForms: {
                $let: {
                  vars: {
                    vaccinationBirthDate: { $arrayElemAt: ['$vaccinations.client.birthDate', 0] },
                    laboratoryBirthDate: { $arrayElemAt: ['$laboratories.clientBirthDate', 0] },
                    mobileClinicBirthDate: { $arrayElemAt: ['$mobileClinics.client.birthDate', 0] }
                  },
                  in: {
                    $cond: {
                      if: { $ne: ['$$vaccinationBirthDate', null] },
                      then: '$$vaccinationBirthDate',
                      else: {
                        $cond: {
                          if: { $ne: ['$$laboratoryBirthDate', null] },
                          then: '$$laboratoryBirthDate',
                          else: '$$mobileClinicBirthDate'
                        }
                      }
                    }
                  }
                }
              },
              // Count total visits
              totalVisits: {
                $add: [
                  { $size: '$mobileClinics' },
                  { $size: '$vaccinations' },
                  { $size: '$equineHealths' },
                  { $size: '$laboratories' },
                  { $size: '$parasiteControls' }
                ]
              },
              // Get last service date
              lastServiceDate: {
                $let: {
                  vars: {
                    allDates: {
                      $concatArrays: [
                        { $map: { input: '$mobileClinics', as: 'mc', in: '$$mc.date' } },
                        { $map: { input: '$vaccinations', as: 'v', in: '$$v.date' } },
                        { $map: { input: '$equineHealths', as: 'eh', in: '$$eh.date' } },
                        { $map: { input: '$laboratories', as: 'l', in: '$$l.date' } },
                        { $map: { input: '$parasiteControls', as: 'pc', in: '$$pc.date' } }
                      ]
                    }
                  },
                  in: { $max: '$$allDates' }
                }
              }
            }
          },
          {
            $project: {
              // Keep all original client fields
              name: 1,
              nationalId: 1,
              phone: 1,
              email: 1,
              village: 1,
              detailedAddress: 1,
              birthDate: 1,
              status: 1,
              animals: 1,
              availableServices: 1,
              coordinates: 1,
              createdBy: 1,
              updatedBy: 1,
              createdAt: 1,
              updatedAt: 1,
              // Add aggregated fields
              servicesReceived: 1,
              birthDateFromForms: 1,
              totalVisits: 1,
              lastServiceDate: 1,
              // Add individual service counts
              mobileClinicCount: { $size: '$mobileClinics' },
              vaccinationCount: { $size: '$vaccinations' },
              equineHealthCount: { $size: '$equineHealths' },
              laboratoryCount: { $size: '$laboratories' },
              parasiteControlCount: { $size: '$parasiteControls' }
            }
          },
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: parseInt(limit) }
        ];

        clients = await Client.aggregate(aggregationPipeline);
        
        // Populate createdBy and updatedBy fields
        for (let client of clients) {
          if (client.createdBy) {
            const createdByUser = await Client.findById(client._id).populate('createdBy', 'name email');
            client.createdBy = createdByUser?.createdBy;
          }
          if (client.updatedBy) {
            const updatedByUser = await Client.findById(client._id).populate('updatedBy', 'name email');
            client.updatedBy = updatedByUser?.updatedBy;
          }
        }
      } else {
        // Simple query without aggregation
        clients = await Client.find(filter)
          .populate('createdBy', 'name email')
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ createdAt: -1 });
      }
    } catch (findError) {
      console.error('Error finding clients:', findError);
      clients = [];
    }
    
    try {
      total = await Client.countDocuments(filter);
    } catch (countError) {
      console.error('Error counting clients:', countError);
      total = 0;
    }

    res.json({
      success: true,
      data: clients,
      total: total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    });
  })
);

/**
 * @swagger
 * /api/clients/statistics:
 *   get:
 *     summary: Get clients statistics
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/statistics',
  auth,
  asyncHandler(async (req, res) => {
    try {
      const totalClients = await Client.countDocuments();
      const activeClients = await Client.countDocuments({ status: 'نشط' });
      const inactiveClients = totalClients - activeClients;
      
      // Simple statistics without complex aggregation
      const statistics = {
        totalClients,
        activeClients,
        inactiveClients,
        totalAnimals: 0 // Will be calculated if needed
      };

      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      console.error('Error getting clients statistics:', error);
      
      // Return basic count if aggregation fails
      let basicStats = {
        totalClients: 0,
        activeClients: 0,
        inactiveClients: 0,
        totalAnimals: 0
      };
      
      try {
        basicStats.totalClients = await Client.countDocuments();
      } catch (countError) {
        console.error('Error counting clients:', countError);
      }
      
      res.json({
        success: true,
        data: basicStats
      });
    }
  })
);

/**
 * @swagger
 * /api/clients/export:
 *   get:
 *     summary: Export clients data
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json, excel]
 *         description: Export format
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [نشط, غير نشط]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Data exported successfully
 */
router.get('/export',
  asyncHandler(async (req, res) => {
    // Add default user for export
    req.user = { _id: 'system', role: 'super_admin', name: 'System Export' };
    const { format = 'json', status } = req.query;
    
    const filter = {};
    if (status) filter.status = status;

    const clients = await Client.find(filter).sort({ createdAt: -1 });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const fields = [
        'name',
        'nationalId',
        'phone',
        'email',
        'village',
        'detailedAddress',
        'status',
        'totalAnimals',
        'createdAt'
      ];
      
      const parser = new Parser({ fields });
      const csv = parser.parse(clients);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=clients.csv');
      res.send(csv);
    } else if (format === 'excel') {
      const XLSX = require('xlsx');
      
      // Transform data for Excel export
      const transformedClients = clients.map(client => ({
        'Name': client.name || '',
        'National ID': client.nationalId || '',
        'Phone': client.phone || '',
        'Email': client.email || '',
        'Village': client.village || '',
        'Detailed Address': client.detailedAddress || '',
        'Status': client.status || '',
        'Total Animals': client.totalAnimals || 0,
        'Created At': client.createdAt ? client.createdAt.toISOString().split('T')[0] : ''
      }));
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Convert data to worksheet
      const worksheet = XLSX.utils.json_to_sheet(transformedClients);
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients');
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=clients.xlsx');
      res.send(excelBuffer);
    } else {
      res.json({
        success: true,
        data: { clients }
      });
    }
  })
);

/**
 * @swagger
 * /api/clients/template:
 *   get:
 *     summary: Download import template for clients
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Template downloaded successfully
 */
router.get('/template',
  asyncHandler(async (req, res) => {
    // Add default user for template
    req.user = { _id: 'system', role: 'super_admin', name: 'System Template' };
    
    // Call handleTemplate with proper context
    await handleTemplate(req, res, [
    {
      'Name': 'اسم العميل',
      'National ID': 'رقم الهوية',
      'Phone': 'رقم الهاتف',
      'Email': 'البريد الإلكتروني',
      'Village': 'القرية',
      'Detailed Address': 'العنوان التفصيلي',
      'Status': 'الحالة',
      'Birth Date': 'تاريخ الميلاد'
    }
  ], 'clients-template');
  })
);

/**
 * @swagger
 * /api/clients/import:
 *   post:
 *     summary: Import clients from CSV
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Import completed
 */
router.post('/import',
  auth,
  asyncHandler(async (req, res) => {
    // Use authenticated user for import
    // req.user is already set by auth middleware
    
    // Call handleImport with proper context
    await handleImport(req, res, Client, Client, async (row, userId, ClientModel, errors) => {
    // Check if client with same national ID already exists
    const existingClient = await ClientModel.findOne({ nationalId: row['National ID'] || row['رقم الهوية'] });
    if (existingClient) {
      errors.push({
        row: row.rowNumber,
        field: 'National ID',
        message: 'Client with this national ID already exists'
      });
      return null;
    }

    // Parse birth date
    let birthDate = null;
    if (row['Birth Date'] || row['تاريخ الميلاد']) {
      const dateStr = row['Birth Date'] || row['تاريخ الميلاد'];
      birthDate = new Date(dateStr);
      if (isNaN(birthDate.getTime())) {
        birthDate = null;
      }
    }

    // Create new client
    const client = new ClientModel({
      name: row['Name'] || row['اسم العميل'],
      nationalId: row['National ID'] || row['رقم الهوية'],
      phone: row['Phone'] || row['رقم الهاتف'] || '',
      email: row['Email'] || row['البريد الإلكتروني'] || '',
      village: row['Village'] || row['القرية'] || '',
      detailedAddress: row['Detailed Address'] || row['العنوان التفصيلي'] || '',
      status: row['Status'] || row['الحالة'] || 'نشط',
      birthDate: birthDate,
      animals: [],
      availableServices: [],
      createdBy: userId
    });

    await client.save();
    return client;
  });
  })
);

/**
 * @swagger
 * /api/clients/{id}:
 *   get:
 *     summary: Get client by ID
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     responses:
 *       200:
 *         description: Client retrieved successfully
 *       404:
 *         description: Client not found
 */
router.get('/:id',
  auth,
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
        error: 'CLIENT_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: { client }
    });
  })
);

/**
 * @swagger
 * /api/clients:
 *   post:
 *     summary: Create new client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Client'
 *     responses:
 *       201:
 *         description: Client created successfully
 *       400:
 *         description: Validation error or client already exists
 */
router.post('/',
  auth,
  validate(schemas.clientCreate),
  asyncHandler(async (req, res) => {
    // Check if client with same national ID already exists
    const existingClient = await Client.findOne({ nationalId: req.body.nationalId });
    if (existingClient) {
      return res.status(400).json({
        success: false,
        message: 'Client with this national ID already exists',
        error: 'CLIENT_EXISTS'
      });
    }

    const client = new Client({
      ...req.body,
      createdBy: req.user._id
    });

    await client.save();

    res.status(201).json({
      success: true,
      message: 'Client created successfully',
      data: { client }
    });
  })
);

/**
 * @swagger
 * /api/clients/{id}:
 *   put:
 *     summary: Update client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Client'
 *     responses:
 *       200:
 *         description: Client updated successfully
 *       404:
 *         description: Client not found
 */
router.put('/:id',
  auth,
  validate(schemas.clientCreate),
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
        error: 'CLIENT_NOT_FOUND'
      });
    }

    // Check if national ID is being changed and if it already exists
    if (req.body.nationalId !== client.nationalId) {
      const existingClient = await Client.findOne({ 
        nationalId: req.body.nationalId,
        _id: { $ne: req.params.id }
      });
      if (existingClient) {
        return res.status(400).json({
          success: false,
          message: 'National ID already exists',
          error: 'NATIONAL_ID_EXISTS'
        });
      }
    }

    // Update client
    Object.assign(client, req.body);
    client.updatedBy = req.user._id;
    await client.save();

    res.json({
      success: true,
      message: 'Client updated successfully',
      data: { client }
    });
  })
);

/**
 * @swagger
 * /api/clients/bulk-delete:
 *   delete:
 *     summary: Delete multiple clients
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of client IDs to delete
 *     responses:
 *       200:
 *         description: Clients deleted successfully
 *       400:
 *         description: Invalid request
 */
router.delete('/bulk-delete',
  auth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'IDs array is required and must not be empty',
        error: 'INVALID_REQUEST'
      });
    }

    // Validate ObjectIds
    const mongoose = require('mongoose');
    const invalidIds = ids.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ObjectId format',
        error: 'INVALID_OBJECT_ID',
        invalidIds
      });
    }

    try {
      // Check if records exist before deletion
      const existingRecords = await Client.find({ _id: { $in: ids } });
      const existingIds = existingRecords.map(record => record._id.toString());
      const notFoundIds = ids.filter(id => !existingIds.includes(id));
      
      // If no records found at all, return error
      if (existingIds.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No clients found to delete',
          error: 'RESOURCE_NOT_FOUND',
          notFoundIds: ids,
          foundCount: 0,
          requestedCount: ids.length
        });
      }

      const result = await Client.deleteMany({ _id: { $in: existingIds } });
      
      // Prepare response with details about what was deleted and what wasn't found
      const response = {
        success: true,
        message: `${result.deletedCount} clients deleted successfully`,
        deletedCount: result.deletedCount,
        requestedCount: ids.length,
        foundCount: existingIds.length
      };

      // Add warning if some records were not found
      if (notFoundIds.length > 0) {
        response.warning = `${notFoundIds.length} clients were not found and could not be deleted`;
        response.notFoundIds = notFoundIds;
        response.notFoundCount = notFoundIds.length;
      }

      res.json(response);
    } catch (error) {
      console.error('Bulk delete error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error deleting clients',
        error: 'DELETE_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/clients/delete-all:
 *   delete:
 *     summary: Delete all clients
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All clients deleted successfully
 */
router.delete('/delete-all',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const result = await Client.deleteMany({});
    
    res.json({
      success: true,
      message: `All clients deleted successfully`,
      deletedCount: result.deletedCount
    });
  })
);

/**
 * @swagger
 * /api/clients/{id}:
 *   delete:
 *     summary: Delete client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     responses:
 *       200:
 *         description: Client deleted successfully
 *       404:
 *         description: Client not found
 */
router.delete('/:id',
  auth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
        error: 'CLIENT_NOT_FOUND'
      });
    }

    await Client.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });
  })
);

/**
 * @swagger
 * /api/clients/{id}/animals:
 *   post:
 *     summary: Add animal to client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Animal'
 *     responses:
 *       200:
 *         description: Animal added successfully
 *       404:
 *         description: Client not found
 */
router.post('/:id/animals',
  auth,
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
        error: 'CLIENT_NOT_FOUND'
      });
    }

    await client.addAnimal(req.body);

    res.json({
      success: true,
      message: 'Animal added successfully',
      data: { client }
    });
  })
);

/**
 * @swagger
 * /api/clients/{id}/animals/{animalIndex}:
 *   put:
 *     summary: Update client animal
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *       - in: path
 *         name: animalIndex
 *         required: true
 *         schema:
 *           type: integer
 *         description: Animal index in array
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Animal'
 *     responses:
 *       200:
 *         description: Animal updated successfully
 *       404:
 *         description: Client or animal not found
 */
router.put('/:id/animals/:animalIndex',
  auth,
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
        error: 'CLIENT_NOT_FOUND'
      });
    }

    try {
      await client.updateAnimal(parseInt(req.params.animalIndex), req.body);
      
      res.json({
        success: true,
        message: 'Animal updated successfully',
        data: { client }
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message,
        error: 'ANIMAL_NOT_FOUND'
      });
    }
  })
);

/**
 * @swagger
 * /api/clients/{id}/animals/{animalIndex}:
 *   delete:
 *     summary: Remove animal from client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *       - in: path
 *         name: animalIndex
 *         required: true
 *         schema:
 *           type: integer
 *         description: Animal index in array
 *     responses:
 *       200:
 *         description: Animal removed successfully
 *       404:
 *         description: Client or animal not found
 */
router.delete('/:id/animals/:animalIndex',
  auth,
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
        error: 'CLIENT_NOT_FOUND'
      });
    }

    try {
      await client.removeAnimal(parseInt(req.params.animalIndex));
      
      res.json({
        success: true,
        message: 'Animal removed successfully',
        data: { client }
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message,
        error: 'ANIMAL_NOT_FOUND'
      });
    }
  })
);

module.exports = router;
