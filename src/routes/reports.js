const express = require('express');
const ParasiteControl = require('../models/ParasiteControl');
const Vaccination = require('../models/Vaccination');
const MobileClinic = require('../models/MobileClinic');
const EquineHealth = require('../models/EquineHealth');
const Laboratory = require('../models/Laboratory');
const Client = require('../models/Client');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @swagger
 * /api/reports/dashboard:
 *   get:
 *     summary: Get dashboard statistics
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 */
router.get('/dashboard',
  auth,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get statistics from all modules
    const [
      parasiteControlStats,
      vaccinationStats,
      mobileClinicStats,
      equineHealthStats,
      laboratoryStats,
      clientStats
    ] = await Promise.all([
      ParasiteControl.getStatistics(dateFilter),
      Vaccination.getStatistics(dateFilter),
      MobileClinic.getStatistics(dateFilter),
      EquineHealth.getStatistics(dateFilter),
      Laboratory.getStatistics(dateFilter),
      getClientStatistics()
    ]);

    // Recent activities
    const recentActivities = await getRecentActivities(5);

    const dashboardData = {
      overview: {
        totalClients: clientStats.totalClients,
        activeClients: clientStats.activeClients,
        totalAnimals: clientStats.totalAnimals,
        totalRecords: parasiteControlStats.totalRecords + 
                     vaccinationStats.totalRecords + 
                     mobileClinicStats.totalRecords + 
                     equineHealthStats.totalRecords + 
                     laboratoryStats.totalRecords
      },
      parasiteControl: parasiteControlStats,
      vaccination: vaccinationStats,
      mobileClinic: mobileClinicStats,
      equineHealth: equineHealthStats,
      laboratory: laboratoryStats,
      clients: clientStats,
      recentActivities
    };

    res.json({
      success: true,
      data: dashboardData
    });
  })
);

/**
 * @swagger
 * /api/reports/monthly:
 *   get:
 *     summary: Get monthly report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Year for the report
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: Month for the report
 *     responses:
 *       200:
 *         description: Monthly report retrieved successfully
 */
router.get('/monthly',
  auth,
  asyncHandler(async (req, res) => {
    const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query;
    
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const dateFilter = {
      date: {
        $gte: startDate,
        $lte: endDate
      }
    };

    // Get monthly statistics
    const monthlyStats = await Promise.all([
      ParasiteControl.getStatistics(dateFilter),
      Vaccination.getStatistics(dateFilter),
      MobileClinic.getStatistics(dateFilter),
      EquineHealth.getStatistics(dateFilter),
      Laboratory.getStatistics(dateFilter)
    ]);

    const monthlyReport = {
      period: {
        year: parseInt(year),
        month: parseInt(month),
        startDate,
        endDate
      },
      statistics: {
        parasiteControl: monthlyStats[0],
        vaccination: monthlyStats[1],
        mobileClinic: monthlyStats[2],
        equineHealth: monthlyStats[3],
        laboratory: monthlyStats[4]
      }
    };

    res.json({
      success: true,
      data: monthlyReport
    });
  })
);

/**
 * @swagger
 * /api/reports/export:
 *   get:
 *     summary: Export comprehensive report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *         description: Export format
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [all, parasite-control, vaccination, mobile-clinics, equine-health, laboratory, clients]
 *         description: Report type
 *     responses:
 *       200:
 *         description: Report exported successfully
 */
router.get('/export',
  auth,
  asyncHandler(async (req, res) => {
    const { format = 'json', type = 'all', startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    let data = {};

    // Get data based on type
    switch (type) {
      case 'parasite-control':
        data.parasiteControl = await ParasiteControl.find(dateFilter)
          .populate('client', 'name nationalId phone village');
        break;
      case 'vaccination':
        data.vaccination = await Vaccination.find(dateFilter)
          .populate('client', 'name nationalId phone village');
        break;
      case 'mobile-clinics':
        data.mobileClinics = await MobileClinic.find(dateFilter)
          .populate('client', 'name nationalId phone village');
        break;
      case 'equine-health':
        data.equineHealth = await EquineHealth.find(dateFilter)
          .populate('client', 'name nationalId phone village');
        break;
      case 'laboratory':
        data.laboratory = await Laboratory.find(dateFilter)
          .populate('client', 'name nationalId phone village');
        break;
      case 'clients':
        data.clients = await Client.find({});
        break;
      default: // all
        data = await getAllData(dateFilter);
    }

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      const fields = Object.keys(data).length > 0 ? Object.keys(data[Object.keys(data)[0]][0] || {}) : [];
      const parser = new Parser({ fields });
      const csv = parser.parse(Object.values(data).flat());
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=ahcp-report-${type}.csv`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data
      });
    }
  })
);

// Helper functions
async function getClientStatistics() {
  const totalClients = await Client.countDocuments();
  const activeClients = await Client.countDocuments({ status: 'نشط' });
  
  const animalStats = await Client.aggregate([
    { $unwind: '$animals' },
    {
      $group: {
        _id: null,
        totalAnimals: { $sum: '$animals.animalCount' }
      }
    }
  ]);

  return {
    totalClients,
    activeClients,
    totalAnimals: animalStats[0]?.totalAnimals || 0
  };
}

async function getRecentActivities(limit = 10) {
  const activities = [];

  // Get recent records from all collections
  const [parasiteControl, vaccination, mobileClinic, equineHealth, laboratory] = await Promise.all([
    ParasiteControl.find({}).sort({ createdAt: -1 }).limit(limit).populate('client', 'name'),
    Vaccination.find({}).sort({ createdAt: -1 }).limit(limit).populate('client', 'name'),
    MobileClinic.find({}).sort({ createdAt: -1 }).limit(limit).populate('client', 'name'),
    EquineHealth.find({}).sort({ createdAt: -1 }).limit(limit).populate('client', 'name'),
    Laboratory.find({}).sort({ createdAt: -1 }).limit(limit).populate('client', 'name')
  ]);

  // Format activities
  parasiteControl.forEach(record => {
    activities.push({
      type: 'Parasite Control',
      description: `مكافحة طفيليات - ${record.client?.name}`,
      date: record.createdAt,
      id: record._id
    });
  });

  vaccination.forEach(record => {
    activities.push({
      type: 'Vaccination',
      description: `تحصين - ${record.client?.name}`,
      date: record.createdAt,
      id: record._id
    });
  });

  // Sort by date and limit
  return activities.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
}

async function getAllData(dateFilter) {
  const [parasiteControl, vaccination, mobileClinics, equineHealth, laboratory, clients] = await Promise.all([
    ParasiteControl.find(dateFilter).populate('client', 'name nationalId phone village'),
    Vaccination.find(dateFilter).populate('client', 'name nationalId phone village'),
    MobileClinic.find(dateFilter).populate('client', 'name nationalId phone village'),
    EquineHealth.find(dateFilter).populate('client', 'name nationalId phone village'),
    Laboratory.find(dateFilter).populate('client', 'name nationalId phone village'),
    Client.find({})
  ]);

  return {
    parasiteControl,
    vaccination,
    mobileClinics,
    equineHealth,
    laboratory,
    clients
  };
}

module.exports = router;
