const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Authentication middleware to verify JWT tokens
 */
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        error: 'MISSING_TOKEN'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.',
        error: 'USER_NOT_FOUND'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.',
        error: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Add user to request object
    req.user = user;
    
    // Set current user for model middleware
    User.currentUser = user._id;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
        error: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired.',
        error: 'TOKEN_EXPIRED'
      });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication.',
      error: 'SERVER_ERROR'
    });
  }
};

/**
 * Role-based authorization middleware
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        error: 'AUTH_REQUIRED'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.',
        error: 'INSUFFICIENT_PERMISSIONS',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }

    next();
  };
};

/**
 * Optional authentication middleware
 * Adds user to request if token is provided and valid, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
        User.currentUser = user._id;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

/**
 * Middleware to check if user owns the resource or has admin privileges
 */
const ownerOrAdmin = (resourceUserField = 'createdBy') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        error: 'AUTH_REQUIRED'
      });
    }

    // Super admin can access everything
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Check if user owns the resource (will be validated in route handler)
    req.ownershipCheck = {
      field: resourceUserField,
      userId: req.user._id
    };

    next();
  };
};

/**
 * Middleware to validate API key for external integrations
 */
const validateApiKey = (req, res, next) => {
  const apiKey = req.header('X-API-Key');
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'API key required.',
      error: 'API_KEY_REQUIRED'
    });
  }

  // In production, validate against database
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
  
  if (!validApiKeys.includes(apiKey)) {
    return res.status(401).json({
      success: false,
      message: 'Invalid API key.',
      error: 'INVALID_API_KEY'
    });
  }

  next();
};

/**
 * Middleware to refresh user's last login time
 */
const updateLastLogin = async (req, res, next) => {
  if (req.user) {
    try {
      await User.findByIdAndUpdate(req.user._id, {
        lastLogin: new Date()
      });
    } catch (error) {
      console.error('Error updating last login:', error);
      // Don't fail the request if this fails
    }
  }
  next();
};

/**
 * Section-based authorization middleware
 * Allows access only to users whose section matches the required section OR super_admin
 * @param {string} sectionName - The section name to authorize
 */
const authorizeSection = (sectionName) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        error: 'AUTH_REQUIRED'
      });
    }
    // Super admin can access all sections
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Check if user's section matches the required section
    if (req.user.section !== sectionName) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This endpoint is only accessible to ${sectionName} section or super admin.`,
        error: 'SECTION_ACCESS_DENIED',
        requiredSection: sectionName,
        userSection: req.user.section,
        userRole: req.user.role
      });
    }

    next();
  };
};

/**
 * Combined role and section authorization middleware
 * Allows access based on both role and section requirements
 * @param {Array<string>} allowedRoles - Array of allowed roles
 * @param {string} requiredSection - Required section (optional, null means any section)
 */
const authorizeRoleAndSection = (allowedRoles, requiredSection = null) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        error: 'AUTH_REQUIRED'
      });
    }

    // Check role
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.',
        error: 'INSUFFICIENT_PERMISSIONS',
        requiredRoles: allowedRoles,
        userRole: req.user.role
      });
    }

    // Super admin bypasses section check
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Check section if required
    if (requiredSection && req.user.section !== requiredSection) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This endpoint requires ${requiredSection} section access.`,
        error: 'SECTION_ACCESS_DENIED',
        requiredSection: requiredSection,
        userSection: req.user.section
      });
    }

    next();
  };
};

module.exports = {
  auth,
  authorize,
  authorizeSection,
  authorizeRoleAndSection,
  optionalAuth,
  ownerOrAdmin,
  validateApiKey,
  updateLastLogin
};
