const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { validate, schemas } = require('../middleware/validation');
const { auth, authorize, optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendPasswordResetEmail } = require('../utils/emailService');

const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
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
 *               role:
 *                 type: string
 *                 enum: [super_admin, section_supervisor, field_worker]
 *               section:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error or user already exists
 */
router.post('/register', 
  validate(schemas.userRegistration),
  asyncHandler(async (req, res) => {
    const { name, email, password, role, section } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
        error: 'USER_EXISTS'
      });
    }

    // Create user
    const user = new User({
      name,
      email,
      password,
      role,
      section
    });

    await user.save();

    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          section: user.section,
          isActive: user.isActive
        },
        token
      }
    });
  })
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login',
  validate(schemas.userLogin),
  asyncHandler(async (req, res) => {
    try {
      const { email, password } = req.body;

      // Check if JWT_SECRET is available
      if (!process.env.JWT_SECRET) {
        console.error('❌ JWT_SECRET not found in environment variables');
        return res.status(500).json({
          success: false,
          message: 'Server configuration error',
          error: 'JWT_SECRET_MISSING'
        });
      }

      // Find user and include password
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
          error: 'INVALID_CREDENTIALS'
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated',
          error: 'ACCOUNT_DEACTIVATED'
        });
      }

      // Check password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
          error: 'INVALID_CREDENTIALS'
        });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate token
      const token = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            roleNameAr: user.roleNameAr,
            section: user.section,
            isActive: user.isActive,
            lastLogin: user.lastLogin
          },
          token
        }
      });
    } catch (error) {
      console.error('❌ Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during login',
        error: error.message
      });
    }
  })
);
 
/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get('/me',
  auth,
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        user: req.user
      }
    });
  })
);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get current user profile (alias for /me)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       401:
 *         description: Authentication required
 */
router.get('/profile',
  auth,
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: req.user
    });
  })
);

/**
 * @swagger
 * /api/auth/update-profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
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
 *               section:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error
 */
router.put('/update-profile',
  auth,
  validate(schemas.userUpdate),
  asyncHandler(async (req, res) => {
    const { name, email, section } = req.body;
    const userId = req.user._id;

    // Check if email is already taken by another user
    if (email) {
      const existingUser = await User.findOne({ 
        email, 
        _id: { $ne: userId } 
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email is already taken by another user',
          error: 'EMAIL_TAKEN'
        });
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, email, section },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: updatedUser
      }
    });
  })
);

/**
 * @swagger
 * /api/auth/profile:
 *   put:
 *     summary: Update user profile (alias for /update-profile)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
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
 *               section:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error
 */
router.put('/profile',
  auth,
  validate(schemas.userUpdate),
  asyncHandler(async (req, res) => {
    const { name, email, section } = req.body;
    const userId = req.user._id;

    // Check if email is already taken by another user
    if (email) {
      const existingUser = await User.findOne({ 
        email, 
        _id: { $ne: userId } 
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email is already taken by another user',
          error: 'EMAIL_TAKEN'
        });
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, email, section },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: updatedUser
      }
    });
  })
);

/**
 * @swagger
 * /api/auth/change-password:
 *   put:
 *     summary: Change user password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid current password
 */
router.put('/change-password',
  auth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
        error: 'MISSING_PASSWORDS'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
        error: 'PASSWORD_TOO_SHORT'
      });
    }

    // Get user with password
    const user = await User.findById(userId).select('+password');
    
    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
        error: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  })
);

/**
 * @swagger
 * /api/auth/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Authentication]
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
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       403:
 *         description: Access denied
 */
router.get('/users',
  auth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 30, role, search } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { section: { $regex: search, $options: 'i' } }
      ];
    }

    // Get users
    const users = await User.find(filter)
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
 * /api/auth/supervisors:
 *   get:
 *     summary: Get all supervisors for dropdown
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Supervisors retrieved successfully
 *       401:
 *         description: Authentication required
 */
// Cache for supervisors (5 minutes)
let supervisorsCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

