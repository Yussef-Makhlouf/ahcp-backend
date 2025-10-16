const express = require('express');
const Village = require('../models/Village');
const Client = require('../models/Client');
const { auth, authorize } = require('../middleware/auth');
const { body, validationResult, param } = require('express-validator');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Villages
 *   description: Village management endpoints
 */

/**
 * @swagger
 * /api/villages:
 *   get:
 *     summary: Get all villages
 *     tags: [Villages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *         description: Filter by region
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in village name
 *     responses:
 *       200:
 *         description: Villages retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     villages:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Village'
 *                     total:
 *                       type: number
 */
router.get('/', auth, async (req, res) => {
  try {
    const { active, region, search } = req.query;
    
    let query = {};
    
    // Filter by active status
    if (active !== undefined) {
      query.isActive = active === 'true';
    }
    
    // Filter by region
    if (region) {
      query.region = new RegExp(region, 'i');
    }
    
    // Search in name
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { nameEn: new RegExp(search, 'i') },
        { code: new RegExp(search, 'i') }
      ];
    }
    
    const villages = await Village.find(query)
      .populate('createdBy', 'name email')
      .populate('clientCount')
      .sort({ name: 1 });
    
    res.json({
      success: true,
      data: {
        villages,
        total: villages.length
      }
    });
  } catch (error) {
    console.error('Error fetching villages:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في استرجاع القرى',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/villages/stats:
 *   get:
 *     summary: Get villages statistics
 *     tags: [Villages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Villages statistics retrieved successfully
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const totalVillages = await Village.countDocuments();
    const activeVillages = await Village.countDocuments({ isActive: true });
    const inactiveVillages = totalVillages - activeVillages;
    
    // Get regions count
    const regions = await Village.aggregate([
      { $group: { _id: '$region', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get villages with most clients
    const villagesWithClients = await Village.aggregate([
      {
        $lookup: {
          from: 'clients',
          localField: 'name',
          foreignField: 'village',
          as: 'clients'
        }
      },
      {
        $project: {
          name: 1,
          clientCount: { $size: '$clients' }
        }
      },
      { $sort: { clientCount: -1 } },
      { $limit: 5 }
    ]);
    
    res.json({
      success: true,
      data: {
        totalVillages,
        activeVillages,
        inactiveVillages,
        regionsCount: regions.length,
        topRegions: regions.slice(0, 5),
        villagesWithMostClients: villagesWithClients
      }
    });
  } catch (error) {
    console.error('Error fetching villages stats:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في استرجاع إحصائيات القرى',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/villages/{id}:
 *   get:
 *     summary: Get village by ID
 *     tags: [Villages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Village ID
 *     responses:
 *       200:
 *         description: Village retrieved successfully
 *       404:
 *         description: Village not found
 */
router.get('/:id', auth, param('id').isMongoId(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير صحيحة',
        errors: errors.array()
      });
    }
    
    const village = await Village.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('clientCount');
    
    if (!village) {
      return res.status(404).json({
        success: false,
        message: 'القرية غير موجودة'
      });
    }
    
    res.json({
      success: true,
      data: { village }
    });
  } catch (error) {
    console.error('Error fetching village:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في استرجاع القرية',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/villages:
 *   post:
 *     summary: Create a new village
 *     tags: [Villages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *             properties:
 *               name:
 *                 type: string
 *               nameEn:
 *                 type: string
 *               code:
 *                 type: string
 *               region:
 *                 type: string
 *               description:
 *                 type: string
 *               coordinates:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                   longitude:
 *                     type: number
 *               population:
 *                 type: number
 *     responses:
 *       201:
 *         description: Village created successfully
 *       400:
 *         description: Validation error
 */
router.post('/', 
  auth,
  authorize(['admin', 'supervisor']),
  [
    body('name')
      .notEmpty()
      .withMessage('اسم القرية مطلوب')
      .isLength({ max: 100 })
      .withMessage('اسم القرية لا يمكن أن يتجاوز 100 حرف'),
    body('nameEn')
      .optional()
      .isLength({ max: 100 })
      .withMessage('الاسم الإنجليزي لا يمكن أن يتجاوز 100 حرف'),
    body('code')
      .notEmpty()
      .withMessage('رمز القرية مطلوب')
      .isLength({ max: 20 })
      .withMessage('رمز القرية لا يمكن أن يتجاوز 20 حرف')
      .matches(/^[A-Z0-9_-]+$/)
      .withMessage('رمز القرية يجب أن يحتوي على أحرف إنجليزية كبيرة وأرقام فقط'),
    body('region')
      .optional()
      .isLength({ max: 100 })
      .withMessage('اسم المنطقة لا يمكن أن يتجاوز 100 حرف'),
    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('الوصف لا يمكن أن يتجاوز 500 حرف'),
    body('coordinates.latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('خط العرض يجب أن يكون بين -90 و 90'),
    body('coordinates.longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('خط الطول يجب أن يكون بين -180 و 180'),
    body('population')
      .optional()
      .isInt({ min: 0 })
      .withMessage('عدد السكان يجب أن يكون رقم موجب')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'بيانات غير صحيحة',
          errors: errors.array()
        });
      }
      
      const villageData = {
        ...req.body,
        createdBy: req.user._id
      };
      
      const village = new Village(villageData);
      await village.save();
      
      await village.populate('createdBy', 'name email');
      
      res.status(201).json({
        success: true,
        message: 'تم إنشاء القرية بنجاح',
        data: { village }
      });
    } catch (error) {
      console.error('Error creating village:', error);
      
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'رمز القرية موجود مسبقاً'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'خطأ في إنشاء القرية',
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /api/villages/{id}:
 *   put:
 *     summary: Update village
 *     tags: [Villages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Village ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Village'
 *     responses:
 *       200:
 *         description: Village updated successfully
 *       404:
 *         description: Village not found
 */
router.put('/:id',
  auth,
  authorize(['admin', 'supervisor']),
  param('id').isMongoId(),
  [
    body('name')
      .optional()
      .notEmpty()
      .withMessage('اسم القرية مطلوب')
      .isLength({ max: 100 })
      .withMessage('اسم القرية لا يمكن أن يتجاوز 100 حرف'),
    body('nameEn')
      .optional()
      .isLength({ max: 100 })
      .withMessage('الاسم الإنجليزي لا يمكن أن يتجاوز 100 حرف'),
    body('code')
      .optional()
      .notEmpty()
      .withMessage('رمز القرية مطلوب')
      .isLength({ max: 20 })
      .withMessage('رمز القرية لا يمكن أن يتجاوز 20 حرف')
      .matches(/^[A-Z0-9_-]+$/)
      .withMessage('رمز القرية يجب أن يحتوي على أحرف إنجليزية كبيرة وأرقام فقط'),
    body('region')
      .optional()
      .isLength({ max: 100 })
      .withMessage('اسم المنطقة لا يمكن أن يتجاوز 100 حرف'),
    body('description')
      .optional()
      .isLength({ max: 500 })
      .withMessage('الوصف لا يمكن أن يتجاوز 500 حرف'),
    body('coordinates.latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('خط العرض يجب أن يكون بين -90 و 90'),
    body('coordinates.longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('خط الطول يجب أن يكون بين -180 و 180'),
    body('population')
      .optional()
      .isInt({ min: 0 })
      .withMessage('عدد السكان يجب أن يكون رقم موجب')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'بيانات غير صحيحة',
          errors: errors.array()
        });
      }
      
      const village = await Village.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      ).populate('createdBy', 'name email');
      
      if (!village) {
        return res.status(404).json({
          success: false,
          message: 'القرية غير موجودة'
        });
      }
      
      res.json({
        success: true,
        message: 'تم تحديث القرية بنجاح',
        data: { village }
      });
    } catch (error) {
      console.error('Error updating village:', error);
      
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'رمز القرية موجود مسبقاً'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'خطأ في تحديث القرية',
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /api/villages/{id}/toggle-status:
 *   put:
 *     summary: Toggle village active status
 *     tags: [Villages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Village ID
 *     responses:
 *       200:
 *         description: Village status updated successfully
 *       404:
 *         description: Village not found
 */
router.put('/:id/toggle-status',
  auth,
  authorize(['admin', 'supervisor']),
  param('id').isMongoId(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'بيانات غير صحيحة',
          errors: errors.array()
        });
      }
      
      const village = await Village.findById(req.params.id);
      
      if (!village) {
        return res.status(404).json({
          success: false,
          message: 'القرية غير موجودة'
        });
      }
      
      await village.toggleStatus();
      await village.populate('createdBy', 'name email');
      
      res.json({
        success: true,
        message: `تم ${village.isActive ? 'تفعيل' : 'إلغاء تفعيل'} القرية بنجاح`,
        data: { village }
      });
    } catch (error) {
      console.error('Error toggling village status:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في تحديث حالة القرية',
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /api/villages/{id}:
 *   delete:
 *     summary: Delete village
 *     tags: [Villages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Village ID
 *     responses:
 *       200:
 *         description: Village deleted successfully
 *       400:
 *         description: Cannot delete village with associated clients
 *       404:
 *         description: Village not found
 */
router.delete('/:id',
  auth,
  authorize(['admin']),
  param('id').isMongoId(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'بيانات غير صحيحة',
          errors: errors.array()
        });
      }
      
      const village = await Village.findById(req.params.id);
      
      if (!village) {
        return res.status(404).json({
          success: false,
          message: 'القرية غير موجودة'
        });
      }
      
      // Check if village has associated clients
      const clientCount = await Client.countDocuments({ village: village.name });
      
      if (clientCount > 0) {
        return res.status(400).json({
          success: false,
          message: `لا يمكن حذف القرية لوجود ${clientCount} عميل مرتبط بها`
        });
      }
      
      await Village.findByIdAndDelete(req.params.id);
      
      res.json({
        success: true,
        message: 'تم حذف القرية بنجاح'
      });
    } catch (error) {
      console.error('Error deleting village:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في حذف القرية',
        error: error.message
      });
    }
  }
);

module.exports = router;
