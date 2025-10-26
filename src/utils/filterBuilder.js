class FilterBuilder {
  constructor() {
    this.DEFAULT_LIMIT = 30;
    this.MAX_LIMIT = 1000;
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
    
    const values = value.split(',').map(v => v.trim()).filter(v => v);
    if (values.length === 0) return null;
    
    const included = values.filter(v => !v.startsWith('!'));
    const excluded = values.filter(v => v.startsWith('!')).map(v => v.substring(1));
    
    const filter = {};
    if (included.length > 0) {
      filter.$in = included;
    }
    if (excluded.length > 0) {
      filter.$nin = excluded;
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
    if (vaccineTypeFilter) filter['vaccine.type'] = vaccineTypeFilter;
    
    const vaccineCategoryFilter = this.buildMultiValueFilter(query.vaccineCategory || query['vaccine.category']);
    if (vaccineCategoryFilter) filter['vaccine.category'] = vaccineCategoryFilter;
    
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
    if (dateFilter) filter.collectionDate = dateFilter;
    
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
    if (interventionCategoryFilter) filter.interventionCategory = interventionCategoryFilter;
    
    // فلتر يتطلب متابعة
    if (query.followUpRequired !== undefined) {
      filter.followUpRequired = query.followUpRequired === 'true';
    }
    
    // فلتر حالة الطلب
    const requestSituationFilter = this.buildMultiValueFilter(query.mobileClinicStatus || query['request.situation']);
    if (requestSituationFilter) filter['request.situation'] = requestSituationFilter;
    
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
