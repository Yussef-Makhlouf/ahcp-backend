const express = require('express');
const logger = require('../utils/logger');
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
    logger.error('Error fetching villages:', { error: error });
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
    logger.error('Error searching villages:', { error: error });
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
    logger.error('Error fetching sectors:', { error: error });
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
    logger.error('Error fetching village:', { error: error });
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
    logger.error('Error creating village:', { error: error });
    
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
    logger.error('Error updating village:', { error: error });
    
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
    logger.error('Error creating bulk villages:', { error: error });
    res.status(500).json({
      success: false,
      message: 'خطأ في إنشاء القرى',
      error: error.message
    });
  }
});

// @route   DELETE /api/villages/bulk-delete
// @desc    Delete multiple villages
// @access  Private (Admin only)
router.delete('/bulk-delete', auth, async (req, res) => {
  try {
    // Check if user has admin permissions
    if (!['super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بالحذف المتعدد للقرى'
      });
    }

    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يرجى إرسال قائمة صحيحة من معرفات القرى'
      });
    }

    logger.info('Bulk deleting villages:', { data: ids });

    const results = {
      deleted: 0,
      failed: 0,
      errors: []
    };

    // Check for usage in other collections
    const Client = require('../models/Client');
    const HoldingCode = require('../models/HoldingCode');

    for (const id of ids) {
      try {
        // Check if village is used in clients
        const clientCount = await Client.countDocuments({ village: id });
        if (clientCount > 0) {
          results.failed++;
          results.errors.push({
            id,
            error: `القرية مستخدمة في ${clientCount} عميل`
          });
          continue;
        }

        // Check if village is used in holding codes
        const village = await Village.findById(id);
        if (village) {
          const holdingCodeCount = await HoldingCode.countDocuments({ village: village.nameArabic });
          if (holdingCodeCount > 0) {
            results.failed++;
            results.errors.push({
              id,
              error: `القرية مستخدمة في ${holdingCodeCount} رمز حيازة`
            });
            continue;
          }
        }

        // Delete the village
        const deletedVillage = await Village.findByIdAndDelete(id);
        if (deletedVillage) {
          results.deleted++;
        } else {
          results.failed++;
          results.errors.push({
            id,
            error: 'القرية غير موجودة'
          });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          id,
          error: error.message
        });
      }
    }

    const message = `تم حذف ${results.deleted} قرية بنجاح${results.failed > 0 ? `، فشل في حذف ${results.failed} قرية` : ''}`;

    res.json({
      success: results.deleted > 0,
      message,
      results
    });

  } catch (error) {
    logger.error('Error bulk deleting villages:', { error: error });
    res.status(500).json({
      success: false,
      message: 'خطأ في الحذف المتعدد للقرى',
      error: error.message
    });
  }
});

// @route   DELETE /api/villages/delete-all
// @desc    Delete all villages
// @access  Private (Admin only)
router.delete('/delete-all', auth, async (req, res) => {
  try {
    // Check if user has admin permissions
    if (!['super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بحذف جميع القرى'
      });
    }

    logger.info('Deleting all villages');

    // Check for usage in other collections
    const Client = require('../models/Client');
    const HoldingCode = require('../models/HoldingCode');

    const clientCount = await Client.countDocuments({});
    const holdingCodeCount = await HoldingCode.countDocuments({});

    if (clientCount > 0 || holdingCodeCount > 0) {
      const usageDetails = [];
      if (clientCount > 0) usageDetails.push({ model: 'العملاء', count: clientCount });
      if (holdingCodeCount > 0) usageDetails.push({ model: 'رموز الحيازة', count: holdingCodeCount });

      return res.status(400).json({
        success: false,
        message: 'لا يمكن حذف جميع القرى لأنها مستخدمة في جداول أخرى',
        usageDetails
      });
    }

    const result = await Village.deleteMany({});

    res.json({
      success: true,
      message: `تم حذف جميع القرى بنجاح (${result.deletedCount} قرية)`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    logger.error('Error deleting all villages:', { error: error });
    res.status(500).json({
      success: false,
      message: 'خطأ في حذف جميع القرى',
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
    logger.error('Error deleting village:', { error: error });
    res.status(500).json({
      success: false,
      message: 'خطأ في حذف القرية',
      error: error.message
    });
  }
});

module.exports = router;