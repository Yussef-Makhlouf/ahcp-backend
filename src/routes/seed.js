const express = require('express');
const Section = require('../models/Section');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// الأقسام الأساسية
const defaultSections = [
  {
    name: 'قسم الطب البيطري',
    nameEn: 'Veterinary Department',
    code: 'VET',
    description: 'قسم مختص بالطب البيطري والعلاج والتشخيص'
  },
  {
    name: 'قسم المختبرات',
    nameEn: 'Laboratory Department',
    code: 'LAB',
    description: 'قسم التحاليل المخبرية والفحوصات الطبية'
  },
  {
    name: 'قسم مكافحة الطفيليات',
    nameEn: 'Parasite Control Department',
    code: 'PARA',
    description: 'قسم مكافحة الطفيليات والحشرات الضارة'
  },
  {
    name: 'قسم التحصين',
    nameEn: 'Vaccination Department',
    code: 'VACC',
    description: 'قسم التطعيمات واللقاحات البيطرية'
  },
  {
    name: 'قسم العيادات المتنقلة',
    nameEn: 'Mobile Clinics Department',
    code: 'CLINIC',
    description: 'قسم العيادات المتنقلة والخدمات الميدانية'
  },
  {
    name: 'قسم صحة الخيول',
    nameEn: 'Equine Health Department',
    code: 'EQUINE',
    description: 'قسم مختص بصحة وعلاج الخيول'
  }
];

/**
 * @swagger
 * /api/seed/sections:
 *   post:
 *     summary: Create default sections
 *     tags: [Seed]
 *     responses:
 *       200:
 *         description: Sections created successfully
 *       500:
 *         description: Server error
 */
router.post('/sections', asyncHandler(async (req, res) => {
  try {
    // البحث عن مدير عام
    const admin = await User.findOne({ role: 'super_admin' });
    if (!admin) {
      return res.status(400).json({
        success: false,
        message: 'لا يوجد مدير عام في النظام',
        error: 'NO_ADMIN_FOUND'
      });
    }

    // التحقق من وجود أقسام
    const existingSections = await Section.find();
    
    if (existingSections.length > 0) {
      return res.json({
        success: true,
        message: `يوجد ${existingSections.length} قسم بالفعل`,
        data: {
          sections: existingSections,
          created: 0,
          existing: existingSections.length
        }
      });
    }

    // إنشاء الأقسام الجديدة
    const sectionsToCreate = defaultSections.map(section => ({
      ...section,
      createdBy: admin._id,
      isActive: true
    }));

    const createdSections = await Section.insertMany(sectionsToCreate);

    res.json({
      success: true,
      message: `تم إنشاء ${createdSections.length} قسم بنجاح`,
      data: {
        sections: createdSections,
        created: createdSections.length,
        existing: 0
      }
    });

  } catch (error) {
    console.error('Error creating sections:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في إنشاء الأقسام',
      error: error.message
    });
  }
}));

/**
 * @swagger
 * /api/seed/check:
 *   get:
 *     summary: Check database status
 *     tags: [Seed]
 *     responses:
 *       200:
 *         description: Database status
 */
router.get('/check', asyncHandler(async (req, res) => {
  try {
    const [sectionsCount, usersCount, adminsCount] = await Promise.all([
      Section.countDocuments(),
      User.countDocuments(),
      User.countDocuments({ role: 'super_admin' })
    ]);

    res.json({
      success: true,
      data: {
        sections: sectionsCount,
        users: usersCount,
        admins: adminsCount,
        needsSeeding: sectionsCount === 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'خطأ في فحص قاعدة البيانات',
      error: error.message
    });
  }
}));

module.exports = router;
