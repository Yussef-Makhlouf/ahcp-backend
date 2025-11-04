const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Client = require('../models/Client');
const { validate, validateQuery, schemas } = require('../middleware/validation');
const { auth, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { handleTemplate, handleImport } = require('../utils/importExportHelpers');

const logger = require('../utils/logger');
const router = express.Router();
// Configure multer for file uploads using serverless-compatible storage
const { createStandardUpload } = require('../utils/serverless-storage');
const upload = createStandardUpload('clients');

/**
 * @swagger
 * /api/clients:
 *   get:
 *     summary: Get all clients
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of clients per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [نشط, غير نشط]
 *         description: Filter by status
 *       - in: query
 *         name: village
 *         schema:
 *           type: string
 *         description: Filter by village
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in name, national ID, or phone
 *       - in: query
 *         name: servicesReceived
 *         schema:
 *           type: string
 *         description: Filter by services received (comma-separated)
 *       - in: query
 *         name: animals.animalType
 *         schema:
 *           type: string
 *         description: Filter by animal type (comma-separated)
 *       - in: query
 *         name: totalAnimals
 *         schema:
 *           type: string
 *           enum: [1-10, 11-50, 51-100, 101-500, 500+]
 *         description: Filter by total animals range
 *     responses:
 *       200:
 *         description: Clients retrieved successfully
 */
router.get('/',
  auth,
  validateQuery(schemas.paginationQuery),
  asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 30, 
      status, 
      village, 
      search, 
      animalType, 
      includeServices = 'true',
      servicesReceived,
      'animals.animalType': animalsAnimalType,
      totalAnimals,
      startDate,
      endDate
    } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (village) filter.village = { $regex: village, $options: 'i' };
    if (animalType || animalsAnimalType) {
      const animalTypeFilter = animalType || animalsAnimalType;
      if (animalTypeFilter.includes(',')) {
        // Multiple animal types
        filter['animals.animalType'] = { $in: animalTypeFilter.split(',') };
      } else {
        filter['animals.animalType'] = animalTypeFilter;
      }
    }
    
    // Total animals filter
    if (totalAnimals) {
      const totalAnimalsFilter = totalAnimals;
      if (totalAnimalsFilter === '1-10') {
        filter['totalAnimals'] = { $gte: 1, $lte: 10 };
      } else if (totalAnimalsFilter === '11-50') {
        filter['totalAnimals'] = { $gte: 11, $lte: 50 };
      } else if (totalAnimalsFilter === '51-100') {
        filter['totalAnimals'] = { $gte: 51, $lte: 100 };
      } else if (totalAnimalsFilter === '101-500') {
        filter['totalAnimals'] = { $gte: 101, $lte: 500 };
      } else if (totalAnimalsFilter === '500+') {
        filter['totalAnimals'] = { $gt: 500 };
      }
    }
    
    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate + 'T23:59:59.999Z');
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { nationalId: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { village: { $regex: search, $options: 'i' } }
      ];
    }

    // Get clients with error handling
    let clients = [];
    let total = 0;
    
    try {
      if (includeServices === 'true') {
        // Use aggregation pipeline to gather data from all forms
        const aggregationPipeline = [
          { $match: filter },
          {
            $lookup: {
              from: 'mobileclinics',
              localField: '_id',
              foreignField: 'client',
              as: 'mobileClinics'
            }
          },
          {
            $lookup: {
              from: 'vaccinations',
              localField: '_id',
              foreignField: 'client',
              as: 'vaccinations'
            }
          },
          {
            $lookup: {
              from: 'equinehealths',
              let: { clientId: '$_id', nationalId: '$nationalId' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $or: [
                        { $eq: ['$client', '$$clientId'] },
                        { $eq: ['$client.nationalId', '$$nationalId'] }
                      ]
                    }
                  }
                }
              ],
              as: 'equineHealths'
            }
          },
          {
            $lookup: {
              from: 'laboratories',
              localField: '_id',
              foreignField: 'client',
              as: 'laboratories'
            }
          },
          {
            $lookup: {
              from: 'parasitecontrols',
              localField: '_id',
              foreignField: 'client',
              as: 'parasiteControls'
            }
          },
          {
            $addFields: {
              // Aggregate services received
              servicesReceived: {
                $setUnion: [
                  { $map: { input: '$mobileClinics', as: 'mc', in: 'mobile_clinic' } },
                  { $map: { input: '$vaccinations', as: 'v', in: 'vaccination' } },
                  { $map: { input: '$equineHealths', as: 'eh', in: 'equine_health' } },
                  { $map: { input: '$laboratories', as: 'l', in: 'laboratory' } },
                  { $map: { input: '$parasiteControls', as: 'pc', in: 'parasite_control' } },
                  { $ifNull: ['$availableServices', []] }
                ]
              },
              // Get birth date from any form that has it
              birthDateFromForms: {
                $let: {
                  vars: {
                    vaccinationBirthDate: { $arrayElemAt: ['$vaccinations.client.birthDate', 0] },
                    laboratoryBirthDate: { $arrayElemAt: ['$laboratories.clientBirthDate', 0] },
                    mobileClinicBirthDate: { $arrayElemAt: ['$mobileClinics.client.birthDate', 0] }
                  },
                  in: {
                    $cond: {
                      if: { $ne: ['$$vaccinationBirthDate', null] },
                      then: '$$vaccinationBirthDate',
                      else: {
                        $cond: {
                          if: { $ne: ['$$laboratoryBirthDate', null] },
                          then: '$$laboratoryBirthDate',
                          else: '$$mobileClinicBirthDate'
                        }
                      }
                    }
                  }
                }
              },
              // Count total visits
              totalVisits: {
                $add: [
                  { $size: '$mobileClinics' },
                  { $size: '$vaccinations' },
                  { $size: '$equineHealths' },
                  { $size: '$laboratories' },
                  { $size: '$parasiteControls' }
                ]
              },
              // Get last service date
              lastServiceDate: {
                $let: {
                  vars: {
                    allDates: {
                      $concatArrays: [
                        { $map: { input: '$mobileClinics', as: 'mc', in: '$$mc.date' } },
                        { $map: { input: '$vaccinations', as: 'v', in: '$$v.date' } },
                        { $map: { input: '$equineHealths', as: 'eh', in: '$$eh.date' } },
                        { $map: { input: '$laboratories', as: 'l', in: '$$l.date' } },
                        { $map: { input: '$parasiteControls', as: 'pc', in: '$$pc.date' } }
                      ]
                    }
                  },
                  in: { $max: '$$allDates' }
                }
              }
            }
          },
          // Add additional filtering after aggregation
          ...(servicesReceived || totalAnimals ? [{
            $match: {
              ...(servicesReceived && {
                servicesReceived: servicesReceived.includes(',') 
                  ? { $in: servicesReceived.split(',') }
                  : servicesReceived
              }),
              ...(totalAnimals && (() => {
                // Calculate total animals and filter based on range
                const totalAnimalsCount = {
                  $sum: {
                    $map: {
                      input: '$animals',
                      as: 'animal',
                      in: '$$animal.animalCount'
                    }
                  }
                };
                
                switch (totalAnimals) {
                  case '1-10':
                    return { $expr: { $and: [{ $gte: [totalAnimalsCount, 1] }, { $lte: [totalAnimalsCount, 10] }] } };
                  case '11-50':
                    return { $expr: { $and: [{ $gte: [totalAnimalsCount, 11] }, { $lte: [totalAnimalsCount, 50] }] } };
                  case '51-100':
                    return { $expr: { $and: [{ $gte: [totalAnimalsCount, 51] }, { $lte: [totalAnimalsCount, 100] }] } };
                  case '101-500':
                    return { $expr: { $and: [{ $gte: [totalAnimalsCount, 101] }, { $lte: [totalAnimalsCount, 500] }] } };
                  case '500+':
                    return { $expr: { $gt: [totalAnimalsCount, 500] } };
                  default:
                    return {};
                }
              })())
            }
          }] : []),
          {
            $addFields: {
              // Calculate total animals for display
              totalAnimals: {
                $sum: {
                  $map: {
                    input: '$animals',
                    as: 'animal',
                    in: '$$animal.animalCount'
                  }
                }
              }
            }
          },
          {
            $project: {
              // Keep _id field - IMPORTANT!
              _id: 1,
              // Keep all original client fields
              name: 1,
              nationalId: 1,
              phone: 1,
              email: 1,
              village: 1,
              birthDate: 1,
              status: 1,
              animals: 1,
              availableServices: 1,
              coordinates: 1,
              serialNumber: 1,
              createdBy: 1,
              updatedBy: 1,
              createdAt: 1,
              updatedAt: 1,
              // Add aggregated fields
              servicesReceived: 1,
              birthDateFromForms: 1,
              totalVisits: 1,
              lastServiceDate: 1,
              totalAnimals: 1,
              // Add individual service counts
              mobileClinicCount: { $size: '$mobileClinics' },
              vaccinationCount: { $size: '$vaccinations' },
              equineHealthCount: { $size: '$equineHealths' },
              laboratoryCount: { $size: '$laboratories' },
              parasiteControlCount: { $size: '$parasiteControls' }
            }
          },
          { $sort: { serialNumber: 1, createdAt: 1 } }, // Sort by serialNumber ascending, then by createdAt
          { $skip: skip },
          { $limit: parseInt(limit) }
        ];

        clients = await Client.aggregate(aggregationPipeline);
        
        // Populate createdBy, updatedBy, and village fields
        for (let client of clients) {
          if (client.createdBy || client.updatedBy || client.village) {
            const populatedClient = await Client.findById(client._id)
              .populate('createdBy', 'name email')
              .populate('updatedBy', 'name email')
              .populate('village', 'nameArabic nameEnglish serialNumber sector');
            
            if (populatedClient) {
              client.createdBy = populatedClient.createdBy;
              client.updatedBy = populatedClient.updatedBy;
              client.village = populatedClient.village;
            }
          }
        }
      } else {
        // Simple query without aggregation
        clients = await Client.find(filter)
          .populate('createdBy', 'name email')
          .populate('updatedBy', 'name email')
          .populate('village', 'nameArabic nameEnglish serialNumber sector')
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ serialNumber: 1, createdAt: 1 }); // Sort by serialNumber ascending, then by createdAt
      }
    } catch (findError) {
      logger.error('Error finding clients:', { error: findError });
      clients = [];
    }
    
    try {
      if (includeServices === 'true' && (servicesReceived || totalAnimals)) {
        // Use aggregation to count with complex filters
        const countPipeline = [
          { $match: filter },
          {
            $lookup: {
              from: 'mobileclinics',
              localField: '_id',
              foreignField: 'client',
              as: 'mobileClinics'
            }
          },
          {
            $lookup: {
              from: 'vaccinations',
              localField: '_id',
              foreignField: 'client',
              as: 'vaccinations'
            }
          },
          {
            $lookup: {
              from: 'equinehealths',
              let: { clientId: '$_id', nationalId: '$nationalId' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $or: [
                        { $eq: ['$client', '$$clientId'] },
                        { $eq: ['$client.nationalId', '$$nationalId'] }
                      ]
                    }
                  }
                }
              ],
              as: 'equineHealths'
            }
          },
          {
            $lookup: {
              from: 'laboratories',
              localField: '_id',
              foreignField: 'client',
              as: 'laboratories'
            }
          },
          {
            $lookup: {
              from: 'parasitecontrols',
              localField: '_id',
              foreignField: 'client',
              as: 'parasiteControls'
            }
          },
          {
            $addFields: {
              servicesReceived: {
                $setUnion: [
                  { $map: { input: '$mobileClinics', as: 'mc', in: 'mobile_clinic' } },
                  { $map: { input: '$vaccinations', as: 'v', in: 'vaccination' } },
                  { $map: { input: '$equineHealths', as: 'eh', in: 'equine_health' } },
                  { $map: { input: '$laboratories', as: 'l', in: 'laboratory' } },
                  { $map: { input: '$parasiteControls', as: 'pc', in: 'parasite_control' } },
                  { $ifNull: ['$availableServices', []] }
                ]
              }
            }
          },
          // Apply the same additional filters
          ...(servicesReceived || totalAnimals ? [{
            $match: {
              ...(servicesReceived && {
                servicesReceived: servicesReceived.includes(',') 
                  ? { $in: servicesReceived.split(',') }
                  : servicesReceived
              }),
              ...(totalAnimals && (() => {
                const totalAnimalsCount = {
                  $sum: {
                    $map: {
                      input: '$animals',
                      as: 'animal',
                      in: '$$animal.animalCount'
                    }
                  }
                };
                
                switch (totalAnimals) {
                  case '1-10':
                    return { $expr: { $and: [{ $gte: [totalAnimalsCount, 1] }, { $lte: [totalAnimalsCount, 10] }] } };
                  case '11-50':
                    return { $expr: { $and: [{ $gte: [totalAnimalsCount, 11] }, { $lte: [totalAnimalsCount, 50] }] } };
                  case '51-100':
                    return { $expr: { $and: [{ $gte: [totalAnimalsCount, 51] }, { $lte: [totalAnimalsCount, 100] }] } };
                  case '101-500':
                    return { $expr: { $and: [{ $gte: [totalAnimalsCount, 101] }, { $lte: [totalAnimalsCount, 500] }] } };
                  case '500+':
                    return { $expr: { $gt: [totalAnimalsCount, 500] } };
                  default:
                    return {};
                }
              })())
            }
          }] : []),
          { $count: "total" }
        ];
        
        const countResult = await Client.aggregate(countPipeline);
        total = countResult.length > 0 ? countResult[0].total : 0;
      } else {
        total = await Client.countDocuments(filter);
      }
    } catch (countError) {
      logger.error('Error counting clients:', { error: countError });
      total = 0;
    }

    res.json({
      success: true,
      data: clients,
      total: total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    });
  })
);

