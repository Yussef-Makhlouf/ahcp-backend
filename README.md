# AHCP Backend - نظام إدارة الصحة الحيوانية

Backend API متكامل لنظام إدارة الصحة الحيوانية (Animal Health Care Program) مبني بـ Node.js و Express.js و MongoDB.

## 🚀 المميزات

- **API RESTful كامل** مع جميع عمليات CRUD
- **نظام مصادقة وتفويض متقدم** باستخدام JWT
- **قاعدة بيانات MongoDB** مع Mongoose ODM
- **التحقق من صحة البيانات** باستخدام Joi
- **رفع وإدارة الملفات** مع معالجة الصور
- **تصدير واستيراد البيانات** (CSV, JSON)
- **نظام تقارير وإحصائيات شامل**
- **توثيق API تلقائي** باستخدام Swagger
- **أمان متقدم** مع Rate Limiting و Helmet
- **معالجة أخطاء شاملة**
- **دعم كامل للغة العربية**

## 📋 المتطلبات

- Node.js (الإصدار 18 أو أحدث)
- MongoDB (الإصدار 5 أو أحدث)
- npm أو yarn

## 🛠️ التثبيت والإعداد

### 1. استنساخ المشروع
```bash
git clone <repository-url>
cd ahcp-backend
```

### 2. تثبيت الحزم
```bash
npm install
```

### 3. إعداد متغيرات البيئة
انسخ ملف `.env.example` إلى `.env` وقم بتحديث القيم:

```bash
cp .env.example .env
```

قم بتحديث الملف `.env`:
```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/ahcp_database

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload Configuration
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads
```

### 4. تشغيل قاعدة البيانات
تأكد من تشغيل MongoDB:
```bash
# على Windows
net start MongoDB

# على macOS/Linux
sudo systemctl start mongod
```

### 5. تشغيل الخادم
```bash
# بيئة التطوير
npm run dev

# بيئة الإنتاج
npm start
```

## 📚 توثيق API

بعد تشغيل الخادم، يمكنك الوصول إلى توثيق API على:
```
https://ulaahcprp.cloud/api-docs
```

## 🏗️ هيكل المشروع

```
ahcp-backend/
├── src/
│   ├── models/           # نماذج قاعدة البيانات
│   │   ├── User.js
│   │   ├── Client.js
│   │   ├── ParasiteControl.js
│   │   ├── Vaccination.js
│   │   ├── MobileClinic.js
│   │   ├── EquineHealth.js
│   │   └── Laboratory.js
│   ├── routes/           # مسارات API
│   │   ├── auth.js
│   │   ├── clients.js
│   │   ├── parasiteControl.js
│   │   ├── vaccination.js
│   │   ├── mobileClinics.js
│   │   ├── equineHealth.js
│   │   ├── laboratories.js
│   │   ├── reports.js
│   │   └── upload.js
│   ├── middleware/       # Middleware
│   │   ├── auth.js
│   │   ├── validation.js
│   │   ├── errorHandler.js
│   │   └── notFound.js
│   └── server.js         # نقطة دخول التطبيق
├── uploads/              # مجلد الملفات المرفوعة
├── .env.example          # مثال على متغيرات البيئة
├── package.json
└── README.md
```

## 🔐 نظام المصادقة

### الأدوار المتاحة:
- **super_admin**: مدير عام - صلاحيات كاملة
- **section_supervisor**: مشرف قسم - إدارة القسم
- **field_worker**: عامل ميداني - إدخال البيانات

### endpoints المصادقة:
```
POST /api/auth/register     # تسجيل مستخدم جديد
POST /api/auth/login        # تسجيل الدخول
GET  /api/auth/me          # الحصول على بيانات المستخدم الحالي
PUT  /api/auth/update-profile  # تحديث الملف الشخصي
PUT  /api/auth/change-password # تغيير كلمة المرور
```

## 📊 الوحدات الرئيسية

### 1. إدارة العملاء والمربيين
```
GET    /api/clients         # قائمة العملاء
POST   /api/clients         # إضافة عميل جديد
GET    /api/clients/:id     # تفاصيل عميل
PUT    /api/clients/:id     # تحديث بيانات عميل
DELETE /api/clients/:id     # حذف عميل
```

### 2. مكافحة الطفيليات
```
GET    /api/parasite-control         # قائمة السجلات
POST   /api/parasite-control         # إضافة سجل جديد
GET    /api/parasite-control/:id     # تفاصيل سجل
PUT    /api/parasite-control/:id     # تحديث سجل
DELETE /api/parasite-control/:id     # حذف سجل
GET    /api/parasite-control/statistics  # إحصائيات
```

### 3. التحصينات
```
GET    /api/vaccination         # قائمة سجلات التحصين
POST   /api/vaccination         # إضافة سجل تحصين
GET    /api/vaccination/:id     # تفاصيل سجل التحصين
PUT    /api/vaccination/:id     # تحديث سجل التحصين
DELETE /api/vaccination/:id     # حذف سجل التحصين
```

