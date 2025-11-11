# تحديث سريع للمشروع على VPS 🚀

## الطريقة السريعة (موصى بها)

```bash
# 1. الانتقال إلى مجلد المشروع
cd /var/www/ahcp-backend

# 2. تشغيل سكريبت التحديث التلقائي
chmod +x update-vps.sh
./update-vps.sh
```

---

## الطريقة اليدوية (خطوة بخطوة)

### 1️⃣ جلب التحديثات من Git
```bash
cd /var/www/ahcp-backend
git pull origin main  # أو master حسب فرعك
```

### 2️⃣ تثبيت/تحديث الحزم
```bash
npm install --production
```

### 3️⃣ إعادة تشغيل التطبيق
```bash
pm2 restart ahcp-backend
```

### 4️⃣ التحقق من الحالة
```bash
pm2 status
pm2 logs ahcp-backend --lines 50
```

---

## أوامر مفيدة

| الأمر | الوصف |
|------|-------|
| `pm2 status` | عرض حالة التطبيق |
| `pm2 logs ahcp-backend` | عرض السجلات المباشرة |
| `pm2 restart ahcp-backend` | إعادة تشغيل التطبيق |
| `pm2 stop ahcp-backend` | إيقاف التطبيق |
| `pm2 start ahcp-backend` | بدء التطبيق |
| `pm2 monit` | مراقبة استخدام الموارد |

---

## في حالة وجود مشاكل

### التطبيق لا يعمل
```bash
pm2 logs ahcp-backend --lines 100
pm2 restart ahcp-backend
```

### خطأ في الحزم
```bash
rm -rf node_modules package-lock.json
npm install --production
pm2 restart ahcp-backend
```

### خطأ في قاعدة البيانات
```bash
# التحقق من حالة MongoDB
sudo systemctl status mongod

# التحقق من ملف .env
cat .env | grep MONGODB_URI
```

---

## ملاحظات مهمة

⚠️ **قبل التحديث:**
- تأكد من وجود نسخة احتياطية
- راجع التغييرات في Git
- تأكد من صحة ملف `.env`

✅ **بعد التحديث:**
- تحقق من السجلات
- اختبر الواجهات الرئيسية
- راقب استخدام الموارد

---

📚 **للمزيد من التفاصيل:** راجع ملف `VPS_DEPLOYMENT_GUIDE.md`

