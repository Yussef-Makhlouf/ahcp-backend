#!/bin/bash

# سكريبت تحديث المشروع على VPS
# AHCP Backend Update Script for VPS

set -e  # إيقاف التنفيذ عند حدوث خطأ

# الألوان للرسائل
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# معلومات المشروع
PROJECT_NAME="ahcp-backend"
PROJECT_DIR="/var/www/ahcp-backend"  # قم بتغيير هذا إلى مسار مشروعك
BACKUP_DIR="/var/backups/ahcp-backend"
NODE_VERSION="18"
PM2_APP_NAME="ahcp-backend"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  سكريبت تحديث AHCP Backend على VPS${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# التحقق من وجود Git
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git غير مثبت. يرجى تثبيته أولاً.${NC}"
    exit 1
fi

# التحقق من وجود Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js غير مثبت. يرجى تثبيته أولاً.${NC}"
    exit 1
fi

# التحقق من وجود PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠️  PM2 غير مثبت. سيتم تثبيته...${NC}"
    npm install -g pm2
fi

# الانتقال إلى مجلد المشروع
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ مجلد المشروع غير موجود: $PROJECT_DIR${NC}"
    echo -e "${YELLOW}هل تريد إنشاء المشروع من جديد؟ (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        mkdir -p "$PROJECT_DIR"
        cd "$PROJECT_DIR"
        echo -e "${YELLOW}يرجى إدخال رابط Git repository:${NC}"
        read -r git_repo
        git clone "$git_repo" .
    else
        exit 1
    fi
else
    cd "$PROJECT_DIR"
fi

echo -e "${BLUE}📁 المجلد الحالي: $(pwd)${NC}"
echo ""

# إنشاء نسخة احتياطية
echo -e "${YELLOW}📦 إنشاء نسخة احتياطية...${NC}"
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/backup_$BACKUP_DATE.tar.gz" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='logs' \
    "$PROJECT_DIR" 2>/dev/null || true
echo -e "${GREEN}✅ تم إنشاء النسخة الاحتياطية: backup_$BACKUP_DATE.tar.gz${NC}"
echo ""

# حفظ التغييرات المحلية (إن وجدت)
echo -e "${YELLOW}💾 حفظ التغييرات المحلية...${NC}"
git stash save "Auto-stash before update - $(date +%Y-%m-%d_%H:%M:%S)" || true
echo ""

# جلب آخر التحديثات من Git
echo -e "${YELLOW}⬇️  جلب آخر التحديثات من Git...${NC}"
BRANCH=$(git branch --show-current)
echo -e "${BLUE}الفرع الحالي: $BRANCH${NC}"

# سؤال عن الفرع المطلوب
echo -e "${YELLOW}هل تريد التحديث من فرع محدد؟ (اضغط Enter للفرع الحالي: $BRANCH)${NC}"
read -r target_branch
if [ -z "$target_branch" ]; then
    target_branch="$BRANCH"
fi

git fetch origin
git checkout "$target_branch"
git pull origin "$target_branch"
echo -e "${GREEN}✅ تم جلب التحديثات بنجاح${NC}"
echo ""

# تثبيت/تحديث الحزم
echo -e "${YELLOW}📦 تثبيت/تحديث الحزم...${NC}"
npm install --production
echo -e "${GREEN}✅ تم تثبيت الحزم بنجاح${NC}"
echo ""

# التحقق من ملف .env
if [ ! -f ".env" ] && [ -f "production.env" ]; then
    echo -e "${YELLOW}⚠️  ملف .env غير موجود. نسخ من production.env...${NC}"
    cp production.env .env
    echo -e "${YELLOW}⚠️  يرجى مراجعة ملف .env وتحديث القيم المطلوبة${NC}"
fi

# التحقق من قاعدة البيانات
echo -e "${YELLOW}🔍 التحقق من اتصال قاعدة البيانات...${NC}"
if command -v mongosh &> /dev/null || command -v mongo &> /dev/null; then
    echo -e "${GREEN}✅ MongoDB متاح${NC}"
else
    echo -e "${YELLOW}⚠️  MongoDB CLI غير متاح. تأكد من تشغيل MongoDB${NC}"
fi
echo ""

# إعادة تشغيل التطبيق باستخدام PM2
echo -e "${YELLOW}🔄 إعادة تشغيل التطبيق...${NC}"

# التحقق من وجود التطبيق في PM2
if pm2 list | grep -q "$PM2_APP_NAME"; then
    echo -e "${BLUE}إعادة تشغيل التطبيق الموجود...${NC}"
    pm2 restart "$PM2_APP_NAME"
    echo -e "${GREEN}✅ تم إعادة تشغيل التطبيق${NC}"
else
    echo -e "${YELLOW}⚠️  التطبيق غير موجود في PM2. إنشاء جديد...${NC}"
    pm2 start server.js --name "$PM2_APP_NAME" --instances 1
    pm2 save
    echo -e "${GREEN}✅ تم إنشاء التطبيق في PM2${NC}"
fi

# حفظ قائمة PM2
pm2 save

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ تم التحديث بنجاح!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}معلومات مفيدة:${NC}"
echo -e "  📊 عرض حالة التطبيق: ${YELLOW}pm2 status${NC}"
echo -e "  📝 عرض السجلات: ${YELLOW}pm2 logs $PM2_APP_NAME${NC}"
echo -e "  🔄 إعادة التشغيل: ${YELLOW}pm2 restart $PM2_APP_NAME${NC}"
echo -e "  ⏹️  إيقاف التطبيق: ${YELLOW}pm2 stop $PM2_APP_NAME${NC}"
echo -e "  🗑️  حذف التطبيق: ${YELLOW}pm2 delete $PM2_APP_NAME${NC}"
echo ""
echo -e "${BLUE}النسخ الاحتياطية محفوظة في:${NC} $BACKUP_DIR"
echo ""

