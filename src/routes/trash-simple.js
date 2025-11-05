/**
 * Simple Trash Routes - Safe version without complex plugins
 * Handles soft-deleted records management
 */

const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const logger = require('../utils/logger');

// Import models
const Laboratory = require('../models/Laboratory');
const Vaccination = require('../models/Vaccination');
const ParasiteControl = require('../models/ParasiteControl');
const MobileClinic = require('../models/MobileClinic');
const EquineHealth = require('../models/EquineHealth');
const Client = require('../models/Client');

// Model mapping
const MODELS = {
  laboratory: { model: Laboratory, name: 'المختبرات' },
  vaccination: { model: Vaccination, name: 'التطعيمات' },
  parasite_control: { model: ParasiteControl, name: 'مكافحة الطفيليات' },
  mobile_clinic: { model: MobileClinic, name: 'العيادات المتنقلة' },
  equine_health: { model: EquineHealth, name: 'صحة الخيول' },
  client: { model: Client, name: 'المربين' }
};

/**
 * GET /api/trash/stats
 * Get trash statistics
 */
router.get('/stats',
  auth,
  authorize('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const stats = {};
    let totalCount = 0;

    // Get count for each model type
    for (const [key, modelInfo] of Object.entries(MODELS)) {
      try {
        const count = await modelInfo.model.countDocuments({ isDeleted: true });
        stats[key] = {
          name: modelInfo.name,
          count
        };
        totalCount += count;
      } catch (error) {
        logger.error(`Error counting deleted ${key}:`, error);
        stats[key] = { name: modelInfo.name, count: 0 };
      }
    }

    res.json({
      success: true,
      stats,
      totalCount
    });
  })
);

/**
 * GET /api/trash
 * Get all deleted records
 */
router.get('/',
  auth,
  authorize('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { type, page = 1, limit = 50 } = req.query;
    const results = [];
    let totalCount = 0;

    // If specific type requested
    if (type && MODELS[type]) {
      const modelInfo = MODELS[type];
      try {
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const records = await modelInfo.model
          .find({ isDeleted: true })
          .populate('deletedBy', 'name email')
          .populate('createdBy', 'name email')
          .populate('client', 'name nationalId phone')
          .sort('-deletedAt')
          .skip(skip)
          .limit(parseInt(limit))
          .lean();

        const count = await modelInfo.model.countDocuments({ isDeleted: true });

        results.push({
          type,
          typeName: modelInfo.name,
          records,
          count
        });
        totalCount = count;
      } catch (error) {
        logger.error(`Error getting deleted records from ${type}:`, error);
        results.push({
          type,
          typeName: modelInfo.name,
          records: [],
          count: 0
        });
      }
    } else {
      // Get from all models
      for (const [key, modelInfo] of Object.entries(MODELS)) {
        try {
          const records = await modelInfo.model
            .find({ isDeleted: true })
            .populate('deletedBy', 'name email')
            .populate('createdBy', 'name email')
            .populate('client', 'name nationalId phone')
            .sort('-deletedAt')
            .limit(10)
            .lean();

          const count = await modelInfo.model.countDocuments({ isDeleted: true });

          if (count > 0) {
            results.push({
              type: key,
              typeName: modelInfo.name,
              records,
              count
            });
            totalCount += count;
          }
        } catch (error) {
          logger.error(`Error getting deleted records from ${key}:`, error);
        }
      }
    }

    res.json({
      success: true,
      data: results,
      totalCount,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalCount / parseInt(limit))
    });
  })
);

/**
 * POST /api/trash/:type/:id/restore
 * Restore a deleted record
 */
router.post('/:type/:id/restore',
  auth,
  authorize('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { type, id } = req.params;

    if (!MODELS[type]) {
      return res.status(400).json({
        success: false,
        message: 'نوع غير صحيح'
      });
    }

    const modelInfo = MODELS[type];
    const record = await modelInfo.model.findById(id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: `لم يتم العثور على ${modelInfo.name}`
      });
    }

    if (!record.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'السجل ليس محذوفاً'
      });
    }

    // Restore the record
    record.isDeleted = false;
    record.deletedAt = null;
    record.deletedBy = null;
    await record.save();

    logger.info(`Record restored: ${type} - ${id} by ${req.user._id}`);

    res.json({
      success: true,
      message: `تم استرجاع ${modelInfo.name} بنجاح`,
      data: record
    });
  })
);

/**
 * DELETE /api/trash/:type/:id
 * Permanently delete a record (Super Admin only)
 */
router.delete('/:type/:id',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const { type, id } = req.params;

    if (!MODELS[type]) {
      return res.status(400).json({
        success: false,
        message: 'نوع غير صحيح'
      });
    }

    const modelInfo = MODELS[type];
    const record = await modelInfo.model.findById(id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: `لم يتم العثور على ${modelInfo.name}`
      });
    }

    // Permanently delete
    await modelInfo.model.findByIdAndDelete(id);

    logger.warn(`Record permanently deleted: ${type} - ${id} by ${req.user._id}`);

    res.json({
      success: true,
      message: `تم حذف ${modelInfo.name} نهائياً`
    });
  })
);

/**
 * DELETE /api/trash/:type/empty
 * Empty trash for specific type (Super Admin only)
 */
router.delete('/:type/empty',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const { type } = req.params;

    if (!MODELS[type]) {
      return res.status(400).json({
        success: false,
        message: 'نوع غير صحيح'
      });
    }

    const modelInfo = MODELS[type];
    
    // Delete all soft-deleted records permanently
    const result = await modelInfo.model.deleteMany({ isDeleted: true });

    logger.warn(`Trash emptied for ${type}: ${result.deletedCount} records by ${req.user._id}`);

    res.json({
      success: true,
      message: `تم إفراغ سلة المحذوفات لـ ${modelInfo.name}`,
      deletedCount: result.deletedCount
    });
  })
);

/**
 * DELETE /api/trash/empty-all
 * Empty all trash (Super Admin only)
 */
router.delete('/empty-all',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    let totalDeleted = 0;
    const details = {};

    // Delete from all models
    for (const [key, modelInfo] of Object.entries(MODELS)) {
      try {
        const result = await modelInfo.model.deleteMany({ isDeleted: true });
        details[key] = result.deletedCount;
        totalDeleted += result.deletedCount;
      } catch (error) {
        logger.error(`Error emptying trash for ${key}:`, error);
        details[key] = 0;
      }
    }

    logger.warn(`All trash emptied: ${totalDeleted} total records by ${req.user._id}`);

    res.json({
      success: true,
      message: 'تم إفراغ جميع المحذوفات نهائياً',
      totalDeleted,
      details
    });
  })
);

module.exports = router;
