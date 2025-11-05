/**
 * Trash Management Routes
 * Unified trash system for all soft-deleted records
 */

const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Laboratory = require('../models/Laboratory');
const Vaccination = require('../models/Vaccination');
const ParasiteControl = require('../models/ParasiteControl');
const MobileClinic = require('../models/MobileClinic');
const EquineHealth = require('../models/EquineHealth');
const Client = require('../models/Client');
const logger = require('../utils/logger');

const router = express.Router();

// Model mapping
const MODELS = {
  laboratory: { model: Laboratory, name: 'المختبرات', nameSingular: 'مختبر' },
  vaccination: { model: Vaccination, name: 'التطعيمات', nameSingular: 'تطعيم' },
  parasite_control: { model: ParasiteControl, name: 'مكافحة الطفيليات', nameSingular: 'سجل طفيليات' },
  mobile_clinic: { model: MobileClinic, name: 'العيادات المتنقلة', nameSingular: 'عيادة متنقلة' },
  equine_health: { model: EquineHealth, name: 'صحة الخيول', nameSingular: 'سجل خيول' },
  client: { model: Client, name: 'المربين', nameSingular: 'مربي' }
};

/**
 * @swagger
 * /api/trash:
 *   get:
 *     summary: Get all deleted records from all models
 *     tags: [Trash]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [laboratory, vaccination, parasite_control, mobile_clinic, equine_health, client]
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 */
router.get('/',
  auth,
  authorize('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, type, startDate, endDate } = req.query;
    
    const results = [];
    let totalCount = 0;

    // Filter by date if provided
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.deletedAt = {};
      if (startDate) dateFilter.deletedAt.$gte = new Date(startDate);
      if (endDate) dateFilter.deletedAt.$lte = new Date(endDate);
    }

    // If specific type requested
    if (type && MODELS[type]) {
      const modelInfo = MODELS[type];
      try {
        const deletedRecords = await modelInfo.model.getDeleted({
          page: parseInt(page),
          limit: parseInt(limit),
          populate: ['deletedBy', 'createdBy', 'client']
        });

        const count = await modelInfo.model.countDeleted(dateFilter);

        results.push({
          type,
          typeName: modelInfo.name,
          records: deletedRecords,
          count
        });
        totalCount = count;
      } catch (error) {
        logger.error(`Error getting deleted records from ${type}:`, error);
        // Return empty results on error
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
          const deletedRecords = await modelInfo.model.getDeleted({
            page: 1,
            limit: parseInt(limit),
            populate: ['deletedBy', 'createdBy', 'client']
          });

          const count = await modelInfo.model.countDeleted(dateFilter);

          if (deletedRecords.length > 0) {
            results.push({
              type: key,
              typeName: modelInfo.name,
              records: deletedRecords,
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
 * @swagger
 * /api/trash/stats:
 *   get:
 *     summary: Get trash statistics
 *     tags: [Trash]
 */
router.get('/stats',
  auth,
  authorize('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const stats = {};

    for (const [key, modelInfo] of Object.entries(MODELS)) {
      try {
        const count = await modelInfo.model.countDeleted();
        stats[key] = {
          name: modelInfo.name,
          count
        };
      } catch (error) {
        logger.error(`Error getting stats for ${key}:`, error);
        stats[key] = { name: modelInfo.name, count: 0 };
      }
    }

    const totalCount = Object.values(stats).reduce((sum, item) => sum + item.count, 0);

    res.json({
      success: true,
      stats,
      totalCount
    });
  })
);

/**
 * @swagger
 * /api/trash/{type}/{id}/restore:
 *   post:
 *     summary: Restore a deleted record
 *     tags: [Trash]
 */
router.post('/:type/:id/restore',
  auth,
  authorize('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { type, id } = req.params;

    if (!MODELS[type]) {
      return res.status(400).json({
        success: false,
        message: 'نوع السجل غير صحيح',
        error: 'INVALID_TYPE'
      });
    }

    const modelInfo = MODELS[type];
    const restored = await modelInfo.model.restoreById(id);

    if (!restored) {
      return res.status(404).json({
        success: false,
        message: 'السجل المحذوف غير موجود',
        error: 'NOT_FOUND'
      });
    }

    logger.info(`Record restored from trash: ${type}/${id} by user ${req.user._id}`);

    res.json({
      success: true,
      message: `تم استرجاع ${modelInfo.nameSingular} بنجاح`,
      data: restored
    });
  })
);

/**
 * @swagger
 * /api/trash/{type}/{id}:
 *   delete:
 *     summary: Permanently delete a record
 *     tags: [Trash]
 */
router.delete('/:type/:id',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const { type, id } = req.params;

    if (!MODELS[type]) {
      return res.status(400).json({
        success: false,
        message: 'نوع السجل غير صحيح',
        error: 'INVALID_TYPE'
      });
    }

    const modelInfo = MODELS[type];
    const deleted = await modelInfo.model.hardDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'السجل المحذوف غير موجود',
        error: 'NOT_FOUND'
      });
    }

    logger.info(`Record permanently deleted: ${type}/${id} by user ${req.user._id}`);

    res.json({
      success: true,
      message: `تم حذف ${modelInfo.nameSingular} نهائياً`
    });
  })
);

/**
 * @swagger
 * /api/trash/{type}/empty:
 *   delete:
 *     summary: Empty trash for specific type
 *     tags: [Trash]
 */
router.delete('/:type/empty',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const { type } = req.params;

    if (!MODELS[type]) {
      return res.status(400).json({
        success: false,
        message: 'نوع السجل غير صحيح',
        error: 'INVALID_TYPE'
      });
    }

    const modelInfo = MODELS[type];
    const result = await modelInfo.model.emptyTrash();

    logger.info(`Trash emptied for ${type}: ${result.deletedCount} records by user ${req.user._id}`);

    res.json({
      success: true,
      message: `تم إفراغ سلة المحذوفات لـ ${modelInfo.name}`,
      deletedCount: result.deletedCount
    });
  })
);

/**
 * @swagger
 * /api/trash/empty-all:
 *   delete:
 *     summary: Empty all trash
 *     tags: [Trash]
 */
router.delete('/empty-all',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    let totalDeleted = 0;
    const results = {};

    for (const [key, modelInfo] of Object.entries(MODELS)) {
      try {
        const result = await modelInfo.model.emptyTrash();
        results[key] = result.deletedCount;
        totalDeleted += result.deletedCount;
      } catch (error) {
        logger.error(`Error emptying trash for ${key}:`, error);
        results[key] = 0;
      }
    }

    logger.info(`All trash emptied: ${totalDeleted} records by user ${req.user._id}`);

    res.json({
      success: true,
      message: 'تم إفراغ جميع المحذوفات نهائياً',
      totalDeleted,
      details: results
    });
  })
);

module.exports = router;
