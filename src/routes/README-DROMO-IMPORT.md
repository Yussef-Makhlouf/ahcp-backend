# نظام استيراد Dromo المستقل

## 📁 الملفات الجديدة

### `dromo-import.js`
ملف مستقل ومخصص لمعالجة استيراد البيانات من Dromo بشكل منفصل عن ملف `import-export.js` الأساسي.

## 🎯 المزايا

### 1. **فصل الاهتمامات (Separation of Concerns)**
- ملف مخصص فقط لـ Dromo
- كود أكثر تنظيماً وسهولة في الصيانة
- لا يتداخل مع وظائف الاستيراد الأخرى

### 2. **معالجة محسنة للبيانات**
- دوال مخصصة لمعالجة بيانات Dromo
- دعم أفضل لأسماء الحقول المختلفة
- معالجة ذكية للتواريخ والقيم

### 3. **أداء أفضل**
- معالجة مباشرة بدون middleware إضافي
- استجابة أسرع للـ webhooks
- ذاكرة أقل استهلاكاً

## 🔧 الوظائف الرئيسية

### `getFieldValue(row, fieldNames)`
- البحث عن قيم الحقول بأسماء متعددة
- دعم البحث غير الحساس للحالة
- دعم الأسماء العربية والإنجليزية

### `processUnifiedClient(row, userId)`
- معالجة بيانات العملاء
- إنشاء عميل جديد أو العثور على موجود
- التحقق من البيانات المطلوبة

### `processVaccinationRow(row, userId)`
- معالجة صفوف التطعيمات
- تحويل البيانات إلى نموذج قاعدة البيانات
- حفظ السجل في MongoDB

### `processLaboratoryRow(row, userId)`
- معالجة صفوف المختبرات
- معالجة عدد الأنواع المختلفة
- حفظ بيانات العينات

### `handleDromoImport(Model, processRowFunction)`
- معالج عام لجميع أنواع الجداول
- معالجة الأخطاء والاستثناءات
- إرجاع تقارير مفصلة

## 🛣️ المسارات (Routes)

### التطعيمات
```
POST /import-export/vaccination/import-dromo
```

### المختبرات
```
POST /import-export/laboratories/import-dromo
```

## 📊 تنسيق البيانات المتوقع

### التطعيمات
```json
{
  "serialNo": "1",
  "date": "1-Sep",
  "farmLocation": "ابو خريط",
  "team": "37974167",
  "supervisor": "M.Tahir",
  "vaccineType": "PPR",
  "vaccineCategory": "Vaccination",
  "sheepTotal": "67",
  "sheepFemale": "78",
  "cattleVaccinated": "90",
  "animalsHandling": "Easy handling",
  "herdHealth": "Healthy",
  "labours": "Available",
  "reachableLocation": "Easy",
  "requestSituation": "Closed"
}
```

### المختبرات
```json
{
  "sampleCode": "LAB-001",
  "date": "1-Sep",
  "collector": "Lab Tech",
  "sampleType": "Blood",
  "sheep": "10",
  "goats": "5",
  "positiveCases": "2",
  "negativeCases": "13"
}
```

## 🔄 تدفق العمل

1. **Dromo** يرسل البيانات إلى الـ webhook
2. **handleDromoImport** يستقبل البيانات
3. **processRowFunction** يعالج كل صف
4. **processUnifiedClient** ينشئ/يجد العميل
5. **Model.save()** يحفظ السجل في MongoDB
6. **Response** يرجع تقرير النتائج

## 🐛 معالجة الأخطاء

### مستوى الصف
- تسجيل الأخطاء لكل صف منفصل
- متابعة معالجة الصفوف الأخرى
- تقرير مفصل بالأخطاء

### مستوى النظام
- معالجة أخطاء قاعدة البيانات
- معالجة أخطاء الشبكة
- رسائل خطأ واضحة

## 📈 المراقبة والتتبع

### Console Logs
```javascript
console.log('🎯 Dromo import called for: Vaccination');
console.log('📊 Processing 19 rows for Vaccination');
console.log('✅ Saved vaccination record: VAC-123 (ObjectId)');
console.log('📊 Total records in Vaccination collection: 150');
```

### Response Format
```json
{
  "success": true,
  "message": "تم استيراد 19 سجل بنجاح",
  "insertedCount": 19,
  "totalRows": 19,
  "successRows": 19,
  "errorRows": 0,
  "batchId": "dromo_1697565600000_vaccination",
  "tableType": "vaccination",
  "source": "dromo-webhook"
}
```

## 🚀 التطوير المستقبلي

### المخطط إضافته
- [ ] `processParasiteControlRow`
- [ ] `processMobileClinicRow`
- [ ] `processEquineHealthRow`
- [ ] دعم الـ batch processing
- [ ] تحسين الأداء للملفات الكبيرة
- [ ] إضافة validation أكثر تفصيلاً

## 🔧 الصيانة

### إضافة نوع جدول جديد
1. إنشاء دالة `processNewTableRow`
2. إضافة route جديد
3. تحديث Frontend URLs
4. اختبار التكامل

### تحديث معالجة الحقول
1. تحديث `getFieldValue` fieldNames
2. إضافة mapping جديد في `processEnumValue`
3. اختبار مع بيانات حقيقية

## 📞 الدعم

للمساعدة أو الإبلاغ عن مشاكل، يرجى مراجعة:
- Console logs في Backend
- Network tab في المتصفح
- MongoDB logs للتحقق من حفظ البيانات
