// Middleware للمصادقة في بيئة التطوير
const devAuth = (req, res, next) => {
  // في بيئة التطوير، نسمح بالوصول بدون مصادقة
  if (process.env.NODE_ENV === 'development') {
    // إنشاء مستخدم وهمي للتطوير
    req.user = {
      id: 'dev-user-1',
      name: 'مدير النظام',
      email: 'admin@ahcp.gov.sa',
      role: 'super_admin',
      section: null
    };
    return next();
  }
  
  // في بيئة الإنتاج، استخدم المصادقة الحقيقية
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
      error: 'MISSING_TOKEN'
    });
  }
  
  const token = authHeader.substring(7);
  
  try {
    // هنا يمكن إضافة التحقق من JWT في المستقبل
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // req.user = decoded;
    
    // للآن، نستخدم مستخدم وهمي
    req.user = {
      id: 'user-1',
      name: 'مستخدم النظام',
      email: 'user@ahcp.gov.sa',
      role: 'super_admin',
      section: null
    };
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token.',
      error: 'INVALID_TOKEN'
    });
  }
};

module.exports = devAuth;