### 4. العيادات المتنقلة
```
GET    /api/mobile-clinics         # قائمة سجلات العيادات
POST   /api/mobile-clinics         # إضافة سجل عيادة
GET    /api/mobile-clinics/:id     # تفاصيل سجل العيادة
PUT    /api/mobile-clinics/:id     # تحديث سجل العيادة
DELETE /api/mobile-clinics/:id     # حذف سجل العيادة
```

### 5. صحة الخيول
```
GET    /api/equine-health         # قائمة سجلات صحة الخيول
POST   /api/equine-health         # إضافة سجل جديد
GET    /api/equine-health/:id     # تفاصيل السجل
PUT    /api/equine-health/:id     # تحديث السجل
DELETE /api/equine-health/:id     # حذف السجل
```

### 6. المختبرات
```
GET    /api/laboratories         # قائمة العينات والفحوصات
POST   /api/laboratories         # إضافة عينة جديدة
GET    /api/laboratories/:id     # تفاصيل العينة
PUT    /api/laboratories/:id     # تحديث بيانات العينة
PUT    /api/laboratories/:id/results  # تحديث نتائج الفحص
DELETE /api/laboratories/:id     # حذف سجل العينة
```

### 7. التقارير والإحصائيات
```
GET /api/reports/dashboard    # إحصائيات لوحة التحكم
GET /api/reports/monthly      # تقرير شهري
GET /api/reports/export       # تصدير البيانات
```

### 8. رفع الملفات
```
POST /api/upload/:type        # رفع ملفات حسب النوع
POST /api/upload/avatar       # رفع صورة المستخدم
POST /api/upload/import/csv   # استيراد بيانات من CSV
GET  /api/upload/files        # قائمة الملفات المرفوعة
DELETE /api/upload/files/:filename  # حذف ملف
```

## 🔒 الأمان

### الحماية المطبقة:
- **JWT Authentication**: مصادقة باستخدام JSON Web Tokens
- **Rate Limiting**: تحديد عدد الطلبات لكل IP
- **Helmet**: حماية HTTP headers
- **CORS**: التحكم في الوصول عبر المصادر
- **Input Validation**: التحقق من صحة البيانات المدخلة
- **Password Hashing**: تشفير كلمات المرور باستخدام bcrypt
- **File Upload Security**: فلترة أنواع الملفات وحجمها

## 📈 الإحصائيات والتقارير

### الإحصائيات المتاحة:
- إحصائيات العملاء والحيوانات
- معدلات العلاج والتحصين
- إحصائيات المختبرات ونتائج الفحوصات
- تقارير الأداء الشهرية والسنوية
- إحصائيات الأنشطة الحديثة

### تصدير البيانات:
- تصدير CSV لجميع الوحدات
- تصدير JSON للبيانات الكاملة
- تقارير مخصصة حسب التاريخ والفئة

## 🚨 معالجة الأخطاء

النظام يتضمن معالجة شاملة للأخطاء:
- أخطاء التحقق من صحة البيانات
- أخطاء قاعدة البيانات
- أخطاء المصادقة والتفويض
- أخطاء رفع الملفات
- أخطاء الشبكة والاتصال

## 🧪 الاختبار

```bash
# تشغيل الاختبارات
npm test

# تشغيل الاختبارات مع التغطية
npm run test:coverage
```

## 📦 النشر

### 1. إعداد بيئة الإنتاج
```bash
# تحديث متغيرات البيئة
NODE_ENV=production
MONGODB_URI=your-production-mongodb-uri
JWT_SECRET=your-production-jwt-secret
```

### 2. بناء التطبيق
```bash
npm run build
```

### 3. تشغيل الإنتاج
```bash
npm start
```

## 🤝 المساهمة

1. Fork المشروع
2. أنشئ branch للميزة الجديدة (`git checkout -b feature/AmazingFeature`)
3. Commit التغييرات (`git commit -m 'Add some AmazingFeature'`)
4. Push إلى البranch (`git push origin feature/AmazingFeature`)
5. افتح Pull Request

## 📄 الترخيص

هذا المشروع مرخص تحت رخصة MIT - انظر ملف [LICENSE](LICENSE) للتفاصيل.

## 📞 الدعم

للدعم والاستفسارات:
- البريد الإلكتروني: support@ahcp.com
- التوثيق: https://ulaahcprp.cloud/api-docs
- الصحة: http://https://ulaahcprp.cloud/health

## 🔄 التحديثات المستقبلية

- [ ] إضافة WebSocket للتحديثات المباشرة
- [ ] تطبيق GraphQL API
- [ ] إضافة نظام الإشعارات
- [ ] تحسين الأداء والتخزين المؤقت
- [ ] إضافة المزيد من التقارير المتقدمة
- [ ] دعم التطبيقات المحمولة