/**
 * @swagger
 * /api/clients/statistics:
 *   get:
 *     summary: Get clients statistics
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get('/statistics',
  auth,
  asyncHandler(async (req, res) => {
    try {
      const totalClients = await Client.countDocuments();
      const activeClients = await Client.countDocuments({ status: 'نشط' });
      const inactiveClients = totalClients - activeClients;
      
      // Simple statistics without complex aggregation
      const statistics = {
        totalClients,
        activeClients,
        inactiveClients,
        totalAnimals: 0 // Will be calculated if needed
      };

      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      logger.error('Error getting clients statistics:', { error: error });
      
      // Return basic count if aggregation fails
      let basicStats = {
        totalClients: 0,
        activeClients: 0,
        inactiveClients: 0,
        totalAnimals: 0
      };
      
      try {
        basicStats.totalClients = await Client.countDocuments();
      } catch (countError) {
        logger.error('Error counting clients:', { error: countError });
      }
      
      res.json({
        success: true,
        data: basicStats
      });
    }
  })
);

/**
 * @swagger
 * /api/clients/export:
 *   get:
 *     summary: Export clients data
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json, excel]
 *         description: Export format
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [نشط, غير نشط]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Data exported successfully
 */
router.get('/export',
  asyncHandler(async (req, res) => {
    // Add default user for export
    req.user = { _id: 'system', role: 'super_admin', name: 'System Export' };
    const { 
      format = 'json', 
      servicesReceived,
      startDate,
      endDate,
      search
    } = req.query;
    
    logger.info('Clients Export - Received query params:', { data: req.query });
    
    const filter = {};
    
    // Services received filter
    if (servicesReceived && servicesReceived !== '__all__') {
      const services = servicesReceived.split(',');
      logger.info('Filtering by services:', { data: services });
      
      // Create comprehensive service filter to match different service name formats
      const serviceVariants = [];
      services.forEach(service => {
        serviceVariants.push(service); // Original value
        
        // Add common variants
        if (service === 'mobile_clinic') {
          serviceVariants.push('Mobile Clinic', 'mobile clinic', 'العيادة المتنقلة');
        } else if (service === 'parasite_control') {
          serviceVariants.push('Parasite Control', 'parasite control', 'مكافحة الطفيليات');
        } else if (service === 'vaccination') {
          serviceVariants.push('Vaccination', 'vaccination', 'التحصين');
        } else if (service === 'laboratory') {
          serviceVariants.push('Laboratory', 'laboratory', 'المختبر');
        } else if (service === 'equine_health') {
          serviceVariants.push('Equine Health', 'equine health', 'صحة الخيول', 'Horse Health');
        }
      });
      
      logger.info('Service variants to search for:', { data: serviceVariants });
      
      // Use $or for services fields only, don't overwrite existing $or
      const servicesFilter = {
        $or: [
          { servicesReceived: { $in: serviceVariants } },
          { availableServices: { $in: serviceVariants } },
          { available_services: { $in: serviceVariants } }
        ]
      };
      
      // If there's already an $or condition, combine them with $and
      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          servicesFilter
        ];
        delete filter.$or;
      } else {
        Object.assign(filter, servicesFilter);
      }
    }
    
    // Date filter
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    // Search filter
    if (search) {
      const searchFilter = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { nationalId: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { village: { $regex: search, $options: 'i' } }
        ]
      };
      
      // If there's already an $and condition, add to it
      if (filter.$and) {
        filter.$and.push(searchFilter);
      } else if (filter.$or) {
        // If there's an $or condition, combine with $and
        filter.$and = [
          { $or: filter.$or },
          searchFilter
        ];
        delete filter.$or;
      } else {
        Object.assign(filter, searchFilter);
      }
    }

    logger.info('Clients Export - Applied filter:', { data: JSON.stringify(filter, null, 2) });

    const clients = await Client.find(filter)
      .populate('village', 'nameArabic nameEnglish name serialNumber')
      .sort({ createdAt: -1 });

    logger.info(`Clients Export - Found ${clients.length} clients matching filter`);
    
    // Add detailed logging for debugging
    if (clients.length === 0) {
      logger.info('No clients found Checking if any clients exist in database');
      const totalClients = await Client.countDocuments({});
      logger.info(`Total clients in database: ${totalClients}`);
      
      if (totalClients > 0 && servicesReceived) {
        logger.info('Checking what services exist in database');
        
        // Check what services actually exist in the database
        const servicesAggregation = await Client.aggregate([
          {
            $project: {
              allServices: {
                $concatArrays: [
                  { $ifNull: ['$servicesReceived', []] },
                  { $ifNull: ['$availableServices', []] },
                  { $ifNull: ['$available_services', []] }
                ]
              }
            }
          },
          { $unwind: { path: '$allServices', preserveNullAndEmptyArrays: true } },
          { $group: { _id: '$allServices', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]);
        
        logger.info('Services found in database:', { data: servicesAggregation });
        logger.info('Filter may be too restrictive Consider adjusting filter criteria');
      }
    } else {
      logger.info(`Successfully found ${clients.length} clients for export`);
    }

    // Transform data for export to match table columns exactly
    const transformedClients = clients.map(client => {
      // Handle village data (both string and object types)
      let village = 'غير محدد';
      let villageCode = '';
      if (client.village) {
        if (typeof client.village === 'string') {
          village = client.village;
        } else if (typeof client.village === 'object' && client.village !== null) {
          village = client.village.nameArabic || client.village.nameEnglish || client.village.name || '';
          villageCode = client.village.serialNumber || '';
        }
      }

      // Handle services received
      const services = client.servicesReceived || client.availableServices || client.available_services || [];
      const serviceNames = {
        'parasite_control': 'مكافحة الطفيليات',
        'vaccination': 'التحصين',
        'mobile_clinic': 'العيادة المتنقلة',
        'equine_health': 'صحة الخيول',
        'laboratory': 'المختبر',
        'Horse Health': 'صحة الخيول',
        'Vaccination': 'التحصين',
        'Parasite Control': 'مكافحة الطفيليات',
        'Mobile Clinic': 'العيادة المتنقلة',
        'Laboratory': 'المختبر',
        'Equine Health': 'صحة الخيول'
      };
      const servicesText = services.map(service => serviceNames[service] || service).join(', ') || 'لا توجد خدمات';

      // Calculate total animals from animals array
      let totalAnimals = client.totalAnimals || 0;
      if (!totalAnimals && client.animals && Array.isArray(client.animals)) {
        totalAnimals = client.animals.reduce((sum, animal) => {
          return sum + (animal.animalCount || animal.animal_count || 0);
        }, 0);
      }

      // Handle birth date priority (from forms first, then client data)
      const birthDate = client.birthDateFromForms || client.birthDate || client.birth_date;
      const birthDateSource = client.birthDateFromForms ? 'من النماذج' : 'من المربي';
      
      return {
        'الرقم التسلسلي': client.serialNumber || '',
        'الرقم القومي': client.nationalId || client.national_id || '',
        'الاسم': client.name || '',
        'رقم الهاتف': client.phone || '',
        'القرية': village,
        'تاريخ الميلاد': birthDate ? new Date(birthDate).toLocaleDateString('ar-SA') : '',
        'الخدمات المستلمة': servicesText,
        'آخر خدمة': client.lastServiceDate ? new Date(client.lastServiceDate).toLocaleDateString('ar-SA') : '',
        'الحالة': client.status || '',
        'البريد الإلكتروني': client.email || '',
        'العنوان التفصيلي': client.detailedAddress || '',
        'تاريخ الإنشاء': client.createdAt ? new Date(client.createdAt).toLocaleDateString('ar-SA') : '',
        'تاريخ التحديث': client.updatedAt ? new Date(client.updatedAt).toLocaleDateString('ar-SA') : ''
      };
    });

    if (format === 'csv') {
      const { Parser } = require('json2csv');
      
      // Define CSV fields explicitly to handle empty data
      const csvFields = [
        'الرقم التسلسلي',
        'الرقم القومي',
        'الاسم', 
        'رقم الهاتف',
        'القرية',
        'تاريخ الميلاد',
        'الخدمات المستلمة',
        'آخر خدمة',
        'الحالة',
        'البريد الإلكتروني',
        'العنوان التفصيلي',
        'تاريخ الإنشاء',
        'تاريخ التحديث'
      ];
      
      const parser = new Parser({ fields: csvFields });
      
      // Handle empty data case
      if (transformedClients.length === 0) {
        logger.info('No clients found matching the filter criteria');
        // Create empty CSV with headers only
        const csv = parser.parse([]);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=clients-empty.csv');
        res.send(csv);
        return;
      }
      
      const csv = parser.parse(transformedClients);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=clients-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } else if (format === 'excel') {
      const XLSX = require('xlsx');
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Handle empty data case
      if (transformedClients.length === 0) {
        logger.info('No clients found matching the filter criteria for Excel export');
        // Create empty worksheet with headers only
        const emptyData = [{
          'الرقم التسلسلي': '',
          'الرقم القومي': '',
          'الاسم': '', 
          'رقم الهاتف': '',
          'القرية': '',
          'تاريخ الميلاد': '',
          'الخدمات المستلمة': '',
          'آخر خدمة': '',
          'الحالة': '',
          'البريد الإلكتروني': '',
          'العنوان التفصيلي': '',
          'تاريخ الإنشاء': '',
          'تاريخ التحديث': ''
        }];
        const worksheet = XLSX.utils.json_to_sheet(emptyData);
        // Remove the empty row, keep only headers
        worksheet['!ref'] = 'A1:L1';
      } else {
        // Convert data to worksheet
        var worksheet = XLSX.utils.json_to_sheet(transformedClients);
      }
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'المربيين');
      
      // Generate Excel file buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=clients-${new Date().toISOString().split('T')[0]}.xlsx`);
      res.send(excelBuffer);
    } else {
      res.json({
        success: true,
        data: { clients }
      });
    }
  })
);