router.get('/supervisors',
  auth, // استخدام auth الإجباري للمصادقة الطبيعية
  asyncHandler(async (req, res) => {
    try {
      // Set CORS headers explicitly
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      // Set headers to prevent caching and ensure 200 OK responses
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      // Check cache first for performance
      const now = Date.now();
      if (supervisorsCache && (now - cacheTimestamp) < CACHE_DURATION) {
        console.log('📋 Returning cached supervisors');
        return res.json({
          success: true,
          data: supervisorsCache,
          cached: true,
          timestamp: new Date().toISOString()
        });
      }

      console.log('🔍 Fetching supervisors from database...');
      
      // Get all active users with supervisor roles - optimized query
      const supervisors = await User.find(
        {
          role: { $in: ['super_admin', 'section_supervisor'] },
          isActive: true
        },
        'name email role section', // projection for better performance
        {
          sort: { name: 1 },
          lean: true // faster query
        }
      );

      // Update cache
      supervisorsCache = supervisors;
      cacheTimestamp = now;

      console.log(`✅ Found ${supervisors.length} supervisors`);
      
      res.json({
        success: true,
        data: supervisors,
        cached: false,
        timestamp: new Date().toISOString(),
        count: supervisors.length
      });
    } catch (error) {
      console.error('❌ Error fetching supervisors:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في جلب بيانات المشرفين',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  })
);

// Clear cache endpoint for development
router.post('/supervisors/clear-cache',
  asyncHandler(async (req, res) => {
    supervisorsCache = null;
    cacheTimestamp = 0;
    console.log('🗑️ Supervisors cache cleared');
    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  })
);

/**
 * @swagger
 * /api/auth/supervisors/by-section/{section}:
 *   get:
 *     summary: Get supervisors by section
 *     tags: [Authentication]
 *     parameters:
 *       - in: path
 *         name: section
 *         required: true
 *         schema:
 *           type: string
 *         description: Section name to filter supervisors
 *     responses:
 *       200:
 *         description: Supervisors retrieved successfully
 *       404:
 *         description: No supervisors found for this section
 */
router.get('/supervisors/by-section/:section',
  auth, // استخدام auth الإجباري للمصادقة الطبيعية
  asyncHandler(async (req, res) => {
    try {
      const { section } = req.params;
      
      console.log(`🔍 Fetching supervisors for section: ${section}`);
      
      // Get supervisors for specific section with flexible matching
      const query = {
        role: 'section_supervisor', // Only section supervisors, no super_admin
        isActive: true
      };

      // Add section filter - support both exact match and contains
      if (section && section !== 'all') {
        query.$or = [
          { section: section }, // Exact match
          { section: { $regex: section, $options: 'i' } } // Case insensitive contains
        ];
      }

      let supervisors = await User.find(
        query,
        'name email role section',
        {
          sort: { name: 1 },
          lean: true
        }
      );
      
      // إذا لم نجد مشرفين للقسم المحدد، نجلب المشرفين العامين كـ fallback
      if (supervisors.length === 0 && section && section !== 'all') {
        console.log(`⚠️ No supervisors found for section: ${section}, falling back to super_admin`);
        supervisors = await User.find(
          {
            role: 'super_admin',
            isActive: true
          },
          'name email role section',
          {
            sort: { name: 1 },
            lean: true
          }
        );
      }
      
      console.log(`✅ Found ${supervisors.length} supervisors for section: ${section}`);
      
      res.json({
        success: true,
        data: supervisors,
        section: section,
        count: supervisors.length,
        timestamp: new Date().toISOString(),
        fallback: supervisors.length > 0 && supervisors[0]?.role === 'super_admin'
      });
    } catch (error) {
      console.error('❌ Error fetching supervisors by section:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في جلب بيانات المشرفين',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  })
);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Authentication required
 */
router.post('/logout',
  auth,
  asyncHandler(async (req, res) => {
    // في نظام JWT، لا نحتاج لتنفيذ خاص على الخادم للـ logout
    // يمكن إضافة token إلى blacklist إذا أردنا ذلك
    
    res.json({
      success: true,
      message: 'تم تسجيل الخروج بنجاح'
    });
  })
);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       404:
 *         description: User not found
 */
router.post('/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مطلوب',
        error: 'EMAIL_REQUIRED'
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'لا يوجد مستخدم بهذا البريد الإلكتروني',
        error: 'USER_NOT_FOUND'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(400).json({
        success: false,
        message: 'الحساب غير مفعل',
        error: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token and expiration (15 minutes)
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 minutes

    await user.save();

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

    // Send email
    try {
      const emailResult = await sendPasswordResetEmail(user.email, resetUrl, user.name);
      
      if (emailResult.success) {
        console.log('📧 Password reset email sent successfully to:', user.email);
        res.json({
          success: true,
          message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني',
          data: {
            resetUrl: process.env.NODE_ENV === 'development' ? resetUrl : undefined
          }
        });
      } else {
        console.error('❌ Failed to send email:', emailResult.error);
        // Still return success but log the error
        res.json({
          success: true,
          message: 'تم إنشاء رابط إعادة التعيين، ولكن فشل في إرسال البريد الإلكتروني',
          data: {
            resetUrl: resetUrl // Always return URL in case email fails
          }
        });
      }
    } catch (emailError) {
      console.error('❌ Email service error:', emailError);
      // Fallback: return the reset URL even if email fails
      res.json({
        success: true,
        message: 'تم إنشاء رابط إعادة التعيين، ولكن فشل في إرسال البريد الإلكتروني',
        data: {
          resetUrl: resetUrl
        }
      });
    }
  })
);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired token
 */
router.post('/reset-password',
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'الرمز وكلمة المرور مطلوبان',
        error: 'MISSING_FIELDS'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
        error: 'PASSWORD_TOO_SHORT'
      });
    }

    // Hash the token to compare with stored token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'الرمز غير صحيح أو منتهي الصلاحية',
        error: 'INVALID_TOKEN'
      });
    }

    // Update password and clear reset token
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    res.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح'
    });
  })
);

/**
 * @swagger
 * /api/auth/verify-reset-token:
 *   post:
 *     summary: Verify password reset token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token is valid
 *       400:
 *         description: Invalid or expired token
 */
router.post('/verify-reset-token',
  asyncHandler(async (req, res) => {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'الرمز مطلوب',
        error: 'TOKEN_REQUIRED'
      });
    }

    // Hash the token to compare with stored token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'الرمز غير صحيح أو منتهي الصلاحية',
        error: 'INVALID_TOKEN'
      });
    }

    res.json({
      success: true,
      message: 'الرمز صحيح',
      data: {
        email: user.email,
        name: user.name
      }
    });
  })
);

module.exports = router;
