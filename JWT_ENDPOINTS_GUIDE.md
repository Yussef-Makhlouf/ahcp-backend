# 🔐 دليل استخدام JWT-protected Export/Import Endpoints

## المشكلة التي تم حلها

**المشكلة السابقة:**
- استخدام endpoints التصدير/الاستيراد الحالية يتطلب `X-API-Key`
- هذا يسبب تسجيل خروج تلقائي من الواجهة
- المستخدم يحتاج لإدخال API Key يدوياً

**الحل الجديد:**
- إنشاء endpoints جديدة محمية بـ JWT
- تعمل مثل باقي الـ API (مع JWT token)
- لا تسبب تسجيل خروج تلقائي

## الـ Endpoints الجديدة

### Export Endpoints (JWT-protected)

```javascript
// Mobile Clinics Export
GET /api/export/mobile-clinics?format=csv&startDate=2024-01-01&endDate=2024-12-31

// Clients Export  
GET /api/export/clients?format=excel&status=نشط

// Vaccination Export
GET /api/export/vaccination?format=csv&startDate=2024-01-01&endDate=2024-12-31

// Parasite Control Export
GET /api/export/parasite-control?format=excel&startDate=2024-01-01&endDate=2024-12-31

// Equine Health Export
GET /api/export/equine-health?format=csv&startDate=2024-01-01&endDate=2024-12-31

// Laboratories Export
GET /api/export/laboratories?format=excel&startDate=2024-01-01&endDate=2024-12-31
```

### Import Endpoints (JWT-protected)

```javascript
// Mobile Clinics Import
POST /api/import/mobile-clinics
Content-Type: multipart/form-data
Body: file (CSV/Excel file)

// Clients Import
POST /api/import/clients  
Content-Type: multipart/form-data
Body: file (CSV/Excel file)

// Vaccination Import
POST /api/import/vaccination
Content-Type: multipart/form-data
Body: file (CSV/Excel file)

// Parasite Control Import
POST /api/import/parasite-control
Content-Type: multipart/form-data
Body: file (CSV/Excel file)
```

## الاستخدام من الواجهة

### 1. Export Example

```javascript
// في الواجهة - تصدير Mobile Clinics
async function exportMobileClinics() {
  try {
    const token = localStorage.getItem('token'); // JWT token من localStorage
    
    const response = await fetch('/api/export/mobile-clinics?format=csv', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      // تحويل الاستجابة إلى Blob وتنزيلها
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mobile-clinics.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else {
      console.error('Export failed:', response.statusText);
    }
  } catch (error) {
    console.error('Export error:', error);
  }
}
```

### 2. Import Example

```javascript
// في الواجهة - استيراد Mobile Clinics
async function importMobileClinics(file) {
  try {
    const token = localStorage.getItem('token'); // JWT token من localStorage
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/import/mobile-clinics', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
        // لا تضيف Content-Type - سيتم تعيينه تلقائياً
      },
      body: formData
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('Import successful:', result);
      // عرض رسالة نجاح
      alert(`تم استيراد ${result.successRows} سجل بنجاح`);
    } else {
      console.error('Import failed:', result);
      // عرض رسالة خطأ
      alert(`فشل الاستيراد: ${result.message}`);
    }
  } catch (error) {
    console.error('Import error:', error);
    alert('حدث خطأ أثناء الاستيراد');
  }
}
```

## المميزات

### ✅ المميزات الجديدة:
- **لا تسجيل خروج تلقائي** - تعمل مع JWT token العادي
- **أمان محسن** - محمية بـ JWT مثل باقي الـ API
- **سهولة الاستخدام** - لا حاجة لإدخال API Key يدوياً
- **تنزيل مباشر** - الملفات تُنزل مباشرة من المتصفح
- **معالجة أخطاء محسنة** - رسائل خطأ واضحة

### 🔄 مقارنة مع النظام القديم:

| الميزة | النظام القديم | النظام الجديد |
|--------|---------------|----------------|
| المصادقة | X-API-Key | JWT Token |
| تسجيل الخروج | ✅ يحدث | ❌ لا يحدث |
| سهولة الاستخدام | ❌ صعب | ✅ سهل |
| الأمان | ⚠️ متوسط | ✅ عالي |
| التكامل | ❌ منفصل | ✅ متكامل |

## الاختبار

```bash
# اختبار الـ endpoints الجديدة
node test-jwt-endpoints.js

# اختبار الـ endpoints القديمة (للمقارنة)
node test-api-endpoints.js
```

## التوصيات

### للواجهة:
1. **استخدم الـ endpoints الجديدة** بدلاً من القديمة
2. **احذف استخدام X-API-Key** من الواجهة
3. **استخدم JWT token** الموجود في localStorage
4. **اعتمد على Blob download** للتصدير

### للباك إند:
1. **احتفظ بالـ endpoints القديمة** للاستخدام الداخلي
2. **استخدم الـ endpoints الجديدة** للواجهة
3. **وثق الـ endpoints الجديدة** في Swagger

## الخلاصة

هذا الحل يحل مشكلة تسجيل الخروج التلقائي ويوفر تجربة مستخدم أفضل مع الحفاظ على الأمان والوظائف المطلوبة.
