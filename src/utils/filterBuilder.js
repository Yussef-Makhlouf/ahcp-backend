const { normalizeEquineInterventionCategoryList } = require('./interventionCategories');

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

  // بناء فلتر البحث النصي
  buildTextSearchFilter(searchTerm, fields = []) {
    if (!searchTerm || !searchTerm.trim()) return null;
    
    const searchRegex = new RegExp(searchTerm.trim(), 'i');
    const searchConditions = fields.map(field => ({
      [field]: searchRegex
    }));
    
    return searchConditions.length > 0 ? { $or: searchConditions } : null;
  }

  // بناء فلتر مكافحة الطفيليات
  buildParasiteControlFilter(query) {
    const filter = {};
    
    // فلتر التاريخ
    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);
    if (dateFilter) filter.date = dateFilter;
    
    // فلتر المشرف
    if (query.supervisor) {
      filter.supervisor = new RegExp(query.supervisor, 'i');
    }
    
    // فلتر البحث العام
    if (query.search) {
      const searchFilter = this.buildTextSearchFilter(query.search, [
        'supervisor', 'clientName', 'clientId', 'clientVillage'
      ]);
      if (searchFilter) Object.assign(filter, searchFilter);
    }
    
    // فلاتر المبيدات
    const insecticideMethodFilter = this.buildMultiValueFilter(query.insecticideMethod);
    if (insecticideMethodFilter) filter['insecticide.method'] = insecticideMethodFilter;
    
    const insecticideCategoryFilter = this.buildMultiValueFilter(query.insecticideCategory);
    if (insecticideCategoryFilter) filter['insecticide.category'] = insecticideCategoryFilter;
    
    const insecticideStatusFilter = this.buildMultiValueFilter(query.insecticideStatus);
    if (insecticideStatusFilter) filter['insecticide.status'] = insecticideStatusFilter;
    
    const insecticideTypeFilter = this.buildMultiValueFilter(query.insecticideType);
    if (insecticideTypeFilter) filter['insecticide.type'] = insecticideTypeFilter;
    
    // فلتر الحالة الصحية للقطيع
    const herdHealthFilter = this.buildMultiValueFilter(query.herdHealthStatus);
    if (herdHealthFilter) filter.herdHealthStatus = herdHealthFilter;
    
    // فلتر الامتثال للتعليمات
    const complianceFilter = this.buildMultiValueFilter(query.complyingToInstructions);
    if (complianceFilter) filter.complyingToInstructions = complianceFilter;
    
    // فلتر حالة الطلب
    const requestSituationFilter = this.buildMultiValueFilter(query.parasiteControlStatus || query['request.situation']);
    if (requestSituationFilter) filter['request.situation'] = requestSituationFilter;
    
    return filter;
  }

  // بناء فلتر التطعيمات
  buildVaccinationFilter(query) {
    const filter = {};
    
    // فلتر التاريخ
    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);
    if (dateFilter) filter.date = dateFilter;
    
    // فلتر المشرف
    if (query.supervisor) {
      filter.supervisor = new RegExp(query.supervisor, 'i');
    }
    
    // فلتر البحث العام
    if (query.search) {
      const searchFilter = this.buildTextSearchFilter(query.search, [
        'supervisor', 'clientName', 'clientId', 'clientVillage'
      ]);
      if (searchFilter) Object.assign(filter, searchFilter);
    }
    
    // فلاتر اللقاح
    const vaccineTypeFilter = this.buildMultiValueFilter(query.vaccineType || query['vaccine.type']);
    if (vaccineTypeFilter) filter.vaccineType = vaccineTypeFilter; // استخدام vaccineType بدلاً من vaccine.type
    
    const vaccineCategoryFilter = this.buildMultiValueFilter(query.vaccineCategory || query['vaccine.category']);
    if (vaccineCategoryFilter) filter.vaccineCategory = vaccineCategoryFilter; // استخدام vaccineCategory بدلاً من vaccine.category
    
    // فلتر الحالة الصحية للقطيع
    const herdHealthFilter = this.buildMultiValueFilter(query.herdHealthStatus);
    if (herdHealthFilter) filter.herdHealthStatus = herdHealthFilter;
    
    // فلتر سهولة التعامل مع الحيوانات
    const animalsHandlingFilter = this.buildMultiValueFilter(query.animalsHandling);
    if (animalsHandlingFilter) filter.animalsHandling = animalsHandlingFilter;
    
    // فلتر توفر العمالة
    const laboursFilter = this.buildMultiValueFilter(query.labours);
    if (laboursFilter) filter.labours = laboursFilter;
    
    // فلتر إمكانية الوصول للموقع
    const reachableLocationFilter = this.buildMultiValueFilter(query.reachableLocation);
    if (reachableLocationFilter) filter.reachableLocation = reachableLocationFilter;
    
    // فلتر حالة الطلب
    const requestSituationFilter = this.buildMultiValueFilter(query.vaccinationStatus || query['request.situation']);
    if (requestSituationFilter) filter['request.situation'] = requestSituationFilter;
    
    return filter;
  }

  // بناء فلتر المختبرات
  buildLaboratoryFilter(query) {
    const filter = {};
    
    // فلتر التاريخ
    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);
    if (dateFilter) filter.date = dateFilter;
    
    // فلتر الجامع
    if (query.collector) {
      filter.collector = new RegExp(query.collector, 'i');
    }
    
    // فلتر البحث العام
    if (query.search) {
      const searchFilter = this.buildTextSearchFilter(query.search, [
        'collector', 'clientName', 'clientId', 'sampleId'
      ]);
      if (searchFilter) Object.assign(filter, searchFilter);
    }
    
    // فلتر نوع العينة
    const sampleTypeFilter = this.buildMultiValueFilter(query.sampleType);
    if (sampleTypeFilter) filter.sampleType = sampleTypeFilter;
    
    // فلتر نتيجة الفحص
    const testResultFilter = this.buildMultiValueFilter(query.testResult);
    if (testResultFilter) filter['testResults.status'] = testResultFilter;
    
    // فلتر حالة الفحص
    const testStatusFilter = this.buildMultiValueFilter(query.testStatus);
    if (testStatusFilter) filter.testStatus = testStatusFilter;
    
    // فلتر نوع الفحص
    const testTypeFilter = this.buildMultiValueFilter(query.testType);
    if (testTypeFilter) filter['testResults.testType'] = testTypeFilter;
    
    // فلتر الأولوية
    const priorityFilter = this.buildMultiValueFilter(query.priority);
    if (priorityFilter) filter.priority = priorityFilter;
    
    return filter;
  }

  // بناء فلتر العيادات المتنقلة
  buildMobileClinicFilter(query) {
    const filter = {};
    
    // فلتر التاريخ
    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);
    if (dateFilter) filter.date = dateFilter;
    
    // فلتر المشرف
    if (query.supervisor) {
      filter.supervisor = new RegExp(query.supervisor, 'i');
    }
    
    // فلتر البحث العام
    if (query.search) {
      const searchFilter = this.buildTextSearchFilter(query.search, [
        'supervisor', 'clientName', 'clientId', 'clientVillage', 'diagnosis', 'treatment'
      ]);
      if (searchFilter) Object.assign(filter, searchFilter);
    }
    
    // فلتر التشخيص
    const diagnosisFilter = this.buildMultiValueFilter(query.diagnosis);
    if (diagnosisFilter) filter.diagnosis = diagnosisFilter;
    
    // فلتر فئة التدخل
    const interventionCategoryFilter = this.buildMultiValueFilter(query.interventionCategory);
    if (interventionCategoryFilter) {
      const categoryCondition = {
        $or: [
          { interventionCategory: interventionCategoryFilter },
          { interventionCategories: interventionCategoryFilter }
        ]
      };
      if (filter.$and) {
        filter.$and.push(categoryCondition);
      } else {
        filter.$and = [categoryCondition];
      }
    }
    
    // فلتر يتطلب متابعة
    if (query.followUpRequired !== undefined) {
      filter.followUpRequired = query.followUpRequired === 'true';
    }
    
    // فلتر حالة الطلب
    const requestSituationFilter = this.buildMultiValueFilter(query.mobileClinicStatus || query['request.situation']);
    if (requestSituationFilter) filter['request.situation'] = requestSituationFilter;
    
    return filter;
  }

  // بناء فلتر صحة الخيول
  buildEquineHealthFilter(query) {
    const filter = {};

    const dateFilter = this.buildDateFilter(query.startDate, query.endDate);
    if (dateFilter) filter.date = dateFilter;

    const interventionFilter = this.buildMultiValueFilter(query.interventionCategory);
    if (interventionFilter) {
      console.log('🔍 Original intervention filter:', interventionFilter);
      
      if (interventionFilter.$in) {
        const normalizedIn = normalizeEquineInterventionCategoryList(interventionFilter.$in);
        console.log('🔄 Normalized $in values:', normalizedIn);
        if (normalizedIn.length) {
          interventionFilter.$in = normalizedIn;
        } else {
          delete interventionFilter.$in;
        }
      }

      if (interventionFilter.$nin) {
        const normalizedNin = normalizeEquineInterventionCategoryList(interventionFilter.$nin);
        console.log('🔄 Normalized $nin values:', normalizedNin);
        if (normalizedNin.length) {
          interventionFilter.$nin = normalizedNin;
        } else {
          delete interventionFilter.$nin;
        }
      }

      if (Object.keys(interventionFilter).length > 0) {
        filter.interventionCategory = interventionFilter;
        console.log('✅ Final intervention filter applied:', interventionFilter);
      }
    }

    const requestSituationFilter = this.buildMultiValueFilter(query['request.situation']);
    if (requestSituationFilter) filter['request.situation'] = requestSituationFilter;

    if (query.supervisor) {
      filter.supervisor = new RegExp(query.supervisor, 'i');
    }

    if (query.search) {
      const searchFilter = this.buildTextSearchFilter(query.search, [
        'serialNo',
        'supervisor',
        'vehicleNo',
        'diagnosis',
        'client.name',
        'client.nationalId',
        'client.phone'
      ]);
      if (searchFilter) Object.assign(filter, searchFilter);
    }

    console.log('🎯 Final EquineHealth filter:', JSON.stringify(filter, null, 2));
    return filter;
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
    const sortBy = query.sortBy || 'date';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    
    return { [sortBy]: sortOrder };
  }
}

module.exports = new FilterBuilder();
