# AHCP Backend - Production Deployment Guide

## 🚀 دليل النشر للإنتاج

### 1. متغيرات البيئة المطلوبة

أضف هذه المتغيرات في Vercel Environment Variables:

```bash
# Database
MONGODB_URI=mongodb+srv://yussefmakhloufiti_db_user:Yussef12345@cluster0.pgy8qei.mongodb.net/ahcp_database?retryWrites=true&w=majority&appName=Cluster0

# JWT Configuration
JWT_SECRET=ahcp_super_secret_key_2024_production_secure_123456789
JWT_EXPIRES_IN=7d

# Import/Export API Key (مهم جداً!)
IMPORT_EXPORT_API_KEY=ahcp_import_export_secure_key_2024_change_this

# CORS Configuration
CORS_ORIGIN=https://your-frontend-domain.com

# API Configuration
API_DOCS_ENABLED=false
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 2. استخدام Import/Export Endpoints

#### للاستيراد:
```bash
curl -X POST https://ahcp-backend.vercel.app/api/mobile-clinics/import \
  -H "X-API-Key: ahcp_import_export_secure_key_2024_change_this" \
  -F "file=@your-file.csv"
```

#### للتصدير:
```bash
curl -X GET "https://ahcp-backend.vercel.app/api/mobile-clinics/export?format=csv" \
  -H "X-API-Key: ahcp_import_export_secure_key_2024_change_this"
```

#### للقوالب:
```bash
curl -X GET "https://ahcp-backend.vercel.app/api/mobile-clinics/template" \
  -H "X-API-Key: ahcp_import_export_secure_key_2024_change_this"
```

### 3. Endpoints المتاحة

#### Mobile Clinics:
- `GET /api/mobile-clinics/export` - تصدير البيانات
- `GET /api/mobile-clinics/template` - تحميل القالب
- `POST /api/mobile-clinics/import` - استيراد البيانات

#### Clients:
- `GET /api/clients/export`
- `GET /api/clients/template`
- `POST /api/clients/import`

#### Vaccination:
- `GET /api/vaccination/export`
- `GET /api/vaccination/template`
- `POST /api/vaccination/import`

#### Parasite Control:
- `GET /api/parasite-control/export`
- `GET /api/parasite-control/template`
- `POST /api/parasite-control/import`

#### Equine Health:
- `GET /api/equine-health/export`
- `GET /api/equine-health/template`
- `POST /api/equine-health/import`

#### Laboratories:
- `GET /api/laboratories/export`
- `GET /api/laboratories/template`
- `POST /api/laboratories/import`

#### Reports:
- `GET /api/reports/export`

#### Upload:
- `POST /api/upload/import/csv`

### 4. الأمان

✅ **محمي بـ API Key:** جميع endpoints الاستيراد/التصدير محمية بـ API Key
✅ **مصادقة عادية:** باقي الـ endpoints محمية بالمصادقة العادية
✅ **Rate Limiting:** محدود بعدد الطلبات
✅ **CORS:** محمي ضد الطلبات غير المصرح بها

### 5. اختبار النظام

#### اختبار الصحة:
```bash
curl https://ahcp-backend.vercel.app/health
```

#### اختبار API Key:
```bash
# يجب أن يعمل
curl -H "X-API-Key: ahcp_import_export_secure_key_2024_change_this" \
  https://ahcp-backend.vercel.app/api/mobile-clinics/template

# يجب أن يفشل
curl https://ahcp-backend.vercel.app/api/mobile-clinics/template
```

### 6. ملاحظات مهمة

⚠️ **غير API Key:** غيّر `IMPORT_EXPORT_API_KEY` إلى مفتاح آمن عشوائي
⚠️ **CORS Origin:** غيّر `CORS_ORIGIN` إلى domain الفرونت إند الحقيقي
⚠️ **JWT Secret:** غيّر `JWT_SECRET` إلى مفتاح آمن عشوائي

### 7. استكشاف الأخطاء

#### خطأ "API_KEY_REQUIRED":
- تأكد من إضافة header `X-API-Key`
- تأكد من صحة قيمة الـ API Key

#### خطأ "MISSING_TOKEN":
- هذا للـ endpoints الأخرى التي تحتاج مصادقة عادية
- استخدم `/api/auth/login` للحصول على JWT token

### 8. الدعم

لأي مشاكل أو استفسارات، راجع:
- Health Check: `/health`
- API Documentation: `/api-docs` (إذا مفعل)
- Test Endpoint: `/test`

---
**تم إعداد النظام للإنتاج بنجاح! 🎉**