/**
 * @swagger
 * /api/clients/template:
 *   get:
 *     summary: Download import template for clients
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Template downloaded successfully
 */
router.get('/template',
  asyncHandler(async (req, res) => {
    // Add default user for template
    req.user = { _id: 'system', role: 'super_admin', name: 'System Template' };
    
    // Call handleTemplate with proper context
    await handleTemplate(req, res, [
    {
      'Name': 'اسم العميل',
      'National ID': 'رقم الهوية',
      'Phone': 'رقم الهاتف',
      'Email': 'البريد الإلكتروني',
      'Village': 'القرية',
      'Detailed Address': 'العنوان التفصيلي',
      'Status': 'الحالة',
      'Birth Date': 'تاريخ الميلاد'
    }
  ], 'clients-template');
  })
);

/**
 * @swagger
 * /api/clients/import:
 *   post:
 *     summary: Import clients from CSV
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Import completed
 */
router.post('/import',
  auth,
  asyncHandler(async (req, res) => {
    // Use authenticated user for import
    // req.user is already set by auth middleware
    
    // Call handleImport with proper context
    await handleImport(req, res, Client, Client, async (row, userId, ClientModel, errors) => {
    // Check if client with same national ID already exists
    const existingClient = await ClientModel.findOne({ nationalId: row['National ID'] || row['رقم الهوية'] });
    if (existingClient) {
      errors.push({
        row: row.rowNumber,
        field: 'National ID',
        message: 'Client with this national ID already exists'
      });
      return null;
    }

    // Parse birth date
    let birthDate = null;
    if (row['Birth Date'] || row['تاريخ الميلاد']) {
      const dateStr = row['Birth Date'] || row['تاريخ الميلاد'];
      birthDate = new Date(dateStr);
      if (isNaN(birthDate.getTime())) {
        birthDate = null;
      }
    }

    // Create new client
    const client = new ClientModel({
      name: row['Name'] || row['اسم العميل'],
      nationalId: row['National ID'] || row['رقم الهوية'],
      phone: row['Phone'] || row['رقم الهاتف'] || '',
      email: row['Email'] || row['البريد الإلكتروني'] || '',
      village: row['Village'] || row['القرية'] || '',
      status: row['Status'] || row['الحالة'] || 'نشط',
      birthDate: birthDate,
      animals: [],
      availableServices: [],
      createdBy: userId
    });

    await client.save();
    return client;
  });
  })
);

