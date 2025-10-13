# 🎯 دليل شامل لجميع Export/Import Endpoints

## نظرة عامة

تم إنشاء نظام شامل للتصدير والاستيراد مع endpoints محمية بـ JWT لجميع الجداول في النظام.

## 📤 Export Endpoints (JWT-protected)

### 1. Mobile Clinics Export
```http
GET /api/export/mobile-clinics?format=csv&startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <JWT_TOKEN>
```

**المعاملات:**
- `format`: json, csv, excel (افتراضي: json)
- `interventionCategory`: نوع التدخل
- `startDate`: تاريخ البداية
- `endDate`: تاريخ النهاية

### 2. Clients Export
```http
GET /api/export/clients?format=excel&status=نشط
Authorization: Bearer <JWT_TOKEN>
```

**المعاملات:**
- `format`: json, csv, excel (افتراضي: json)
- `status`: نشط, غير نشط

### 3. Vaccination Export
```http
GET /api/export/vaccination?format=csv&startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <JWT_TOKEN>
```

**المعاملات:**
- `format`: json, csv, excel (افتراضي: json)
- `startDate`: تاريخ البداية
- `endDate`: تاريخ النهاية

### 4. Parasite Control Export
```http
GET /api/export/parasite-control?format=excel&startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <JWT_TOKEN>
```

**المعاملات:**
- `format`: json, csv, excel (افتراضي: json)
- `startDate`: تاريخ البداية
- `endDate`: تاريخ النهاية

### 5. Equine Health Export
```http
GET /api/export/equine-health?format=csv&startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <JWT_TOKEN>
```

**المعاملات:**
- `format`: json, csv, excel (افتراضي: json)
- `startDate`: تاريخ البداية
- `endDate`: تاريخ النهاية

### 6. Laboratories Export
```http
GET /api/export/laboratories?format=excel&startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <JWT_TOKEN>
```

**المعاملات:**
- `format`: json, csv, excel (افتراضي: json)
- `startDate`: تاريخ البداية
- `endDate`: تاريخ النهاية

### 7. Reports Export
```http
GET /api/export/reports?format=csv&startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <JWT_TOKEN>
```

**المعاملات:**
- `format`: json, csv, excel (افتراضي: json)
- `startDate`: تاريخ البداية
- `endDate`: تاريخ النهاية

## 📥 Import Endpoints (JWT-protected)

### 1. Mobile Clinics Import
```http
POST /api/import/mobile-clinics
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

Body: file (CSV/Excel file)
```

### 2. Clients Import
```http
POST /api/import/clients
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

Body: file (CSV/Excel file)
```

### 3. Vaccination Import
```http
POST /api/import/vaccination
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

Body: file (CSV/Excel file)
```

### 4. Parasite Control Import
```http
POST /api/import/parasite-control
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

Body: file (CSV/Excel file)
```

### 5. Equine Health Import
```http
POST /api/import/equine-health
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

Body: file (CSV/Excel file)
```

### 6. Laboratories Import
```http
POST /api/import/laboratories
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

Body: file (CSV/Excel file)
```

## 💻 الاستخدام من الواجهة

### Export Example (JavaScript)

```javascript
// تصدير Mobile Clinics بصيغة CSV
async function exportMobileClinics() {
  try {
    const token = localStorage.getItem('token');
    
    const response = await fetch('/api/export/mobile-clinics?format=csv', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
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

// تصدير Clients بصيغة Excel
async function exportClients() {
  try {
    const token = localStorage.getItem('token');
    
    const response = await fetch('/api/export/clients?format=excel&status=نشط', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'clients.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  } catch (error) {
    console.error('Export error:', error);
  }
}
```

### Import Example (JavaScript)

