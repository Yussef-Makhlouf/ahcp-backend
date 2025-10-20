const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Section = require('../models/Section');
const { validate, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users with advanced filtering
 *     tags: [Users]
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
 *         description: Number of users per page
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [super_admin, section_supervisor, field_worker]
 *         description: Filter by role
 *       - in: query
 *         name: section
 *         schema:
 *           type: string
 *         description: Filter by section code
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in name, email, or section
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: hasVehicleNo
 *         schema:
 *           type: boolean
 *         description: Filter users who have vehicle numbers (supervisors only)
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       403:
 *         description: Access denied
 */
router.get('/',
  auth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 30, role, section, search, active, hasVehicleNo } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (role) filter.role = role;
    if (section) filter.section = section.toUpperCase();
    if (active !== undefined) filter.isActive = active === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { section: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter users with vehicle numbers (supervisors only)
    if (hasVehicleNo === 'true') {
      filter.vehicleNo = { $exists: true, $ne: null, $ne: '' };
      filter.role = { $in: ['super_admin', 'section_supervisor'] };
    }

    // If user is section_supervisor, only show users from their section
    if (req.user.role === 'section_supervisor') {
      filter.section = req.user.section;
    }

    // Get users
    const users = await User.find(filter)
      .select('-password -refreshTokens -passwordResetToken -passwordResetExpires')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: {
        users,
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
 * /api/users/stats:
 *   get:
 *     summary: Get user statistics
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/stats',
  auth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const filter = {};
    
    // If user is section_supervisor, only show stats for their section
    if (req.user.role === 'section_supervisor') {
      filter.section = req.user.section;
    }

    const [
      totalUsers,
      activeUsers,
      admins,
      supervisors,
      workers,
      inactiveUsers
    ] = await Promise.all([
      User.countDocuments(filter),
      User.countDocuments({ ...filter, isActive: true }),
      User.countDocuments({ ...filter, role: 'super_admin', isActive: true }),
      User.countDocuments({ ...filter, role: 'section_supervisor', isActive: true }),
      User.countDocuments({ ...filter, role: 'field_worker', isActive: true }),
      User.countDocuments({ ...filter, isActive: false })
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        admins,
        supervisors,
        workers,
        section: req.user.role === 'section_supervisor' ? req.user.section : 'all'
      }
    });
  })
);

/**
 * @swagger
 * /api/users/supervisors-only:
 *   get:
 *     summary: Get supervisors filtered by section for dropdown selection
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: section
 *         schema:
 *           type: string
 *         description: Filter by section name (Arabic or English)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of supervisors to return
 *     responses:
 *       200:
 *         description: Supervisors retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get('/supervisors-only',
  auth,
  asyncHandler(async (req, res) => {
    try {
      const { section, limit = 100 } = req.query;
      
      console.log(`🔍 Fetching supervisors-only for section: "${section}"`);
      
      // Build filter for supervisors and admins only
      const filter = {
        role: { $in: ['super_admin', 'section_supervisor'] },
        isActive: true,
        // Only include users with vehicle numbers (supervisors who can do field work)
        vehicleNo: { $exists: true, $ne: null, $ne: '' }
      };

      // If section is specified, filter by section with flexible matching
      if (section && section !== 'all') {
        const sectionStr = String(section);
        filter.$or = [
          { section: { $regex: sectionStr, $options: 'i' } },
          { section: { $regex: sectionStr.replace(/[-_\s]/g, ''), $options: 'i' } },
          // Handle Arabic section names
          { section: { $regex: sectionStr.replace(/ة/g, 'ه'), $options: 'i' } },
          { section: { $regex: sectionStr.replace(/ه/g, 'ة'), $options: 'i' } }
        ];
      }

      console.log(`📋 Filter applied:`, JSON.stringify(filter, null, 2));

      // Get supervisors with all necessary fields
      const supervisors = await User.find(filter)
        .select('name email role section supervisorCode vehicleNo isActive')
        .sort({ supervisorCode: 1, name: 1 })
        .limit(parseInt(limit))
        .lean();

      console.log(`✅ Found ${supervisors.length} supervisors for section "${section}"`);

      res.json({
        success: true,
        data: supervisors,
        count: supervisors.length,
        section: section || 'all',
        search: "",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error fetching supervisors-only:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في جلب بيانات المشرفين',
        error: error.message,
        data: [],
        count: 0
      });
    }
  })
);

/**
 * @swagger
 * /api/users/supervisors/list:
 *   get:
 *     summary: Get all supervisors with their codes and vehicle numbers
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: section
 *         schema:
 *           type: string
 *         description: Filter by section name
 *     responses:
 *       200:
 *         description: Supervisors retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get('/supervisors/list',
  auth,
  asyncHandler(async (req, res) => {
    try {
      const { section } = req.query;
      
      // Build filter for supervisors
      const filter = {
        role: { $in: ['super_admin', 'section_supervisor'] },
        isActive: true
      };

      // If section is specified, filter by section
      if (section && section !== 'all') {
        // Flexible section matching
        filter.$or = [
          { section: { $regex: section, $options: 'i' } },
          { section: { $regex: section.replace(/[-_]/g, ''), $options: 'i' } }
        ];
      }

      console.log(`🔍 Fetching supervisors with filter:`, filter);

      // Get supervisors with all necessary fields
      const supervisors = await User.find(filter)
        .select('name email role section supervisorCode vehicleNo isActive')
        .sort({ supervisorCode: 1, name: 1 })
        .lean();

      console.log(`✅ Found ${supervisors.length} supervisors`);

      res.json({
        success: true,
        data: supervisors,
        count: supervisors.length,
        section: section || 'all',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Error fetching supervisors:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في جلب بيانات المشرفين',
        error: error.message
      });
    }
  })
);

/**
 * @swagger
 * /api/users/supervisors/update-codes:
 *   post:
 *     summary: Update existing supervisors with codes and vehicle numbers
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Supervisors updated successfully
 *       401:
 *         description: Authentication required
 */