/**
 * @swagger
 * /api/clients/{id}:
 *   get:
 *     summary: Get client by ID
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     responses:
 *       200:
 *         description: Client retrieved successfully
 *       404:
 *         description: Client not found
 */
router.get('/:id',
  auth,
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('updatedBy', 'name email role')
      .populate('holdingCode', 'code village description isActive')
      .populate('village', 'nameArabic nameEnglish serialNumber sector');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
        error: 'CLIENT_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: { client }
    });
  })
);

/**
 * @swagger
 * /api/clients/{id}/visits:
 *   get:
 *     summary: Get all visits for a specific client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     responses:
 *       200:
 *         description: Client visits retrieved successfully
 *       404:
 *         description: Client not found
 */
router.get('/:id/visits',
  auth,
  asyncHandler(async (req, res) => {
    const clientId = req.params.id;
    
    // Verify client exists
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
        error: 'CLIENT_NOT_FOUND'
      });
    }

    try {
      // Get all visits for this client from different collections
      const [mobileClinic, vaccination, parasiteControl, equineHealth, laboratory] = await Promise.all([
        // Mobile Clinic visits
        require('../models/MobileClinic').find({ client: clientId })
          .populate('client', 'name nationalId phone village')
          .populate('holdingCode', 'code village description isActive')
          .sort({ serialNo: 1 }), // Sort by serialNo ascending
        
        // Vaccination visits
        require('../models/Vaccination').find({ client: clientId })
          .populate('client', 'name nationalId phone village')
          .populate('holdingCode', 'code village description isActive')
          .sort({ serialNo: 1 }), // Sort by serialNo ascending
        
        // Parasite Control visits
        require('../models/ParasiteControl').find({ client: clientId })
          .populate('client', 'name nationalId phone village')
          .populate('holdingCode', 'code village description isActive')
          .sort({ serialNo: 1 }), // Sort by serialNo ascending
        
        // Equine Health visits - uses embedded client object with nationalId, no holdingCode field
        require('../models/EquineHealth').find({ 'client.nationalId': client.nationalId })
          .sort({ serialNo: 1 }), // Sort by serialNo ascending
        
        // Laboratory visits - no holdingCode field in Laboratory model
        require('../models/Laboratory').find({ client: clientId })
          .populate('client', 'name nationalId phone village')
          .sort({ date: -1 })
      ]);

      res.json({
        success: true,
        data: {
          mobileClinic: mobileClinic || [],
          vaccination: vaccination || [],
          parasiteControl: parasiteControl || [],
          equineHealth: equineHealth || [],
          laboratory: laboratory || []
        }
      });
    } catch (error) {
      logger.error('Error fetching client visits:', { error: error });
      res.status(500).json({
        success: false,
        message: 'Error fetching client visits',
        error: 'INTERNAL_SERVER_ERROR'
      });
    }
  })
);

