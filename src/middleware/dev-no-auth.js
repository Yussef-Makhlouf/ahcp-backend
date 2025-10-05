/**
 * Development middleware - تجاوز جميع المصادقة
 */

const devNoAuth = (req, res, next) => {
  // إضافة مستخدم وهمي للتطوير
  req.user = {
    _id: 'dev-user-id',
    id: 'dev-user-id',
    email: 'dev@ahcp.gov.sa',
    role: 'super_admin',
    name: 'Developer User',
    isActive: true
  };
  
  console.log(`🔓 Dev Mode: ${req.method} ${req.path} - No Auth Required`);
  next();
};

const devAuthorize = (...roles) => {
  return (req, res, next) => {
    console.log(`🔓 Dev Mode: Authorization bypassed for roles: ${roles.join(', ')}`);
    next();
  };
};

const devOptionalAuth = (req, res, next) => {
  req.user = {
    _id: 'dev-user-id',
    id: 'dev-user-id',
    email: 'dev@ahcp.gov.sa',
    role: 'super_admin',
    name: 'Developer User',
    isActive: true
  };
  next();
};

const devOwnerOrAdmin = (resourceUserField = 'createdBy') => {
  return (req, res, next) => {
    console.log(`🔓 Dev Mode: Owner/Admin check bypassed for field: ${resourceUserField}`);
    next();
  };
};

const devValidateApiKey = (req, res, next) => {
  console.log('🔓 Dev Mode: API Key validation bypassed');
  next();
};

const devUpdateLastLogin = (req, res, next) => {
  console.log('🔓 Dev Mode: Last login update bypassed');
  next();
};

module.exports = {
  auth: devNoAuth,
  authorize: devAuthorize,
  optionalAuth: devOptionalAuth,
  ownerOrAdmin: devOwnerOrAdmin,
  validateApiKey: devValidateApiKey,
  updateLastLogin: devUpdateLastLogin
};