```javascript
// استيراد Mobile Clinics
async function importMobileClinics(file) {
  try {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/import/mobile-clinics', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('Import successful:', result);
      alert(`تم استيراد ${result.successRows} سجل بنجاح`);
    } else {
      console.error('Import failed:', result);
      alert(`فشل الاستيراد: ${result.message}`);
    }
  } catch (error) {
    console.error('Import error:', error);
    alert('حدث خطأ أثناء الاستيراد');
  }
}

// استيراد Clients
async function importClients(file) {
  try {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/import/clients', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('Import successful:', result);
      alert(`تم استيراد ${result.successRows} عميل بنجاح`);
    } else {
      console.error('Import failed:', result);
      alert(`فشل الاستيراد: ${result.message}`);
    }
  } catch (error) {
    console.error('Import error:', error);
    alert('حدث خطأ أثناء الاستيراد');
  }
}
```

## 📋 قائمة شاملة لجميع الـ Endpoints

### Export Endpoints:
| الجدول | Endpoint | التنسيقات المدعومة | الفلاتر |
|--------|----------|-------------------|---------|
| Mobile Clinics | `/api/export/mobile-clinics` | JSON, CSV, Excel | interventionCategory, startDate, endDate |
| Clients | `/api/export/clients` | JSON, CSV, Excel | status |
| Vaccination | `/api/export/vaccination` | JSON, CSV, Excel | startDate, endDate |
| Parasite Control | `/api/export/parasite-control` | JSON, CSV, Excel | startDate, endDate |
| Equine Health | `/api/export/equine-health` | JSON, CSV, Excel | startDate, endDate |
| Laboratories | `/api/export/laboratories` | JSON, CSV, Excel | startDate, endDate |
| Reports | `/api/export/reports` | JSON, CSV, Excel | startDate, endDate |

### Import Endpoints:
| الجدول | Endpoint | تنسيقات الملفات المدعومة |
|--------|----------|-------------------------|
| Mobile Clinics | `/api/import/mobile-clinics` | CSV, Excel |
| Clients | `/api/import/clients` | CSV, Excel |
| Vaccination | `/api/import/vaccination` | CSV, Excel |
| Parasite Control | `/api/import/parasite-control` | CSV, Excel |
| Equine Health | `/api/import/equine-health` | CSV, Excel |
| Laboratories | `/api/import/laboratories` | CSV, Excel |

## 🔧 المميزات التقنية

### ✅ الأمان:
- **محمية بـ JWT** مثل باقي الـ API
- **لا تسجيل خروج تلقائي** عند الاستخدام
- **مصادقة موحدة** مع النظام

### ✅ المرونة:
- **تنسيقات متعددة**: JSON, CSV, Excel
- **فلاتر ذكية**: التاريخ، الحالة، النوع
- **استيراد مرن**: CSV و Excel

### ✅ سهولة الاستخدام:
- **استخدام JWT token** الموجود في localStorage
- **تنزيل مباشر** للملفات
- **معالجة أخطاء محسنة**

## 🧪 الاختبار

```bash
# اختبار شامل لجميع الـ endpoints
node test-complete-endpoints.js

# اختبار الـ endpoints الجديدة فقط
node test-jwt-endpoints.js

# اختبار الـ endpoints القديمة (للمقارنة)
node test-api-endpoints.js
```

## 📚 الملفات المرجعية

- `src/routes/export.js` - جميع export endpoints
- `src/routes/import.js` - جميع import endpoints
- `test-complete-endpoints.js` - اختبار شامل
- `JWT_ENDPOINTS_GUIDE.md` - دليل الاستخدام الأساسي
- `SOLUTION_SUMMARY.md` - ملخص الحل الكامل

## 🎯 الخلاصة

تم إنشاء نظام شامل للتصدير والاستيراد مع:
- **7 Export Endpoints** لجميع الجداول
- **6 Import Endpoints** لجميع الجداول
- **حماية JWT** موحدة مع النظام
- **لا تسجيل خروج تلقائي**
- **تجربة مستخدم محسنة**

**النظام جاهز للاستخدام الكامل! 🚀**
