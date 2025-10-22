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

// Helper function to get client statistics
async function getClientStatistics() {
  const totalClients = await Client.countDocuments();
  const activeClients = await Client.countDocuments({ isActive: true });
  
  // Get total animals from all client records
  const clientStats = await Client.aggregate([
    {
      $group: {
        _id: null,
        totalAnimals: { $sum: '$totalAnimals' }
      }
    }
  ]);
  
  return {
    totalClients,
    activeClients,
    totalAnimals: clientStats[0]?.totalAnimals || 0
  };
}

// Helper function to get recent activities
async function getRecentActivities(limit = 5) {
  const activities = [];
  
  // Get recent vaccination records
  const recentVaccinations = await Vaccination.find()
    .populate('client', 'name village')
    .sort({ createdAt: -1 })
    .limit(limit);
  
  recentVaccinations.forEach(record => {
    activities.push({
      id: record._id,
      type: 'vaccination',
      description: `تم تحصين ${record.totalVaccinated} حيوان لـ ${record.client?.name || 'عميل'}`,
      date: record.date,
      status: 'completed'
    });
  });
  
  return activities.slice(0, limit);
}

// Helper function to get detailed vaccination statistics
async function getVaccinationDetailedStats(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: null,
        uniqueOwners: { $addToSet: '$client' },
        uniqueVillages: { $addToSet: '$client' },
        uniqueHerds: { $sum: 1 },
        totalVaccinatedAnimals: {
          $sum: {
            $add: [
              '$herdCounts.sheep.vaccinated',
              '$herdCounts.goats.vaccinated',
              '$herdCounts.camel.vaccinated',
              '$herdCounts.cattle.vaccinated',
              '$herdCounts.horse.vaccinated'
            ]
          }
        }
      }
    }
  ];
  
  const result = await Vaccination.aggregate(pipeline);
  const stats = result[0] || {};
  
  // Get unique villages by aggregating client data
  const villageStats = await Vaccination.aggregate([
    { $match: filters },
    { $lookup: { from: 'clients', localField: 'client', foreignField: '_id', as: 'clientData' } },
    { $unwind: '$clientData' },
    { $group: { _id: '$clientData.village' } },
    { $count: 'uniqueVillages' }
  ]);
  
  return {
    servedOwners: stats.uniqueOwners?.length || 0,
    visitedVillages: villageStats[0]?.uniqueVillages || 0,
    visitedHerds: stats.uniqueHerds || 0,
    vaccinatedAnimals: stats.totalVaccinatedAnimals || 0,
    uniqueHerds: stats.uniqueHerds || 0
  };
}

// Helper function to get detailed parasite control statistics
async function getParasiteControlDetailedStats(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: null,
        uniqueOwners: { $addToSet: '$client' },
        uniqueHerds: { $sum: 1 },
        totalTreatedAnimals: {
          $sum: {
            $add: [
              '$herdCounts.sheep.treated',
              '$herdCounts.goats.treated',
              '$herdCounts.camel.treated',
              '$herdCounts.cattle.treated',
              '$herdCounts.horse.treated'
            ]
          }
        }
      }
    }
  ];
  
  const result = await ParasiteControl.aggregate(pipeline);
  const stats = result[0] || {};
  
  // Get unique villages
  const villageStats = await ParasiteControl.aggregate([
    { $match: filters },
    { $lookup: { from: 'clients', localField: 'client', foreignField: '_id', as: 'clientData' } },
    { $unwind: '$clientData' },
    { $group: { _id: '$clientData.village' } },
    { $count: 'uniqueVillages' }
  ]);
  
  return {
    servedOwners: stats.uniqueOwners?.length || 0,
    visitedVillages: villageStats[0]?.uniqueVillages || 0,
    visitedHerds: stats.uniqueHerds || 0,
    treatedAnimals: stats.totalTreatedAnimals || 0,
    uniqueHerds: stats.uniqueHerds || 0
  };
}

