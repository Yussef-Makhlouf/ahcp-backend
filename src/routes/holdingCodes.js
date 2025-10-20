const express = require('express');
const router = express.Router();
const HoldingCode = require('../models/HoldingCode');
const Client = require('../models/Client');
const { auth, authorize } = require('../middleware/auth');

/**
 * @swagger
 * /api/holding-codes:
 *   get:
 *     summary: Get all holding codes with filtering
 *     tags: [HoldingCodes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: client
 *         schema:
 *           type: string
 *         description: Filter by client ID
 *       - in: query
 *         name: village
 *         schema:
 *           type: string
 *         description: Filter by village name
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of holding codes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/HoldingCode'
 */
router.get('/', auth, async (req, res) => {
  try {
    const { village, active, page = 1, limit = 10, search } = req.query;
    
    console.log('🔍 GET /holding-codes - Query params:', { village, active, page, limit, search });
    
    // Build filter object
    const filter = {};
    if (village) filter.village = village;
    if (active !== undefined) filter.isActive = active === 'true';
    
    console.log('📋 Filter object:', filter);
    
    // Add search functionality
    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { village: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Get total count for pagination
    const totalCount = await HoldingCode.countDocuments(filter);
    
    // Get paginated results
    const holdingCodes = await HoldingCode.find(filter)
      .populate('createdBy', 'name email')
      .sort({ village: 1, code: 1 })
      .skip(skip)
      .limit(limitNum);
    
    console.log('✅ Found holding codes:', holdingCodes.length);
    console.log('📋 Holding codes data:', holdingCodes.map(hc => ({ code: hc.code, village: hc.village })));
    
    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.json({
      success: true,
      data: holdingCodes,
      pagination: {
        page: pageNum,
        pages: totalPages,
        total: totalCount,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Get holding codes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching holding codes',
      error: error.message
    });
  }
});


/**
 * @swagger
 * /api/holding-codes/by-village/{village}:
 *   get:
 *     summary: Get holding codes by village
 *     tags: [HoldingCodes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: village
 *         required: true
 *         schema:
 *           type: string
 *         description: Village name
 *     responses:
 *       200:
 *         description: Village's holding codes
 */
/**
 * @swagger
 * /api/holding-codes/stats:
 *   get:
 *     summary: Get holding codes statistics
 *     tags: [HoldingCodes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Holding codes statistics
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const totalCodes = await HoldingCode.countDocuments();
    const activeCodes = await HoldingCode.countDocuments({ isActive: true });
    const inactiveCodes = await HoldingCode.countDocuments({ isActive: false });
    
    // Get unique villages count
    const uniqueVillages = await HoldingCode.distinct('village');
    const villagesCount = uniqueVillages.length;
    
    res.json({
      success: true,
      data: {
        total: totalCodes,
        active: activeCodes,
        inactive: inactiveCodes,
        villages: villagesCount
      }
    });
  } catch (error) {
    console.error('Get holding codes stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching holding codes statistics',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/holding-codes/{id}:
 *   get:
 *     summary: Get holding code by ID
 *     tags: [HoldingCodes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Holding code ID
 *     responses:
 *       200:
 *         description: Holding code details
 *       404:
 *         description: Holding code not found
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const holdingCode = await HoldingCode.findById(id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    if (!holdingCode) {
      return res.status(404).json({
        success: false,
        message: 'Holding code not found'
      });
    }
    
    res.json({
      success: true,
      data: holdingCode
    });
  } catch (error) {
    console.error('Get holding code error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching holding code',
      error: error.message
    });
  }
});

router.get('/by-village/:village', auth, async (req, res) => {
  try {
    const { village } = req.params;
    
    const holdingCodes = await HoldingCode.findByVillage(village);
    
    res.json({
      success: true,
      data: holdingCodes
    });
  } catch (error) {
    console.error('Get village holding codes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching village holding codes',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/holding-codes:
 *   post:
 *     summary: Create a new holding code
 *     tags: [HoldingCodes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - client
 *               - village
 *             properties:
 *               code:
 *                 type: string
 *               client:
 *                 type: string
 *               village:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Holding code created successfully
 */
router.post('/', auth, authorize(['admin', 'supervisor']), async (req, res) => {
  try {
    const { code, village, description } = req.body;
    
    // Validate required fields
    if (!code || !village) {
      return res.status(400).json({
        success: false,
        message: 'Code and village are required'
      });
    }
    
    // Create holding code
    const holdingCode = new HoldingCode({
      code: code.trim(),
      village: village.trim(),
      description: description?.trim(),
      createdBy: req.user._id
    });
    
    await holdingCode.save();
    
    // Populate the response
    await holdingCode.populate('createdBy', 'name email');
    
    res.status(201).json({
      success: true,
      data: holdingCode,
      message: 'Holding code created successfully'
    });
  } catch (error) {
    console.error('Create holding code error:', error);
    
    if (error.code === 'DUPLICATE_VILLAGE_HOLDING_CODE') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This village already has a holding code'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating holding code',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/holding-codes/{id}:
 *   put:
 *     summary: Update a holding code
 *     tags: [HoldingCodes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *               village:
 *                 type: string
 *               description:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Holding code updated successfully
 */
router.put('/:id', auth, authorize(['admin', 'supervisor']), async (req, res) => {
  try {
    const { id } = req.params;
    const { code, village, description, isActive } = req.body;
    
    const holdingCode = await HoldingCode.findById(id);
    if (!holdingCode) {
      return res.status(404).json({
        success: false,
        message: 'Holding code not found'
      });
    }
    
    // Update fields
    if (code !== undefined) holdingCode.code = code.trim();
    if (village !== undefined) holdingCode.village = village.trim();
    if (description !== undefined) holdingCode.description = description?.trim();
    if (isActive !== undefined) holdingCode.isActive = isActive;
    holdingCode.updatedBy = req.user._id;
    
    await holdingCode.save();
    
    // Populate the response
    await holdingCode.populate('createdBy', 'name email');
    await holdingCode.populate('updatedBy', 'name email');
    
    res.json({
      success: true,
      data: holdingCode,
      message: 'Holding code updated successfully'
    });
  } catch (error) {
    console.error('Update holding code error:', error);
    
    if (error.code === 'DUPLICATE_HOLDING_CODE') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.code === 'DUPLICATE_VILLAGE_HOLDING_CODE') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating holding code',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/holding-codes/{id}:
 *   delete:
 *     summary: Delete a holding code
 *     tags: [HoldingCodes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Holding code deleted successfully
 */
router.delete('/:id', auth, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const holdingCode = await HoldingCode.findById(id);
    if (!holdingCode) {
      return res.status(404).json({
        success: false,
        message: 'Holding code not found'
      });
    }
    
    // Check if holding code is being used in any records
    const models = [
      require('../models/ParasiteControl'),
      require('../models/MobileClinic'),
      require('../models/EquineHealth'),
      require('../models/Vaccination'),
      require('../models/Laboratory')
    ];
    
    for (const Model of models) {
      const count = await Model.countDocuments({ holdingCode: id });
      if (count > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete holding code. It is being used in ${count} record(s).`
        });
      }
    }
    
    await HoldingCode.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: 'Holding code deleted successfully'
    });
  } catch (error) {
    console.error('Delete holding code error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting holding code',
      error: error.message
    });
  }
});

module.exports = router;
