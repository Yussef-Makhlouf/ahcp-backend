const express = require('express');
const Client = require('../models/Client');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

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
    const { page = 1, limit = 10, status, village, search, animalType } = req.query;
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

    // Get clients
    const clients = await Client.find(filter)
      .populate('createdBy', 'name email')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Client.countDocuments(filter);

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
      const basicStats = {
        totalClients: await Client.countDocuments(),
        activeClients: 0,
        inactiveClients: 0,
        totalAnimals: 0
      };
      
      res.json({
        success: true,
        data: basicStats
      });
    }
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
 *           enum: [csv, json]
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
  auth,
  asyncHandler(async (req, res) => {
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
    } else {
      res.json({
        success: true,
        data: { clients }
      });
    }
  })
);

module.exports = router;