router.post('/supervisors/update-codes',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    try {
      console.log('🔄 Starting to update existing supervisors...');

      // Get all section supervisors
      const supervisors = await User.find({
        role: 'section_supervisor',
        isActive: true
      });

      console.log(`📋 Found ${supervisors.length} supervisors to check`);

      const updates = [];

      for (const supervisor of supervisors) {
        let needsUpdate = false;
        const updateData = {};

        // Generate supervisor code if missing
        if (!supervisor.supervisorCode) {
          const supervisorCode = await User.generateSupervisorCode(supervisor.section);
          updateData.supervisorCode = supervisorCode;
          needsUpdate = true;
        }

        // Generate vehicle number if missing
        if (!supervisor.vehicleNo) {
          const firstName = supervisor.name.split(' ')[0];
          const code = updateData.supervisorCode || supervisor.supervisorCode;
          updateData.vehicleNo = `${firstName}-${code}`;
          needsUpdate = true;
        }

        // Update if needed
        if (needsUpdate) {
          await User.findByIdAndUpdate(supervisor._id, updateData);
          updates.push({
            name: supervisor.name,
            section: supervisor.section,
            supervisorCode: updateData.supervisorCode || supervisor.supervisorCode,
            vehicleNo: updateData.vehicleNo || supervisor.vehicleNo
          });
          console.log(`✅ Updated supervisor: ${supervisor.name}`);
        }
      }

      console.log(`🎉 Updated ${updates.length} supervisors`);

      res.json({
        success: true,
        message: `تم تحديث ${updates.length} مشرف بنجاح`,
        data: {
          updatedCount: updates.length,
          totalSupervisors: supervisors.length,
          updates
        }
      });
    } catch (error) {
      console.error('❌ Error updating supervisors:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في تحديث المشرفين',
        error: error.message
      });
    }
  })
);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User retrieved successfully
 *       404:
 *         description: User not found
 */
router.get('/:id',
  auth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
      .select('-password -refreshTokens -passwordResetToken -passwordResetExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود',
        error: 'USER_NOT_FOUND'
      });
    }

    // If user is section_supervisor, only allow viewing users from their section
    if (req.user.role === 'section_supervisor' && user.section !== req.user.section) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بعرض هذا المستخدم',
        error: 'ACCESS_DENIED'
      });
    }

    res.json({
      success: true,
      data: user
    });
  })
);