/**
 * @swagger
 * /api/clients:
 *   post:
 *     summary: Create new client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Client'
 *     responses:
 *       201:
 *         description: Client created successfully
 *       400:
 *         description: Validation error or client already exists
 */
router.post('/',
  auth,
  validate(schemas.clientCreate),
  asyncHandler(async (req, res) => {
    // Check if client with same national ID already exists
    const existingClient = await Client.findOne({ nationalId: req.body.nationalId });
    if (existingClient) {
      return res.status(400).json({
        success: false,
        message: 'Client with this national ID already exists',
        error: 'CLIENT_EXISTS'
      });
    }

    const client = new Client({
      ...req.body,
      createdBy: req.user._id
    });

    await client.save();

    res.status(201).json({
      success: true,
      message: 'Client created successfully',
      data: { client }
    });
  })
);

/**
 * @swagger
 * /api/clients/{id}:
 *   put:
 *     summary: Update client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Client'
 *     responses:
 *       200:
 *         description: Client updated successfully
 *       404:
 *         description: Client not found
 */
router.put('/:id',
  auth,
  validate(schemas.clientCreate),
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
        error: 'CLIENT_NOT_FOUND'
      });
    }

    // Check if national ID is being changed and if it already exists
    if (req.body.nationalId !== client.nationalId) {
      const existingClient = await Client.findOne({ 
        nationalId: req.body.nationalId,
        _id: { $ne: req.params.id }
      });
      if (existingClient) {
        return res.status(400).json({
          success: false,
          message: 'National ID already exists',
          error: 'NATIONAL_ID_EXISTS'
        });
      }
    }

    // Update client
    Object.assign(client, req.body);
    client.updatedBy = req.user._id;
    await client.save();

    res.json({
      success: true,
      message: 'Client updated successfully',
      data: { client }
    });
  })
);

