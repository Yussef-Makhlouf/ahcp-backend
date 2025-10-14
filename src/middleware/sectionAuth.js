const { getSupervisorModule } = require('./auth');

/**
 * Middleware للتحقق من صلاحيات القسم
 * يمنع المشرفين من الوصول لأقسام غير مخصصة لهم
 */
const checkSectionAccess = (req, res, next) => {
  if (req.user.role === 'section_supervisor') {
    const userModule = getSupervisorModule(req.user.section);
    const requestedModule = req.baseUrl.split('/').pop();
    
    // تحويل أسماء الوحدات إلى أسماء القسم
    const moduleToSectionMap = {
      'parasite-control': 'مكافحة الطفيليات',
      'vaccination': 'التطعيمات', 
      'mobile-clinics': 'العيادات المتنقلة',
      'laboratories': 'المختبرات',
      'equine-health': 'صحة الخيول'
    };
    
    const requestedSection = moduleToSectionMap[requestedModule];
    
    if (userModule !== requestedModule && userModule !== 'all' && req.user.section !== requestedSection) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions for this section.',
        error: 'INSUFFICIENT_SECTION_PERMISSIONS',
        userSection: req.user.section,
        requestedSection: requestedSection
      });
    }
  }
  next();
};

/**
 * Middleware للتحقق من صلاحيات القسم مع رسالة خطأ مخصصة
 */
const checkSectionAccessWithMessage = (sectionName) => {
  return (req, res, next) => {
    if (req.user && req.user.role === 'section_supervisor') {
      const userModule = getSupervisorModule(req.user.section);
      
      // تحويل اسم القسم إلى اسم الوحدة
      const sectionToModuleMap = {
        'مكافحة الطفيليات': 'parasite-control',
        'التطعيم': 'vaccination',
        'التطعيمات': 'vaccination',
        'العيادات المتنقلة': 'mobile-clinics',
        'المختبرات': 'laboratories',
        'صحة الخيول': 'equine-health'
      };
      
      const requestedModule = sectionToModuleMap[sectionName];
      
      if (userModule !== requestedModule && userModule !== 'all') {
        return res.status(403).json({
          success: false,
          message: `ليس لديك صلاحية للوصول إلى قسم ${sectionName}`,
          error: 'INSUFFICIENT_SECTION_PERMISSIONS',
          userSection: req.user.section,
          requestedSection: sectionName
        });
      }
    }
    next();
  };
};

module.exports = {
  checkSectionAccess,
  checkSectionAccessWithMessage
};
