// Middleware للمصادقة في بيئة التطوير
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const devAuth = async (req, res, next) => {
  try {
    // التحقق من وجود token في header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please login first.',
        error: 'AUTHENTICATION_REQUIRED'
      });
    }

    const token = authHeader.substring(7); // إزالة "Bearer " من البداية
    
    try {
      // التحقق من صحة token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // البحث عن المستخدم
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found.',
          error: 'USER_NOT_FOUND'
        });
      }
      
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated.',
          error: 'ACCOUNT_DEACTIVATED'
        });
      }
      
      // إضافة المستخدم إلى request
      req.user = user;
      next();
      
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token.',
        error: 'INVALID_TOKEN'
      });
    }
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error.',
      error: 'AUTH_ERROR'
    });
  }
};

module.exports = devAuth;