/**
 * @swagger
 * /api/clients/bulk-delete:
 *   delete:
 *     summary: Delete multiple clients
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of client IDs to delete
 *     responses:
 *       200:
 *         description: Clients deleted successfully
 *       400:
 *         description: Invalid request
 */
router.delete('/bulk-delete',
  auth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'IDs array is required and must not be empty',
        error: 'INVALID_REQUEST'
      });
    }

    // Validate ObjectIds
    const mongoose = require('mongoose');
    const invalidIds = ids.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ObjectId format',
        error: 'INVALID_OBJECT_ID',
        invalidIds
      });
    }

    try {
      // Check if records exist before deletion
      const existingRecords = await Client.find({ _id: { $in: ids } });
      const existingIds = existingRecords.map(record => record._id.toString());
      const notFoundIds = ids.filter(id => !existingIds.includes(id));
      
      // If no records found at all, return error
      if (existingIds.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No clients found to delete',
          error: 'RESOURCE_NOT_FOUND',
          notFoundIds: ids,
          foundCount: 0,
          requestedCount: ids.length
        });
      }

      const result = await Client.deleteMany({ _id: { $in: existingIds } });
      
      // Prepare response with details about what was deleted and what wasn't found
      const response = {
        success: true,
        message: `${result.deletedCount} clients deleted successfully`,
        deletedCount: result.deletedCount,
        requestedCount: ids.length,
        foundCount: existingIds.length
      };

      // Add warning if some records were not found
      if (notFoundIds.length > 0) {
        response.warning = `${notFoundIds.length} clients were not found and could not be deleted`;
        response.notFoundIds = notFoundIds;
        response.notFoundCount = notFoundIds.length;
      }

      res.json(response);
    } catch (error) {
      logger.error('Bulk delete error:', { error: error });
      return res.status(500).json({
        success: false,
        message: 'Error deleting clients',
        error: 'DELETE_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/clients/delete-all:
 *   delete:
 *     summary: Delete all clients
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All clients deleted successfully
 */
router.delete('/delete-all',
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const result = await Client.deleteMany({});
    
    res.json({
      success: true,
      message: `All clients deleted successfully`,
      deletedCount: result.deletedCount
    });
  })
);

/**
 * @swagger
 * /api/clients/{id}:
 *   delete:
 *     summary: Delete client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     responses:
 *       200:
 *         description: Client deleted successfully
 *       404:
 *         description: Client not found
 */
router.delete('/:id',
  auth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
        error: 'CLIENT_NOT_FOUND'
      });
    }

    await Client.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });
  })
);

