const mongoose = require('mongoose');
const Section = require('../models/Section');
const User = require('../models/User');
require('dotenv').config();

// الأقسام الأساسية
const defaultSections = [
  {
    name: 'قسم الطب البيطري',
    nameEn: 'Veterinary Department',
    code: 'VET',
    description: 'قسم مختص بالطب البيطري والعلاج والتشخيص'
  },
  {
    name: 'قسم المختبرات',
    nameEn: 'Laboratory Department',
    code: 'LAB',
    description: 'قسم التحاليل المخبرية والفحوصات الطبية'
  },
  {
    name: 'قسم مكافحة الطفيليات',
    nameEn: 'Parasite Control Department',
    code: 'PARA',
    description: 'قسم مكافحة الطفيليات والحشرات الضارة'
  },
  {
    name: 'قسم التحصين',
    nameEn: 'Vaccination Department',
    code: 'VACC',
    description: 'قسم التطعيمات واللقاحات البيطرية'
  },
  {
    name: 'قسم العيادات المتنقلة',
    nameEn: 'Mobile Clinics Department',
    code: 'CLINIC',
    description: 'قسم العيادات المتنقلة والخدمات الميدانية'
  },
  {
    name: 'قسم صحة الخيول',
    nameEn: 'Equine Health Department',
    code: 'EQUINE',
    description: 'قسم مختص بصحة وعلاج الخيول'
  },
  {
    name: 'قسم الإدارة',
    nameEn: 'Administration Department',
    code: 'ADMIN',
    description: 'قسم الإدارة والشؤون الإدارية'
  },
  {
    name: 'قسم التقارير والإحصائيات',
    nameEn: 'Reports & Statistics Department',
    code: 'REPORT',
    description: 'قسم إعداد التقارير والإحصائيات'
  }
];

async function seedSections() {
  try {
    // الاتصال بقاعدة البيانات
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ahcp_database');
    console.log('✅ Connected to MongoDB');

    // البحث عن مدير عام لإنشاء الأقسام
    const admin = await User.findOne({ role: 'super_admin' });
    if (!admin) {
      console.error('❌ No super admin found. Please create an admin user first.');
      process.exit(1);
    }

    console.log(`📋 Found admin: ${admin.name} (${admin.email})`);

    // حذف الأقسام الموجودة (اختياري)
    const existingSections = await Section.find();
    if (existingSections.length > 0) {
      console.log(`🗑️ Found ${existingSections.length} existing sections. Removing them...`);
      await Section.deleteMany({});
    }

    // إضافة الأقسام الجديدة
    console.log('📝 Creating sections...');
    const sectionsToCreate = defaultSections.map(section => ({
      ...section,
      createdBy: admin._id,
      isActive: true
    }));

    const createdSections = await Section.insertMany(sectionsToCreate);
    console.log(`✅ Created ${createdSections.length} sections successfully!`);

    // عرض الأقسام المنشأة
    console.log('\n📋 Created Sections:');
    createdSections.forEach((section, index) => {
      console.log(`${index + 1}. ${section.name} (${section.code}) - ${section.nameEn}`);
    });

    // تحديث المستخدمين الموجودين لربطهم بالأقسام
    console.log('\n🔄 Updating existing users with sections...');
    
    // ربط المشرفين والعمال بأقسام عشوائية للاختبار
    const supervisors = await User.find({ role: 'section_supervisor' });
    const workers = await User.find({ role: 'field_worker' });
    
    for (let i = 0; i < supervisors.length; i++) {
      const sectionIndex = i % createdSections.length;
      const section = createdSections[sectionIndex];
      await User.findByIdAndUpdate(supervisors[i]._id, { section: section.code });
      console.log(`👤 Updated supervisor ${supervisors[i].name} -> ${section.name} (${section.code})`);
    }

    for (let i = 0; i < workers.length; i++) {
      const sectionIndex = i % createdSections.length;
      const section = createdSections[sectionIndex];
      await User.findByIdAndUpdate(workers[i]._id, { section: section.code });
      console.log(`👷 Updated worker ${workers[i].name} -> ${section.name} (${section.code})`);
    }

    console.log('\n🎉 Sections seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`- Created ${createdSections.length} sections`);
    console.log(`- Updated ${supervisors.length} supervisors`);
    console.log(`- Updated ${workers.length} workers`);

  } catch (error) {
    console.error('❌ Error seeding sections:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📤 Disconnected from MongoDB');
    process.exit(0);
  }
}

// تشغيل السكريبت
if (require.main === module) {
  console.log('🌱 Starting sections seeding...');
  seedSections();
}

module.exports = { seedSections, defaultSections };
