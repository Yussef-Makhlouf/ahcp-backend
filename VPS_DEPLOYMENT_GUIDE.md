# دليل النشر والتحديث على VPS - AHCP Backend

## 📋 الفهرس
1. [المتطلبات الأساسية](#المتطلبات-الأساسية)
2. [الإعداد الأولي](#الإعداد-الأولي)
3. [النشر الأول](#النشر-الأول)
4. [تحديث المشروع](#تحديث-المشروع)
5. [الصيانة والمراقبة](#الصيانة-والمراقبة)
6. [استكشاف الأخطاء](#استكشاف-الأخطاء)

---

## المتطلبات الأساسية

### 1. متطلبات النظام
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y git curl build-essential

# CentOS/RHEL
sudo yum install -y git curl gcc-c++ make
```

### 2. تثبيت Node.js
```bash
# استخدام NVM (موصى به)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# تثبيت Node.js 18
nvm install 18
nvm use 18
nvm alias default 18

# التحقق من التثبيت
node --version  # يجب أن يظهر v18.x.x
npm --version
```

### 3. تثبيت MongoDB
```bash
# Ubuntu/Debian
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# تشغيل MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# التحقق من الحالة
sudo systemctl status mongod
```

### 4. تثبيت PM2
```bash
npm install -g pm2

# إعداد PM2 للبدء التلقائي
pm2 startup
# اتبع التعليمات التي تظهر
```

---

## الإعداد الأولي

### 1. إنشاء مجلد المشروع
```bash
# إنشاء المجلد
sudo mkdir -p /var/www/ahcp-backend
sudo chown -R $USER:$USER /var/www/ahcp-backend

# الانتقال إلى المجلد
cd /var/www/ahcp-backend
```

### 2. استنساخ المشروع
```bash
# استنساخ من Git
git clone <repository-url> .

# أو رفع الملفات يدوياً باستخدام SCP/SFTP
```

### 3. إعداد متغيرات البيئة
```bash
# نسخ ملف production.env إلى .env
cp production.env .env

# تعديل ملف .env
nano .env
```

**ملاحظات مهمة:**
- ✅ تأكد من تحديث `MONGODB_URI` بقاعدة البيانات الصحيحة
- ✅ قم بتغيير `JWT_SECRET` إلى مفتاح قوي وعشوائي
- ✅ حدد `CORS_ORIGIN` بدومين الواجهة الأمامية
- ✅ تأكد من صحة إعدادات البريد الإلكتروني

### 4. تثبيت الحزم
```bash
npm install --production
```

### 5. إعداد قاعدة البيانات
```bash
# تشغيل سكريبت البذر (إن وجد)
npm run seed:sections
```

---

## النشر الأول

### 1. تشغيل التطبيق باستخدام PM2
```bash
cd /var/www/ahcp-backend

# تشغيل التطبيق
pm2 start server.js --name ahcp-backend --instances 1

# حفظ قائمة PM2
pm2 save

# التحقق من الحالة
pm2 status
pm2 logs ahcp-backend
```

### 2. إعداد Nginx كـ Reverse Proxy (اختياري)
```bash
# تثبيت Nginx
sudo apt install -y nginx

# إنشاء ملف الإعداد
sudo nano /etc/nginx/sites-available/ahcp-backend
```

**محتوى ملف Nginx:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# تفعيل الموقع
sudo ln -s /etc/nginx/sites-available/ahcp-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 3. إعداد SSL باستخدام Let's Encrypt (موصى به)
```bash
# تثبيت Certbot
sudo apt install -y certbot python3-certbot-nginx

# الحصول على شهادة SSL
sudo certbot --nginx -d your-domain.com

# التجديد التلقائي
sudo certbot renew --dry-run
```

---

## تحديث المشروع

### الطريقة الأولى: استخدام السكريبت التلقائي (موصى به)

```bash
# جعل السكريبت قابل للتنفيذ
chmod +x update-vps.sh

# تعديل مسار المشروع في السكريبت (إن لزم الأمر)
nano update-vps.sh
# غيّر PROJECT_DIR="/var/www/ahcp-backend" إلى مسارك

# تشغيل السكريبت
./update-vps.sh
```

### الطريقة الثانية: التحديث اليدوي

```bash
# 1. الانتقال إلى مجلد المشروع
cd /var/www/ahcp-backend

# 2. حفظ التغييرات المحلية (إن وجدت)
git stash

# 3. جلب آخر التحديثات
git pull origin main  # أو master حسب فرعك

# 4. تثبيت/تحديث الحزم
npm install --production

# 5. إعادة تشغيل التطبيق
pm2 restart ahcp-backend

# 6. التحقق من الحالة
pm2 status
pm2 logs ahcp-backend --lines 50
```

### خطوات إضافية بعد التحديث

```bash
# إذا كان هناك تغييرات في قاعدة البيانات
npm run seed:sections

# إذا كان هناك تغييرات في الفهارس
npm run add-indexes

# التحقق من السجلات
pm2 logs ahcp-backend --lines 100
```

---

## الصيانة والمراقبة

### 1. مراقبة التطبيق
```bash
# عرض حالة جميع التطبيقات
pm2 status

# عرض السجلات المباشرة
pm2 logs ahcp-backend

# عرض السجلات فقط (بدون متابعة)
pm2 logs ahcp-backend --lines 100

# عرض معلومات مفصلة
pm2 show ahcp-backend

# مراقبة استخدام الموارد
pm2 monit
```

### 2. إدارة التطبيق
```bash
# إعادة تشغيل
pm2 restart ahcp-backend

# إيقاف مؤقت
pm2 stop ahcp-backend

# بدء التطبيق
pm2 start ahcp-backend

# حذف التطبيق من PM2
pm2 delete ahcp-backend

# إعادة تحميل بدون توقف (zero-downtime)
pm2 reload ahcp-backend
```

### 3. النسخ الاحتياطي
```bash
# إنشاء نسخة احتياطية يدوياً
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
tar -czf /var/backups/ahcp-backend/backup_$BACKUP_DATE.tar.gz \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='logs' \
    /var/www/ahcp-backend

# نسخ احتياطي لقاعدة البيانات
mongodump --uri="your-mongodb-uri" --out=/var/backups/ahcp-backend/db_$BACKUP_DATE
```

### 4. تنظيف السجلات
```bash
# تنظيف سجلات PM2
pm2 flush

# تنظيف سجلات التطبيق
cd /var/www/ahcp-backend
rm -f logs/*.log
```

---

## استكشاف الأخطاء

### المشكلة: التطبيق لا يعمل
```bash
# 1. التحقق من حالة PM2
pm2 status

# 2. عرض السجلات
pm2 logs ahcp-backend --lines 100

# 3. التحقق من المنفذ
netstat -tulpn | grep 3001

# 4. التحقق من قاعدة البيانات
mongosh "your-mongodb-uri"
```

### المشكلة: خطأ في الاتصال بقاعدة البيانات
```bash
# التحقق من حالة MongoDB
sudo systemctl status mongod

# التحقق من الاتصال
mongosh "your-mongodb-uri"

# التحقق من متغيرات البيئة
cd /var/www/ahcp-backend
cat .env | grep MONGODB_URI
```

### المشكلة: خطأ في الحزم
```bash
# حذف node_modules وإعادة التثبيت
rm -rf node_modules package-lock.json
npm install --production

# التحقق من إصدار Node.js
node --version
```

### المشكلة: خطأ في الذاكرة
```bash
# زيادة حد الذاكرة لـ Node.js
pm2 restart ahcp-backend --max-memory-restart 500M

# أو في ملف ecosystem.config.js
```

### المشكلة: التطبيق بطيء
```bash
# مراقبة استخدام الموارد
pm2 monit

# التحقق من السجلات
pm2 logs ahcp-backend --lines 200

# التحقق من قاعدة البيانات
mongosh "your-mongodb-uri"
db.serverStatus()
```

---

## ملفات مفيدة

### ecosystem.config.js (إعدادات PM2 المتقدمة)
```javascript
module.exports = {
  apps: [{
    name: 'ahcp-backend',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '500M',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

**استخدامه:**
```bash
pm2 start ecosystem.config.js
pm2 save
```

---

## نصائح مهمة

1. **النسخ الاحتياطي:** قم بإنشاء نسخ احتياطية منتظمة
2. **المراقبة:** راقب السجلات والموارد بانتظام
3. **التحديثات:** قم بتحديث النظام والحزم بانتظام
4. **الأمان:** استخدم SSL، كلمات مرور قوية، وحدّث JWT_SECRET
5. **الأداء:** راقب استخدام الذاكرة والمعالج
6. **السجلات:** احتفظ بسجلات منظمة وافحصها بانتظام

---

## أوامر سريعة

```bash
# تحديث سريع
cd /var/www/ahcp-backend && git pull && npm install --production && pm2 restart ahcp-backend

# عرض السجلات
pm2 logs ahcp-backend --lines 50

# إعادة التشغيل
pm2 restart ahcp-backend

# حالة النظام
pm2 status && pm2 monit
```

---

## الدعم

في حالة وجود مشاكل:
1. راجع السجلات: `pm2 logs ahcp-backend`
2. تحقق من حالة الخدمات: `pm2 status` و `sudo systemctl status mongod`
3. راجع ملف `.env` للتأكد من صحة الإعدادات
4. راجع هذا الدليل مرة أخرى

---

**آخر تحديث:** $(date)

