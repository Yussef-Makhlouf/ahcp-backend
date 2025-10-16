const express = require('express');
const router = express.Router();
const Village = require('../models/Village');
const { auth } = require('../middleware/auth');
const { validateVillage } = require('../middleware/validation');

// @route   GET /api/villages
// @desc    Get all villages with pagination and search
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const region = req.query.region || '';
    // Build query
    let query = {};
    
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { nameArabic: searchRegex },
        { nameEnglish: searchRegex },
        { sector: searchRegex },
        { serialNumber: searchRegex }
      ];
    }
    
    if (region) {
      query.sector = region;
    }

    // Execute query with pagination
    const villages = await Village.find(query)
      .sort({ nameArabic: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    const total = await Village.countDocuments(query);

    res.json({
      success: true,
      data: villages,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total: total
      }
    });
  } catch (error) {
    console.error('Error fetching villages:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في جلب القرى',
      error: error.message
    });
  }
});

// @route   GET /api/villages/search
// @desc    Search villages by name or region
// @access  Private
router.get('/search', auth, async (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = parseInt(req.query.limit) || 20;

    if (!query || query.length < 2) {
      // إذا كان البحث فارغاً أو أقل من حرفين، أعد جميع القرى
      const villages = await Village.find({})
        .sort({ nameArabic: 1 })
        .limit(limit)
        .populate('createdBy', 'name email');
      
      return res.json({
        success: true,
        data: villages
      });
    }

    const villages = await Village.searchVillages(query).limit(limit);

    res.json({
      success: true,
      data: villages
    });
  } catch (error) {
    console.error('Error searching villages:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في البحث عن القرى',
      error: error.message
    });
  }
});

// @route   GET /api/villages/sectors
// @desc    Get all sectors
// @access  Private
router.get('/sectors', auth, async (req, res) => {
  try {
    const sectors = await Village.distinct('sector');
    
    res.json({
      success: true,
      data: sectors.sort()
    });
  } catch (error) {
    console.error('Error fetching sectors:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في جلب القطاعات',
      error: error.message
    });
  }
});

// @route   GET /api/villages/:id
// @desc    Get village by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const village = await Village.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!village) {
      return res.status(404).json({
        success: false,
        message: 'القرية غير موجودة'
      });
    }

    res.json({
      success: true,
      data: village
    });
  } catch (error) {
    console.error('Error fetching village:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في جلب القرية',
      error: error.message
    });
  }
});

// @route   POST /api/villages
// @desc    Create new village
// @access  Private (Admin and Supervisors only)
router.post('/', auth, validateVillage, async (req, res) => {
  try {
    // Check if user has admin or supervisor permissions
    if (!['super_admin', 'section_supervisor'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بإنشاء قرى جديدة'
      });
    }

    const villageData = {
      ...req.body,
      createdBy: req.user.id
    };

    const village = new Village(villageData);
    await village.save();

    await village.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      data: village,
      message: 'تم إنشاء القرية بنجاح'
    });
  } catch (error) {
    console.error('Error creating village:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'القرية موجودة بالفعل'
      });
    }

    res.status(500).json({
      success: false,
      message: 'خطأ في إنشاء القرية',
      error: error.message
    });
  }
});

// @route   PUT /api/villages/:id
// @desc    Update village
// @access  Private (Admin and Supervisors only)
router.put('/:id', auth, validateVillage, async (req, res) => {
  try {
    // Check if user has admin or supervisor permissions
    if (!['super_admin', 'section_supervisor'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بتعديل القرى'
      });
    }

    const villageData = {
      ...req.body,
      updatedBy: req.user.id
    };

    const village = await Village.findByIdAndUpdate(
      req.params.id,
      villageData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email')
     .populate('updatedBy', 'name email');

    if (!village) {
      return res.status(404).json({
        success: false,
        message: 'القرية غير موجودة'
      });
    }

    res.json({
      success: true,
      data: village,
      message: 'تم تحديث القرية بنجاح'
    });
  } catch (error) {
    console.error('Error updating village:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'القرية موجودة بالفعل'
      });
    }

    res.status(500).json({
      success: false,
      message: 'خطأ في تحديث القرية',
      error: error.message
    });
  }
});

// @route   DELETE /api/villages/:id
// @desc    Delete village (soft delete)
// @access  Private (Admin and Supervisors only)
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check if user has admin or supervisor permissions
    if (!['super_admin', 'section_supervisor'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بحذف القرى'
      });
    }

    const village = await Village.findByIdAndDelete(req.params.id);

    if (!village) {
      return res.status(404).json({
        success: false,
        message: 'القرية غير موجودة'
      });
    }

    res.json({
      success: true,
      message: 'تم حذف القرية بنجاح'
    });
  } catch (error) {
    console.error('Error deleting village:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في حذف القرية',
      error: error.message
    });
  }
});

// @route   POST /api/villages/bulk
// @desc    Create multiple villages
// @access  Private (Admin and Supervisors only)
router.post('/bulk', auth, async (req, res) => {
  try {
    // Check if user has admin or supervisor permissions
    if (!['super_admin', 'section_supervisor'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بإنشاء قرى متعددة'
      });
    }

    const villages = req.body.villages;
    
    if (!Array.isArray(villages) || villages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يرجى إرسال قائمة صحيحة من القرى'
      });
    }

    const villagesWithCreator = villages.map(village => ({
      ...village,
      createdBy: req.user.id
    }));

    const createdVillages = await Village.insertMany(villagesWithCreator);

    res.status(201).json({
      success: true,
      data: createdVillages,
      message: `تم إنشاء ${createdVillages.length} قرية بنجاح`
    });
  } catch (error) {
    console.error('Error creating bulk villages:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في إنشاء القرى',
      error: error.message
    });
  }
});

module.exports = router;