/**
 * @swagger
 * /api/users/supervisors:
 *   post:
 *     summary: Create new supervisor
 *     tags: [Users]
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
 *               - email
 *               - password
 *               - section
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               section:
 *                 type: string
 *               avatar:
 *                 type: string
 *     responses:
 *       201:
 *         description: Supervisor created successfully
 *       400:
 *         description: Validation error or user already exists
 */
router.post('/supervisors',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const { name, email, password, section, vehicleNo, avatar } = req.body;

    // Validation
    if (!name || !email || !password || !section) {
      return res.status(400).json({
        success: false,
        message: 'جميع الحقول مطلوبة (الاسم، البريد الإلكتروني، كلمة المرور، القسم)',
        error: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'مستخدم بنفس البريد الإلكتروني موجود بالفعل',
        error: 'USER_EXISTS'
      });
    }

    // Verify section exists
    const sectionExists = await Section.findByCode(section);
    if (!sectionExists) {
      return res.status(400).json({
        success: false,
        message: 'القسم المحدد غير موجود',
        error: 'SECTION_NOT_FOUND'
      });
    }

    // Generate supervisor code
    const supervisorCode = await User.generateSupervisorCode(section);

    // Create supervisor
    const supervisor = new User({
      name,
      email,
      password,
      role: 'section_supervisor',
      section: section.toUpperCase(),
      supervisorCode,
      vehicleNo, // Add vehicleNo if provided
      avatar
    });

    await supervisor.save();

    res.status(201).json({
      success: true,
      message: `تم إنشاء المشرف بنجاح برمز ${supervisorCode}`,
      data: {
        id: supervisor._id,
        name: supervisor.name,
        email: supervisor.email,
        role: supervisor.role,
        roleNameAr: supervisor.roleNameAr,
        section: supervisor.section,
        supervisorCode: supervisor.supervisorCode,
        vehicleNo: supervisor.vehicleNo,
        isActive: supervisor.isActive
      }
    });
  })
);

/**
 * @swagger
 * /api/users/admins:
 *   post:
 *     summary: Create new admin
 *     tags: [Users]
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
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               section:
 *                 type: string
 *               avatar:
 *                 type: string
 *     responses:
 *       201:
 *         description: Admin created successfully
 *       400:
 *         description: Validation error or user already exists
 */
router.post('/admins',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const { name, email, password, section, avatar } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'الاسم والبريد الإلكتروني وكلمة المرور مطلوبة',
        error: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'مستخدم بنفس البريد الإلكتروني موجود بالفعل',
        error: 'USER_EXISTS'
      });
    }

    // If section is provided, verify it exists
    if (section) {
      const sectionExists = await Section.findByCode(section);
      if (!sectionExists) {
        return res.status(400).json({
          success: false,
          message: 'القسم المحدد غير موجود',
          error: 'SECTION_NOT_FOUND'
        });
      }
    }

    // Create admin
    const admin = new User({
      name,
      email,
      password,
      role: 'super_admin',
      section: section?.toUpperCase(),
      avatar
    });

    await admin.save();

    res.status(201).json({
      success: true,
      message: 'تم إنشاء المدير بنجاح',
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        roleNameAr: admin.roleNameAr,
        section: admin.section,
        isActive: admin.isActive
      }
    });
  })
);

/**
 * @swagger
 * /api/users/workers:
 *   post:
 *     summary: Create new worker
 *     tags: [Users]
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
 *               - email
 *               - password
 *               - section
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               section:
 *                 type: string
 *               avatar:
 *                 type: string
 *     responses:
 *       201:
 *         description: Worker created successfully
 *       400:
 *         description: Validation error or user already exists
 */
