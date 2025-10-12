# إعداد البريد الإلكتروني لنظام استعادة كلمة المرور

## متطلبات الإعداد

### 1. إعداد Gmail (للتطوير)

1. قم بتفعيل المصادقة الثنائية في حساب Gmail
2. أنشئ كلمة مرور التطبيق:
   - اذهب إلى إعدادات Google Account
   - Security > 2-Step Verification > App passwords
   - اختر "Mail" و "Other (Custom name)"
   - انسخ كلمة المرور المولدة

3. أضف المتغيرات التالية إلى ملف `.env`:

```env
# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-16-character-app-password
EMAIL_FROM=noreply@ahcp.gov.sa
```

### 2. إعداد SMTP مخصص (للإنتاج)

```env
# SMTP Configuration
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@yourdomain.com
SMTP_PASS=your-email-password
```

### 3. إعدادات إضافية

```env
# Frontend URL (لإنشاء روابط إعادة التعيين)
FRONTEND_URL=https://your-domain.com

# Environment
NODE_ENV=production
```

## اختبار الإعداد

1. تأكد من تشغيل الخادم الخلفي
2. اذهب إلى صفحة نسيان كلمة المرور
3. أدخل بريد إلكتروني صحيح
4. تحقق من وصول البريد الإلكتروني

## استكشاف الأخطاء

### خطأ "Invalid login"
- تأكد من صحة كلمة مرور التطبيق
- تأكد من تفعيل المصادقة الثنائية

### خطأ "Connection timeout"
- تحقق من إعدادات SMTP
- تأكد من فتح المنافذ المطلوبة

### البريد لا يصل
- تحقق من مجلد الرسائل المزعجة
- تأكد من صحة عنوان البريد الإلكتروني
- تحقق من سجلات الخادم للأخطاء
