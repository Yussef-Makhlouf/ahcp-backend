const { normalizeEquineInterventionCategoryList } = require('./interventionCategories');
const logger = require('./logger');
class FilterBuilder {
  constructor() {
    this.DEFAULT_LIMIT = 30;
    this.MAX_LIMIT = 1000;
  }

  // تحويل القيمة إلى جميع الصيغ المحتملة (slug, عنوان، lowercase...)
  normalizeFilterValues(values = []) {
    const normalizedSet = new Set();

    const toTitleCase = (str) => {
      return str
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    };

    values.forEach((value) => {
      if (value === undefined || value === null) return;

      const stringValue = value.toString().trim();
      if (!stringValue) return;

      // القيمة الأصلية
      normalizedSet.add(stringValue);

      // العنوان مع المحافظة على الشرطات إن وجدت
      if (stringValue.includes('-')) {
        const hyphenTitle = stringValue
          .split('-')
          .filter(Boolean)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join('-');
        if (hyphenTitle) {
          normalizedSet.add(hyphenTitle);
        }
      }

      if (stringValue.includes('_')) {
        const underscoreTitle = stringValue
          .split('_')
          .filter(Boolean)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join('_');
        if (underscoreTitle) {
          normalizedSet.add(underscoreTitle);
        }
      }

      // استبدال الشرطات والشرطات السفلية بمسافات
      const spaceSeparated = stringValue
        .replace(/[\-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (spaceSeparated && spaceSeparated !== stringValue) {
        normalizedSet.add(spaceSeparated);
      }

      if (spaceSeparated) {
        const titleCase = toTitleCase(spaceSeparated);
        if (titleCase) {
          normalizedSet.add(titleCase);
        }

        const lowerCase = spaceSeparated.toLowerCase();
        if (lowerCase) {
          normalizedSet.add(lowerCase);
        }
      }
    });

    return Array.from(normalizedSet).filter(Boolean);
  }

  // بناء فلتر النطاق الزمني المحسن
  buildDateFilter(startDate, endDate) {
    const dateFilter = {};
    
    if (startDate) {
      // التأكد من صحة التاريخ وتحويله
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0); // بداية اليوم
        dateFilter.$gte = start;
      }
    }
    
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999); // نهاية اليوم
        dateFilter.$lte = end;
      }
    }
    
    return Object.keys(dateFilter).length > 0 ? dateFilter : null;
  }

  // بناء فلتر القيم المتعددة مع دعم النفي
  buildMultiValueFilter(value) {
    if (!value) return null;

    let values = [];

    if (Array.isArray(value)) {
      values = value;
    } else if (typeof value === 'string') {
      values = value.split(',');
    } else {
      values = [value];
    }

    values = values
      .map(v => (v === undefined || v === null) ? '' : v.toString().trim())
      .filter(v => v);

    if (values.length === 0) return null;

    const included = values.filter(v => !v.startsWith('!'));
    const excluded = values.filter(v => v.startsWith('!')).map(v => v.substring(1));

    const filter = {};
    if (included.length > 0) {
      filter.$in = this.normalizeFilterValues(included);
    }
    if (excluded.length > 0) {
      filter.$nin = this.normalizeFilterValues(excluded);
    }

    return Object.keys(filter).length > 0 ? filter : null;
  }

  // بناء فلتر البحث النصي المحسن
  buildTextSearchFilter(searchTerm, fields = []) {
    if (!searchTerm || !searchTerm.trim()) return null;
    
    const trimmedSearch = searchTerm.trim();
    const searchRegex = new RegExp(trimmedSearch, 'i');
    
    // البحث في الحقول النصية العادية
    const searchConditions = fields.map(field => ({
      [field]: searchRegex
    }));
    
    // إضافة بحث رقمي للحقول الرقمية (serialNo, phone, nationalId)
    // إزالة جميع الأحرف غير الرقمية للبحث الدقيق
    const numericSearch = trimmedSearch.replace(/\D/g, '');
    if (numericSearch) {
      // البحث في الأرقام التسلسلية
      const serialNoAsNumber = parseInt(numericSearch);
      if (!isNaN(serialNoAsNumber)) {
        searchConditions.push({ serialNo: serialNoAsNumber });
      }
      
      // البحث في أرقام الهاتف والهوية
      const numericRegex = new RegExp(numericSearch, 'i');
      searchConditions.push(
        { 'client.phone': numericRegex },
        { 'client.nationalId': numericRegex },
        { clientPhone: numericRegex },
        { clientId: numericRegex },
        { nationalId: numericRegex },
        { phone: numericRegex }
      );
    }
    
    return searchConditions.length > 0 ? { $or: searchConditions } : null;
  }
  
  // دمج الفلاتر المتعددة بشكل ذكي باستخدام $and
  combineFilters(filters = []) {
    const validFilters = filters.filter(f => f && Object.keys(f).length > 0);
    
    if (validFilters.length === 0) return {};
    if (validFilters.length === 1) return validFilters[0];
    
    // دمج الفلاتر باستخدام $and لضمان تطبيق جميع الشروط
    return { $and: validFilters };
  }

  // بناء فلتر مكافحة الطفيليات
  buildParasiteControlFilter(query) {
    const filters = [];
    const basicFilter = {};
    
    // فلتر التاريخ
    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);
    if (dateFilter) basicFilter.date = dateFilter;
    
    // فلتر المشرف
    if (query.supervisor) {
      basicFilter.supervisor = new RegExp(query.supervisor, 'i');
    }
    
    // فلتر البحث العام - بحث شامل في جميع الحقول المهمة
    if (query.search) {
      const searchFilter = this.buildTextSearchFilter(query.search, [
        'supervisor', 
        'vehicleNo',
        'clientName', 
        'clientVillage',
        'client.name',
        'client.nationalId',
        'client.village',
        'notes',
        'remarks'
      ]);
      if (searchFilter) filters.push(searchFilter);
    }
    
    // فلاتر المبيدات - دعم كل من insecticide.method و insecticideMethod
    const insecticideMethodFilter = this.buildMultiValueFilter(query['insecticide.method'] || query.insecticideMethod);
    if (insecticideMethodFilter) basicFilter['insecticide.method'] = insecticideMethodFilter;
    
    const insecticideCategoryFilter = this.buildMultiValueFilter(query['insecticide.category'] || query.insecticideCategory);
    if (insecticideCategoryFilter) basicFilter['insecticide.category'] = insecticideCategoryFilter;
    
    const insecticideStatusFilter = this.buildMultiValueFilter(query['insecticide.status'] || query.insecticideStatus);
    if (insecticideStatusFilter) basicFilter['insecticide.status'] = insecticideStatusFilter;
    
    const insecticideTypeFilter = this.buildMultiValueFilter(query['insecticide.type'] || query.insecticideType);
    if (insecticideTypeFilter) basicFilter['insecticide.type'] = insecticideTypeFilter;
    
    // فلتر الحالة الصحية للقطيع
    const herdHealthFilter = this.buildMultiValueFilter(query.herdHealthStatus);
    if (herdHealthFilter) basicFilter.herdHealthStatus = herdHealthFilter;
    
    // فلتر الامتثال للتعليمات
    const complianceFilter = this.buildMultiValueFilter(query.complyingToInstructions);
    if (complianceFilter) basicFilter.complyingToInstructions = complianceFilter;
    
    // فلتر حالة الطلب
    const requestSituationFilter = this.buildMultiValueFilter(query.parasiteControlStatus || query['request.situation']);
    if (requestSituationFilter) basicFilter['request.situation'] = requestSituationFilter;
    
    // دمج الفلتر الأساسي مع فلاتر البحث
    if (Object.keys(basicFilter).length > 0) filters.push(basicFilter);
    
    // إرجاع الفلتر المدمج
    return filters.length > 0 ? this.combineFilters(filters) : {};
  }

  // بناء فلتر التطعيمات
  buildVaccinationFilter(query) {
    const filters = [];
    const basicFilter = {};
    
    // فلتر التاريخ
    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);
    if (dateFilter) basicFilter.date = dateFilter;
    
    // فلتر المشرف
    if (query.supervisor) {
      basicFilter.supervisor = new RegExp(query.supervisor, 'i');
    }
    
    // فلتر البحث العام - بحث شامل في جميع الحقول المهمة
    if (query.search) {
      const searchFilter = this.buildTextSearchFilter(query.search, [
        'supervisor',
        'vehicleNo',
        'clientName',
        'clientVillage',
        'client.name',
        'client.nationalId',
        'client.village',
        'vaccineType',
        'notes',
        'remarks'
      ]);
      if (searchFilter) filters.push(searchFilter);
    }
    
    // فلاتر اللقاح
    const vaccineTypeFilter = this.buildMultiValueFilter(query.vaccineType || query['vaccine.type']);
    if (vaccineTypeFilter) basicFilter.vaccineType = vaccineTypeFilter; // استخدام vaccineType بدلاً من vaccine.type
    
    const vaccineCategoryFilter = this.buildMultiValueFilter(query.vaccineCategory || query['vaccine.category']);
    if (vaccineCategoryFilter) basicFilter.vaccineCategory = vaccineCategoryFilter; // استخدام vaccineCategory بدلاً من vaccine.category
    
    // فلتر الحالة الصحية للقطيع
    const herdHealthFilter = this.buildMultiValueFilter(query.herdHealthStatus);
    if (herdHealthFilter) basicFilter.herdHealthStatus = herdHealthFilter;
    
    // فلتر سهولة التعامل مع الحيوانات
    const animalsHandlingFilter = this.buildMultiValueFilter(query.animalsHandling);
    if (animalsHandlingFilter) basicFilter.animalsHandling = animalsHandlingFilter;
    
    // فلتر توفر العمالة
    const laboursFilter = this.buildMultiValueFilter(query.labours);
    if (laboursFilter) basicFilter.labours = laboursFilter;
    
    // فلتر إمكانية الوصول للموقع
    const reachableLocationFilter = this.buildMultiValueFilter(query.reachableLocation);
    if (reachableLocationFilter) basicFilter.reachableLocation = reachableLocationFilter;
    
    // فلتر حالة الطلب
    const requestSituationFilter = this.buildMultiValueFilter(query.vaccinationStatus || query['request.situation']);
    if (requestSituationFilter) basicFilter['request.situation'] = requestSituationFilter;
    
    // دمج الفلتر الأساسي مع فلاتر البحث
    if (Object.keys(basicFilter).length > 0) filters.push(basicFilter);
    
    // إرجاع الفلتر المدمج
    return filters.length > 0 ? this.combineFilters(filters) : {};
  }

  // بناء فلتر المختبرات
  buildLaboratoryFilter(query) {
    const filters = [];
    const basicFilter = {};
    
    // فلتر التاريخ
    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);
    if (dateFilter) basicFilter.date = dateFilter;
    
    // فلتر الجامع
    if (query.collector) {
      basicFilter.collector = new RegExp(query.collector, 'i');
    }
    
    // فلتر البحث العام - بحث شامل في جميع الحقول المهمة
    if (query.search) {
      const searchFilter = this.buildTextSearchFilter(query.search, [
        'collector',
        'clientName',
        'client.name',
        'client.nationalId',
        'sampleCode',
        'sampleNumber',
        'farmLocation',
        'testType',
        'notes'
      ]);
      if (searchFilter) filters.push(searchFilter);
    }
    
    // فلتر نوع العينة
    const sampleTypeFilter = this.buildMultiValueFilter(query.sampleType);
    if (sampleTypeFilter) basicFilter.sampleType = sampleTypeFilter;
    
    // فلتر نوع الفحص
    const testTypeFilter = this.buildMultiValueFilter(query.testType);
    if (testTypeFilter) basicFilter.testType = testTypeFilter;
    
    // فلتر نتيجة الفحص
    const testResultFilter = this.buildMultiValueFilter(query.testResult);
    if (testResultFilter) basicFilter.testResult = testResultFilter;
    
    // دمج الفلتر الأساسي مع فلاتر البحث
    if (Object.keys(basicFilter).length > 0) filters.push(basicFilter);
    
    // إرجاع الفلتر المدمج
    return filters.length > 0 ? this.combineFilters(filters) : {};
  }

  // بناء فلتر العيادات المتنقلة
  buildMobileClinicFilter(query) {
    const filters = [];
    const basicFilter = {};
    
    // فلتر التاريخ
    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);
    if (dateFilter) basicFilter.date = dateFilter;
    
    // فلتر المشرف
    if (query.supervisor) {
      basicFilter.supervisor = new RegExp(query.supervisor, 'i');
    }
    
    // فلتر البحث العام - بحث شامل في جميع الحقول المهمة
    if (query.search) {
      const searchFilter = this.buildTextSearchFilter(query.search, [
        'supervisor',
        'vehicleNo',
        'clientName',
        'clientVillage',
        'client.name',
        'client.nationalId',
        'client.village',
        'diagnosis',
        'treatment',
        'interventionCategory',
        'notes',
        'remarks'
      ]);
      if (searchFilter) filters.push(searchFilter);
    }
    
    // فلتر التشخيص
    const diagnosisFilter = this.buildMultiValueFilter(query.diagnosis);
    if (diagnosisFilter) basicFilter.diagnosis = diagnosisFilter;
    
    // فلتر الأدوية
    const medicationsFilter = this.buildMultiValueFilter(query.medications);
    if (medicationsFilter) {
      // البحث في حقل medicationsUsed.name
      basicFilter['medicationsUsed.name'] = medicationsFilter;
    }
    
    // فلتر فئة التدخل
    const interventionCategoryFilter = this.buildMultiValueFilter(query.interventionCategory);
    if (interventionCategoryFilter) {
      filters.push({
        $or: [
          { interventionCategory: interventionCategoryFilter },
          { interventionCategories: interventionCategoryFilter }
        ]
      });
    }
    
    // فلتر يتطلب متابعة
    if (query.followUpRequired !== undefined) {
      basicFilter.followUpRequired = query.followUpRequired === 'true';
    }
    
    // فلتر حالة الطلب
    const requestSituationFilter = this.buildMultiValueFilter(query.mobileClinicStatus || query['request.situation']);
    if (requestSituationFilter) basicFilter['request.situation'] = requestSituationFilter;
    
    // دمج الفلتر الأساسي مع فلاتر البحث
    if (Object.keys(basicFilter).length > 0) filters.push(basicFilter);
    
    // إرجاع الفلتر المدمج
    return filters.length > 0 ? this.combineFilters(filters) : {};
  }

  // بناء فلتر صحة الخيول
  buildEquineHealthFilter(query) {
    const filters = [];
    const basicFilter = {};

    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);
    if (dateFilter) basicFilter.date = dateFilter;

    const interventionFilter = this.buildMultiValueFilter(query.interventionCategory);
    if (interventionFilter) {
      logger.info('Original intervention filter:', { data: interventionFilter });
      
      if (interventionFilter.$in) {
        const normalizedIn = normalizeEquineInterventionCategoryList(interventionFilter.$in);
        logger.info('Normalized in values:', { data: normalizedIn });
        if (normalizedIn.length) {
          interventionFilter.$in = normalizedIn;
        } else {
          delete interventionFilter.$in;
        }
      }

      if (interventionFilter.$nin) {
        const normalizedNin = normalizeEquineInterventionCategoryList(interventionFilter.$nin);
        logger.info('Normalized nin values:', { data: normalizedNin });
        if (normalizedNin.length) {
          interventionFilter.$nin = normalizedNin;
        } else {
          delete interventionFilter.$nin;
        }
      }

      if (Object.keys(interventionFilter).length > 0) {
        basicFilter.interventionCategory = interventionFilter;
        logger.info('Final intervention filter applied:', { data: interventionFilter });
      }
    }

    const requestSituationFilter = this.buildMultiValueFilter(query['request.situation']);
    if (requestSituationFilter) basicFilter['request.situation'] = requestSituationFilter;

    if (query.supervisor) {
      basicFilter.supervisor = new RegExp(query.supervisor, 'i');
    }

    // فلتر البحث العام - بحث شامل في جميع الحقول المهمة
    if (query.search) {
      const searchFilter = this.buildTextSearchFilter(query.search, [
        'supervisor',
        'vehicleNo',
        'diagnosis',
        'treatment',
        'client.name',
        'client.nationalId',
        'client.village',
        'horseDetails.name',
        'horseDetails.breed',
        'notes',
        'remarks'
      ]);
      if (searchFilter) filters.push(searchFilter);
    }

    // دمج الفلتر الأساسي مع فلاتر البحث
    if (Object.keys(basicFilter).length > 0) filters.push(basicFilter);
    
    const finalFilter = filters.length > 0 ? this.combineFilters(filters) : {};
    logger.info('Final EquineHealth filter:', { data: JSON.stringify(finalFilter, null, 2) });
    return finalFilter;
  }

  // بناء معاملات الصفحات
  buildPaginationParams(query) {
    const limit = Math.min(
      parseInt(query.limit) || this.DEFAULT_LIMIT, 
      this.MAX_LIMIT
    );
    const page = Math.max(parseInt(query.page) || 1, 1);
    const skip = (page - 1) * limit;
    
    return { limit, page, skip };
  }

  // بناء معاملات الترتيب
  buildSortParams(query) {
    // Default to serialNo ascending if no sort specified
    const sortBy = query.sortBy || 'serialNo';
    const sortOrder = query.sortOrder === 'asc' ? 1 : (query.sortOrder === 'desc' ? -1 : 1);
    
    // For serialNo, always use ascending order unless explicitly specified otherwise
    if (sortBy === 'serialNo' || sortBy === 'serialNumber') {
      return { serialNo: query.sortOrder === 'desc' ? -1 : 1 };
    }
    
    return { [sortBy]: sortOrder };
  }
}

module.exports = new FilterBuilder();
