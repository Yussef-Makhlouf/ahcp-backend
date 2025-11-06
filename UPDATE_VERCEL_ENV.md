# تحديث متغيرات البيئة في Vercel

## المشكلة الحالية
رابط إعادة تعيين كلمة المرور يحتوي على `localhost:3000` بدلاً من الدومين الإنتاجي.

## الحل المطلوب
تحديث متغيرات البيئة في Vercel Dashboard لتتضمن:

### 1. متغيرات البيئة المطلوب إضافتها/تحديثها:

```
FRONTEND_URL=https://ulaahcprp.cloud
CORS_ORIGIN=https://ulaahcprp.cloud,https://ulaahcprp.cloud
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alulaahcp@gmail.com
SMTP_PASS=xydf vjro vykh ajbb
FROM_EMAIL=alulaahcp@gmail.com
```

### 2. خطوات التحديث:

1. اذهب إلى [Vercel Dashboard](https://vercel.com/dashboard)
2. اختر مشروع `ahcp-backend`
3. اذهب إلى **Settings** → **Environment Variables**
4. أضف/حدث المتغيرات التالية:

| Variable Name | Value | Environment |
|---------------|-------|-------------|
| `FRONTEND_URL` | `https://ulaahcprp.cloud` | Production |
| `CORS_ORIGIN` | `https://ulaahcprp.cloud,https://ulaahcprp.cloud` | Production |
| `SMTP_HOST` | `smtp.gmail.com` | Production |
| `SMTP_PORT` | `587` | Production |
| `SMTP_USER` | `alulaahcp@gmail.com` | Production |
| `SMTP_PASS` | `xydf vjro vykh ajbb` | Production |
| `FROM_EMAIL` | `alulaahcp@gmail.com` | Production |

### 3. إعادة النشر:
بعد إضافة المتغيرات، قم بإعادة نشر المشروع:
- اذهب إلى **Deployments**
- انقر على **Redeploy** للنشر الأخير

### 4. التحقق من النتيجة:
بعد إعادة النشر، ستصبح روابط إعادة تعيين كلمة المرور:
```
https://ulaahcprp.cloud/reset-password/[token]
```
بدلاً من:
```
http://localhost:3000/reset-password/[token]
```

## ملاحظات مهمة:
- تأكد من إضافة المتغيرات لبيئة **Production** فقط
- بعد التحديث، اختبر وظيفة "نسيت كلمة المرور" للتأكد من عمل الروابط
- الرابط سيعمل على كلا الدومينين: `https://ulaahcprp.cloud` و `https://ulaahcprp.cloud`