router.post('/workers',
  auth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const { name, email, password, section, avatar } = req.body;

    // Validation
    if (!name || !email || !password || !section) {
      return res.status(400).json({
        success: false,
        message: 'جميع الحقول مطلوبة (الاسم، البريد الإلكتروني، كلمة المرور، القسم)',
        error: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'مستخدم بنفس البريد الإلكتروني موجود بالفعل',
        error: 'USER_EXISTS'
      });
    }

    // Verify section exists
    const sectionExists = await Section.findByCode(section);
    if (!sectionExists) {
      return res.status(400).json({
        success: false,
        message: 'القسم المحدد غير موجود',
        error: 'SECTION_NOT_FOUND'
      });
    }

    // If user is section_supervisor, only allow creating workers in their section
    if (req.user.role === 'section_supervisor' && section.toUpperCase() !== req.user.section) {
      return res.status(403).json({
        success: false,
        message: 'يمكنك فقط إنشاء عمال في قسمك',
        error: 'ACCESS_DENIED'
      });
    }

    // Create worker
    const worker = new User({
      name,
      email,
      password,
      role: 'field_worker',
      section: section.toUpperCase(),
      avatar
    });

    await worker.save();

    res.status(201).json({
      success: true,
      message: 'تم إنشاء العامل بنجاح',
      data: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        role: worker.role,
        roleNameAr: worker.roleNameAr,
        section: worker.section,
        isActive: worker.isActive
      }
    });
  })
);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [super_admin, section_supervisor, field_worker]
 *               section:
 *                 type: string
 *               avatar:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 */
router.put('/:id',
  auth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const { name, email, role, section, avatar, isActive } = req.body;
    const userId = req.params.id;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود',
        error: 'USER_NOT_FOUND'
      });
    }

    // If user is section_supervisor, only allow updating users from their section
    if (req.user.role === 'section_supervisor' && user.section !== req.user.section) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بتعديل هذا المستخدم',
        error: 'ACCESS_DENIED'
      });
    }

    // Section supervisors cannot change roles or assign users to other sections
    if (req.user.role === 'section_supervisor') {
      if (role && role !== user.role) {
        return res.status(403).json({
          success: false,
          message: 'غير مصرح لك بتغيير أدوار المستخدمين',
          error: 'ACCESS_DENIED'
        });
      }
      if (section && section.toUpperCase() !== req.user.section) {
        return res.status(403).json({
          success: false,
          message: 'غير مصرح لك بنقل المستخدمين إلى أقسام أخرى',
          error: 'ACCESS_DENIED'
        });
      }
    }

    // Check if email is already taken by another user
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ 
        email, 
        _id: { $ne: userId } 
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'البريد الإلكتروني مستخدم من قبل مستخدم آخر',
          error: 'EMAIL_TAKEN'
        });
      }
    }

    // If section is being changed, verify it exists
    if (section && section.toUpperCase() !== user.section) {
      const sectionExists = await Section.findByCode(section);
      if (!sectionExists) {
        return res.status(400).json({
          success: false,
          message: 'القسم المحدد غير موجود',
          error: 'SECTION_NOT_FOUND'
        });
      }
    }

    // Update user
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role && req.user.role === 'super_admin') updateData.role = role;
    if (section) updateData.section = section.toUpperCase();
    if (avatar !== undefined) updateData.avatar = avatar;
    if (isActive !== undefined && req.user.role === 'super_admin') updateData.isActive = isActive;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -refreshTokens -passwordResetToken -passwordResetExpires');

    res.json({
      success: true,
      message: 'تم تحديث المستخدم بنجاح',
      data: updatedUser
    });
  })
);

/**
 * @swagger
 * /api/users/{id}/change-password:
 *   put:
 *     summary: Change user password (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       404:
 *         description: User not found
 */
router.put('/:id/change-password',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const { newPassword } = req.body;
    const userId = req.params.id;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور الجديدة يجب أن تكون على الأقل 6 أحرف',
        error: 'PASSWORD_TOO_SHORT'
      });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود',
        error: 'USER_NOT_FOUND'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح'
    });
  })
);


/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 */
router.delete('/:id',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'المستخدم غير موجود',
        error: 'USER_NOT_FOUND'
      });
    }

    // Prevent deleting the last super admin
    if (user.role === 'super_admin') {
      const adminCount = await User.countDocuments({ 
        role: 'super_admin', 
        isActive: true,
        _id: { $ne: req.params.id }
      });
      
      if (adminCount === 0) {
        return res.status(400).json({
          success: false,
          message: 'لا يمكن حذف آخر مدير في النظام',
          error: 'CANNOT_DELETE_LAST_ADMIN'
        });
      }
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'تم حذف المستخدم بنجاح'
    });
  })
);


module.exports = router;