/**
 * @swagger
 * /api/clients/{id}/animals:
 *   post:
 *     summary: Add animal to client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Animal'
 *     responses:
 *       200:
 *         description: Animal added successfully
 *       404:
 *         description: Client not found
 */
router.post('/:id/animals',
  auth,
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
        error: 'CLIENT_NOT_FOUND'
      });
    }

    await client.addAnimal(req.body);

    res.json({
      success: true,
      message: 'Animal added successfully',
      data: { client }
    });
  })
);

/**
 * @swagger
 * /api/clients/{id}/animals/{animalIndex}:
 *   put:
 *     summary: Update client animal
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *       - in: path
 *         name: animalIndex
 *         required: true
 *         schema:
 *           type: integer
 *         description: Animal index in array
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Animal'
 *     responses:
 *       200:
 *         description: Animal updated successfully
 *       404:
 *         description: Client or animal not found
 */
router.put('/:id/animals/:animalIndex',
  auth,
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
        error: 'CLIENT_NOT_FOUND'
      });
    }

    try {
      await client.updateAnimal(parseInt(req.params.animalIndex), req.body);
      
      res.json({
        success: true,
        message: 'Animal updated successfully',
        data: { client }
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message,
        error: 'ANIMAL_NOT_FOUND'
      });
    }
  })
);

/**
 * @swagger
 * /api/clients/{id}/animals/{animalIndex}:
 *   delete:
 *     summary: Remove animal from client
 *     tags: [Clients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *       - in: path
 *         name: animalIndex
 *         required: true
 *         schema:
 *           type: integer
 *         description: Animal index in array
 *     responses:
 *       200:
 *         description: Animal removed successfully
 *       404:
 *         description: Client or animal not found
 */
router.delete('/:id/animals/:animalIndex',
  auth,
  asyncHandler(async (req, res) => {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found',
        error: 'CLIENT_NOT_FOUND'
      });
    }

    try {
      await client.removeAnimal(parseInt(req.params.animalIndex));
      
      res.json({
        success: true,
        message: 'Animal removed successfully',
        data: { client }
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message,
        error: 'ANIMAL_NOT_FOUND'
      });
    }
  })
);

module.exports = router;
