const express = require('express');
const Section = require('../models/Section');
const User = require('../models/User');
const { validate, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @swagger
 * /api/sections:
 *   get:
 *     summary: Get all sections
 *     tags: [Sections]
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
 *         description: Number of sections per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in section name or code
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Sections retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get('/',
  auth,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 30, search, active } = req.query;
    const skip = (page - 1) * limit;

    // Build filter (isActive removed - all sections are active)
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { nameEn: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Get sections with populated data
    const sections = await Section.find(filter)
      .populate('createdBy', 'name email')
      .populate('supervisorCount')
      .populate('workerCount')
      .populate('totalUsers')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ name: 1 });

    const total = await Section.countDocuments(filter);

    res.json({
      success: true,
      data: {
        sections,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  })
);

/**
 * @swagger
 * /api/sections/active:
 *   get:
 *     summary: Get all active sections for dropdown (public)
 *     tags: [Sections]
 *     responses:
 *       200:
 *         description: Active sections retrieved successfully
 */
router.get('/active',
  asyncHandler(async (req, res) => {
    const sections = await Section.findActive()
      .select('name nameEn code description')
      .lean();

    res.json({
      success: true,
      data: sections,
      count: sections.length
    });
  })
);

/**
 * @swagger
 * /api/sections/{id}:
 *   get:
 *     summary: Get section by ID
 *     tags: [Sections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Section ID
 *     responses:
 *       200:
 *         description: Section retrieved successfully
 *       404:
 *         description: Section not found
 */
router.get('/:id',
  auth,
  asyncHandler(async (req, res) => {
    const section = await Section.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('supervisorCount')
      .populate('workerCount')
      .populate('totalUsers');

    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'القسم غير موجود',
        error: 'SECTION_NOT_FOUND'
      });
    }

    // Get users in this section
    const users = await User.find({ 
      section: section.code
    }).select('name email role').sort({ name: 1 });

    res.json({
      success: true,
      data: {
        section,
        users
      }
    });
  })
);

/**
 * @swagger
 * /api/sections:
 *   post:
 *     summary: Create new section
 *     tags: [Sections]
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
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Section created successfully
 *       400:
 *         description: Validation error or section already exists
 */
router.post('/',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const { name, nameEn, code, description } = req.body;

    // Validation
    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'اسم القسم ورمزه مطلوبان',
        error: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Check if section with same code exists
    const existingSection = await Section.findOne({ 
      code: code.toUpperCase() 
    });
    if (existingSection) {
      return res.status(400).json({
        success: false,
        message: 'قسم بنفس الرمز موجود بالفعل',
        error: 'SECTION_CODE_EXISTS'
      });
    }

    // Create section
    const section = new Section({
      name,
      nameEn,
      code: code.toUpperCase(),
      description,
      createdBy: req.user._id
    });

    await section.save();

    // Populate created section
    await section.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'تم إنشاء القسم بنجاح',
      data: section
    });
  })
);

/**
 * @swagger
 * /api/sections/{id}:
 *   put:
 *     summary: Update section
 *     tags: [Sections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Section ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               nameEn:
 *                 type: string
 *               code:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Section updated successfully
 *       404:
 *         description: Section not found
 */
router.put('/:id',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const { name, nameEn, code, description } = req.body;
    const sectionId = req.params.id;

    // Check if section exists
    const section = await Section.findById(sectionId);
    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'القسم غير موجود',
        error: 'SECTION_NOT_FOUND'
      });
    }

    // If code is being changed, check for conflicts
    if (code && code.toUpperCase() !== section.code) {
      const existingSection = await Section.findOne({ 
        code: code.toUpperCase(),
        _id: { $ne: sectionId }
      });
      if (existingSection) {
        return res.status(400).json({
          success: false,
          message: 'قسم بنفس الرمز موجود بالفعل',
          error: 'SECTION_CODE_EXISTS'
        });
      }

      // If code is changing, update all users in this section
      if (section.code !== code.toUpperCase()) {
        await User.updateMany(
          { section: section.code },
          { section: code.toUpperCase() }
        );
      }
    }

    // Update section
    const updatedSection = await Section.findByIdAndUpdate(
      sectionId,
      { name, nameEn, code: code?.toUpperCase(), description },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    res.json({
      success: true,
      message: 'تم تحديث القسم بنجاح',
      data: updatedSection
    });
  })
);

// Toggle status route removed - all sections are active by default

/**
 * @swagger
 * /api/sections/{id}:
 *   delete:
 *     summary: Delete section
 *     tags: [Sections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Section ID
 *     responses:
 *       200:
 *         description: Section deleted successfully
 *       400:
 *         description: Cannot delete section with users
 *       404:
 *         description: Section not found
 */
router.delete('/:id',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const section = await Section.findById(req.params.id);
    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'القسم غير موجود',
        error: 'SECTION_NOT_FOUND'
      });
    }

    // Check if section has users
    const userCount = await User.countDocuments({ 
      section: section.code
    });
    
    if (userCount > 0) {
      return res.status(400).json({
        success: false,
        message: `لا يمكن حذف القسم لأنه يحتوي على ${userCount} مستخدم نشط`,
        error: 'SECTION_HAS_USERS'
      });
    }

    await Section.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'تم حذف القسم بنجاح'
    });
  })
);

/**
 * @swagger
 * /api/sections/{code}/users:
 *   get:
 *     summary: Get users in a specific section
 *     tags: [Sections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Section code
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [super_admin, section_supervisor, field_worker]
 *         description: Filter by role
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       404:
 *         description: Section not found
 */
router.get('/:code/users',
  auth,
  asyncHandler(async (req, res) => {
    const { code } = req.params;
    const { role } = req.query;

    // Check if section exists
    const section = await Section.findByCode(code);
    if (!section) {
      return res.status(404).json({
        success: false,
        message: 'القسم غير موجود',
        error: 'SECTION_NOT_FOUND'
      });
    }

    // Build filter
    const filter = { section: code.toUpperCase() };
    if (role) filter.role = role;

    // Get users
    const users = await User.find(filter)
      .select('name email role isActive lastLogin createdAt')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: {
        section,
        users,
        count: users.length
      }
    });
  })
);

module.exports = router;
