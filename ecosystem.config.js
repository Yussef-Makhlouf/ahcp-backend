/**
 * PM2 Ecosystem Configuration File
 * ملف إعدادات PM2 للتطبيق
 * 
 * الاستخدام:
 * pm2 start ecosystem.config.js
 * pm2 save
 */

module.exports = {
  apps: [{
    name: 'ahcp-backend',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork', // 'fork' للوضع العادي، 'cluster' للوضع المتعدد
    
    // متغيرات البيئة
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    
    // ملفات السجلات
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // إدارة الذاكرة
    max_memory_restart: '500M', // إعادة التشغيل عند تجاوز 500MB
    
    // إعدادات المراقبة
    watch: false, // تعطيل المراقبة التلقائية في الإنتاج
    autorestart: true, // إعادة التشغيل التلقائي عند التعطل
    max_restarts: 10, // الحد الأقصى لمحاولات إعادة التشغيل
    min_uptime: '10s', // الحد الأدنى لوقت التشغيل قبل اعتبارها إعادة تشغيل ناجحة
    
    // إعدادات متقدمة
    kill_timeout: 5000, // وقت الانتظار قبل القتل القسري (بالميلي ثانية)
    listen_timeout: 10000, // وقت الانتظار للاستماع (بالميلي ثانية)
    
    // إعدادات Cron (للمهام المجدولة)
    // cron_restart: '0 2 * * *', // إعادة التشغيل يومياً الساعة 2 صباحاً
    
    // إعدادات متقدمة للأداء
    node_args: '--max-old-space-size=512', // حد الذاكرة لـ Node.js
    
    // إعدادات للبيئة التطويرية (يمكن إضافة env_development)
    env_development: {
      NODE_ENV: 'development',
      PORT: 3001,
      watch: true
    }
  }]
};

