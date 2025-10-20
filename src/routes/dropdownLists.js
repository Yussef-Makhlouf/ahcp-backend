const express = require('express');
const router = express.Router();
const DropdownList = require('../models/DropdownList');
const { auth } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');

/**
 * @swagger
 * tags:
 *   name: DropdownLists
 *   description: Dropdown list management
 */

/**
 * @swagger
 * /api/dropdown-lists:
 *   get:
 *     summary: Get all dropdown list options
 *     tags: [DropdownLists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in labels
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of dropdown options
 *       401:
 *         description: Unauthorized
 */
router.get('/', auth, async (req, res) => {
  try {
    const { category, search, page = 1, limit = 50 } = req.query;
    
    // Build filter
    const filter = {};
    if (category) filter.category = category;
    
    if (search) {
      filter.$or = [
        { label: { $regex: search, $options: 'i' } },
        { labelAr: { $regex: search, $options: 'i' } },
        { value: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [options, total] = await Promise.all([
      DropdownList.find(filter)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .sort({ category: 1, createdAt: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      DropdownList.countDocuments(filter)
    ]);
    
    res.json({
      success: true,
      data: options,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get dropdown lists error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dropdown lists',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/dropdown-lists/categories:
 *   get:
 *     summary: Get all available categories
 *     tags: [DropdownLists]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of categories
 */
router.get('/categories', auth, async (req, res) => {
  try {
    let categories = await DropdownList.getCategories();
    
    // If no categories exist, return default categories
    if (categories.length === 0) {
      categories = [
        'vaccine_types',
        'herd_health',
        'animals_handling',
        'labours',
        'reachable_location',
        'request_situation',
        'insecticide_types',
        'spray_methods',
        'insecticide_categories',
        'spray_status',
        'herd_health_status',
        'compliance',
        'breeding_sites',
        'intervention_categories',
        'horse_gender',
        'health_status',
        'administration_routes',
        'sample_types'
      ];
    }
    
    // Get category info with counts
    const categoryInfo = await Promise.all(
      categories.map(async (category) => {
        const stats = await DropdownList.getCategoryStats(category);
        const categoryStats = stats[0] || { total: 0 };
        
        return {
          category,
          label: getCategoryLabel(category),
          labelAr: getCategoryLabelAr(category),
          ...categoryStats
        };
      })
    );
    
    res.json({
      success: true,
      data: categoryInfo
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/dropdown-lists/by-category/{category}:
 *   get:
 *     summary: Get options by category
 *     tags: [DropdownLists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: Category name
 *     responses:
 *       200:
 *         description: Options for the category
 */
router.get('/by-category/:category', auth, [
  param('category').notEmpty().withMessage('Category is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }
    
    const { category } = req.params;
    const { includeInactive } = req.query;
    
    const options = await DropdownList.getByCategory(category, includeInactive === 'true');
    
    res.json({
      success: true,
      data: options,
      category: {
        name: category,
        label: getCategoryLabel(category),
        labelAr: getCategoryLabelAr(category)
      }
    });
  } catch (error) {
    console.error('Get options by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch options',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/dropdown-lists/{id}:
 *   get:
 *     summary: Get dropdown option by ID
 *     tags: [DropdownLists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Option ID
 *     responses:
 *       200:
 *         description: Dropdown option details
 *       404:
 *         description: Option not found
 */
router.get('/:id', auth, [
  param('id').isMongoId().withMessage('Invalid option ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }
    
    const option = await DropdownList.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    if (!option) {
      return res.status(404).json({
        success: false,
        message: 'Dropdown option not found'
      });
    }
    
    // Check if option is used in records
    const usageInfo = await option.isUsedInRecords();
    
    res.json({
      success: true,
      data: {
        ...option.toObject(),
        usage: usageInfo
      }
    });
  } catch (error) {
    console.error('Get dropdown option error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dropdown option',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/dropdown-lists:
 *   post:
 *     summary: Create new dropdown option
 *     tags: [DropdownLists]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category
 *               - value
 *               - label
 *               - labelAr
 *             properties:
 *               category:
 *                 type: string
 *               value:
 *                 type: string
 *               label:
 *                 type: string
 *               labelAr:
 *                 type: string
 *               description:
 *                 type: string
 *               descriptionAr:
 *                 type: string
 *               color:
 *                 type: string
 *               icon:
 *                 type: string
 *     responses:
 *       201:
 *         description: Option created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate value
 */
router.post('/', auth, [
  body('category').notEmpty().withMessage('Category is required'),
  body('value').notEmpty().withMessage('Value is required'),
  body('label').notEmpty().withMessage('Label is required'),
  body('labelAr').notEmpty().withMessage('Arabic label is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }
    
    // Check permissions
    if (!['super_admin', 'section_supervisor'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }
    
    const optionData = {
      ...req.body,
      createdBy: req.user._id
    };
    
    const option = new DropdownList(optionData);
    await option.save();
    
    await option.populate('createdBy', 'name email');
    
    res.status(201).json({
      success: true,
      message: 'Dropdown option created successfully',
      data: option
    });
  } catch (error) {
    console.error('Create dropdown option error:', error);
    
    if (error.code === 'DUPLICATE_VALUE') {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create dropdown option',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/dropdown-lists/{id}:
 *   put:
 *     summary: Update dropdown option
 *     tags: [DropdownLists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Option ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DropdownList'
 *     responses:
 *       200:
 *         description: Option updated successfully
 *       404:
 *         description: Option not found
 */
router.put('/:id', auth, [
  param('id').isMongoId().withMessage('Invalid option ID'),
  body('category').optional().notEmpty().withMessage('Category cannot be empty'),
  body('value').optional().notEmpty().withMessage('Value cannot be empty'),
  body('label').optional().notEmpty().withMessage('Label cannot be empty'),
  body('labelAr').optional().notEmpty().withMessage('Arabic label cannot be empty')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }
    
    // Check permissions
    if (!['super_admin', 'section_supervisor'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }
    
    const updateData = {
      ...req.body,
      updatedBy: req.user._id
    };
    
    const option = await DropdownList.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy updatedBy', 'name email');
    
    if (!option) {
      return res.status(404).json({
        success: false,
        message: 'Dropdown option not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Dropdown option updated successfully',
      data: option
    });
  } catch (error) {
    console.error('Update dropdown option error:', error);
    
    if (error.code === 'DUPLICATE_VALUE') {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to update dropdown option',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/dropdown-lists/{id}:
 *   delete:
 *     summary: Delete dropdown option
 *     tags: [DropdownLists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Option ID
 *       - in: query
 *         name: force
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Force delete even if used in records
 *     responses:
 *       200:
 *         description: Option deleted successfully
 *       400:
 *         description: Option is in use
 *       404:
 *         description: Option not found
 */
router.delete('/:id', auth, [
  param('id').isMongoId().withMessage('Invalid option ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }
    
    // Check permissions - only super admin can delete
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Only super admin can delete dropdown options'
      });
    }
    
    const option = await DropdownList.findById(req.params.id);
    if (!option) {
      return res.status(404).json({
        success: false,
        message: 'Dropdown option not found'
      });
    }
    
    // Check if option is used in records
    const usageInfo = await option.isUsedInRecords();
    const { force = 'false' } = req.query;
    
    if (usageInfo.used && force !== 'true') {
      return res.status(400).json({
        success: false,
        message: `Cannot delete option. It is used in ${usageInfo.count} ${usageInfo.model} records`,
        usage: usageInfo
      });
    }
    
    await DropdownList.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Dropdown option deleted successfully',
      usage: usageInfo
    });
  } catch (error) {
    console.error('Delete dropdown option error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete dropdown option',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/dropdown-lists/bulk-create:
 *   post:
 *     summary: Bulk create dropdown options
 *     tags: [DropdownLists]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category:
 *                 type: string
 *               options:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     value:
 *                       type: string
 *                     label:
 *                       type: string
 *                     labelAr:
 *                       type: string
 *     responses:
 *       201:
 *         description: Options created successfully
 */
router.post('/bulk-create', auth, [
  body('category').notEmpty().withMessage('Category is required'),
  body('options').isArray({ min: 1 }).withMessage('Options array is required'),
  body('options.*.value').notEmpty().withMessage('Value is required for each option'),
  body('options.*.label').notEmpty().withMessage('Label is required for each option'),
  body('options.*.labelAr').notEmpty().withMessage('Arabic label is required for each option')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }
    
    // Check permissions
    if (!['super_admin', 'section_supervisor'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }
    
    const { category, options } = req.body;
    
    const optionsToCreate = options.map((option) => ({
      ...option,
      category,
      createdBy: req.user._id
    }));
    
    const createdOptions = await DropdownList.insertMany(optionsToCreate);
    
    res.status(201).json({
      success: true,
      message: `${createdOptions.length} dropdown options created successfully`,
      data: createdOptions
    });
  } catch (error) {
    console.error('Bulk create dropdown options error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create dropdown options',
      error: error.message
    });
  }
});

// Helper functions for category labels
function getCategoryLabel(category) {
  const labels = {
    vaccine_types: 'Vaccine Types',
    herd_health: 'Herd Health',
    animals_handling: 'Animals Handling',
    labours: 'Labour Status',
    reachable_location: 'Location Accessibility',
    request_situation: 'Request Situation',
    insecticide_types: 'Insecticide Types',
    spray_methods: 'Spray Methods',
    insecticide_categories: 'Insecticide Categories',
    spray_status: 'Spray Status',
    herd_health_status: 'Herd Health Status',
    compliance: 'Compliance Status',
    breeding_sites: 'Breeding Sites',
    intervention_categories: 'Intervention Categories',
    horse_gender: 'Horse Gender',
    health_status: 'Health Status',
    administration_routes: 'Administration Routes',
    sample_types: 'Sample Types',
    priority_levels: 'Priority Levels',
    task_status: 'Task Status',
    reminder_times: 'Reminder Times',
    recurring_types: 'Recurring Types',
    time_periods: 'Time Periods',
    user_roles: 'User Roles'
  };
  return labels[category] || category;
}

function getCategoryLabelAr(category) {
  const labelsAr = {
    vaccine_types: 'أنواع المصل',
    herd_health: 'حالة القطيع',
    animals_handling: 'معاملة الحيوانات',
    labours: 'حالة العمال',
    reachable_location: 'سهولة الوصول للموقع',
    request_situation: 'حالة الطلب',
    insecticide_types: 'أنواع المبيدات',
    spray_methods: 'طرق الرش',
    insecticide_categories: 'فئات المبيد',
    spray_status: 'حالة الرش',
    herd_health_status: 'حالة القطيع الصحية',
    compliance: 'الامتثال للتعليمات',
    breeding_sites: 'مواقع التكاثر',
    intervention_categories: 'فئات التدخل',
    horse_gender: 'جنس الخيل',
    health_status: 'حالة الصحة',
    administration_routes: 'طرق إعطاء الدواء',
    sample_types: 'أنواع العينات',
    priority_levels: 'مستويات الأولوية',
    task_status: 'حالة المهمة',
    reminder_times: 'أوقات التذكير',
    recurring_types: 'أنواع التكرار',
    time_periods: 'الفترات الزمنية',
    user_roles: 'أدوار المستخدمين'
  };
  return labelsAr[category] || category;
}

module.exports = router;