// Helper function to get detailed mobile clinic statistics
async function getMobileClinicDetailedStats(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: null,
        uniqueOwners: { $addToSet: '$client' },
        uniqueHerds: { $sum: 1 },
        totalAnimals: {
          $sum: {
            $add: [
              '$animalCounts.sheep',
              '$animalCounts.goats',
              '$animalCounts.camel',
              '$animalCounts.cattle',
              '$animalCounts.horse'
            ]
          }
        }
      }
    }
  ];
  
  const result = await MobileClinic.aggregate(pipeline);
  const stats = result[0] || {};
  
  // Get unique villages
  const villageStats = await MobileClinic.aggregate([
    { $match: filters },
    { $lookup: { from: 'clients', localField: 'client', foreignField: '_id', as: 'clientData' } },
    { $unwind: '$clientData' },
    { $group: { _id: '$clientData.village' } },
    { $count: 'uniqueVillages' }
  ]);
  
  return {
    servedOwners: stats.uniqueOwners?.length || 0,
    visitedVillages: villageStats[0]?.uniqueVillages || 0,
    visitedHerds: stats.uniqueHerds || 0,
    treatedAnimals: stats.totalAnimals || 0,
    uniqueHerds: stats.uniqueHerds || 0
  };
}

// Helper function to get detailed laboratory statistics
async function getLaboratoryDetailedStats(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: null,
        uniqueOwners: { $addToSet: '$client' },
        uniqueHerds: { $sum: 1 },
        totalSamples: { $sum: { $add: ['$positiveCases', '$negativeCases'] } },
        totalAnimals: {
          $sum: {
            $add: [
              '$speciesCounts.sheep',
              '$speciesCounts.goats',
              '$speciesCounts.camel',
              '$speciesCounts.cattle',
              '$speciesCounts.horse'
            ]
          }
        }
      }
    }
  ];
  
  const result = await Laboratory.aggregate(pipeline);
  const stats = result[0] || {};
  
  // Get unique villages
  const villageStats = await Laboratory.aggregate([
    { $match: filters },
    { $lookup: { from: 'clients', localField: 'client', foreignField: '_id', as: 'clientData' } },
    { $unwind: '$clientData' },
    { $group: { _id: '$clientData.village' } },
    { $count: 'uniqueVillages' }
  ]);
  
  return {
    servedOwners: stats.uniqueOwners?.length || 0,
    visitedVillages: villageStats[0]?.uniqueVillages || 0,
    sampledHerds: stats.uniqueHerds || 0,
    testedAnimals: stats.totalSamples || 0,
    uniqueHerds: stats.uniqueHerds || 0
  };
}

/**
 * @swagger
 * /api/reports/dashboard:
 *   get:
 *     summary: Get comprehensive dashboard statistics
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter
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

    // Get comprehensive statistics from all modules
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

    // Get detailed stats for each category
    const [
      vaccinationDetailedStats,
      parasiteControlDetailedStats,
      mobileClinicDetailedStats,
      laboratoryDetailedStats
    ] = await Promise.all([
      getVaccinationDetailedStats(dateFilter),
      getParasiteControlDetailedStats(dateFilter),
      getMobileClinicDetailedStats(dateFilter),
      getLaboratoryDetailedStats(dateFilter)
    ]);

    // Recent activities
    const recentActivities = await getRecentActivities(5);

    // Calculate comparative stats
    const comparativeStats = {
      servedHerds: {
        vaccinated: vaccinationDetailedStats.uniqueHerds,
        treated: mobileClinicDetailedStats.uniqueHerds,
        sprayed: parasiteControlDetailedStats.uniqueHerds
      },
      servedAnimals: {
        vaccination: vaccinationStats.totalVaccinated || 0,
        treatment: mobileClinicStats.totalAnimals || 0,
        parasiteControl: parasiteControlStats.totalTreated || 0
      }
    };

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
      vaccination: {
        ...vaccinationStats,
        ...vaccinationDetailedStats
      },
      parasiteControl: {
        ...parasiteControlStats,
        ...parasiteControlDetailedStats
      },
      mobileClinic: {
        ...mobileClinicStats,
        ...mobileClinicDetailedStats
      },
      laboratory: {
        ...laboratoryStats,
        ...laboratoryDetailedStats
      },
      equineHealth: equineHealthStats,
      clients: clientStats,
      comparativeStats,
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
  asyncHandler(async (req, res) => {
    // Add default user for export
    req.user = { _id: 'system', role: 'super_admin', name: 'System Export' };
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
