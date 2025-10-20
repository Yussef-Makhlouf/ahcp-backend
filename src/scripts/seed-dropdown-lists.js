const mongoose = require('mongoose');
const DropdownList = require('../models/DropdownList');
require('dotenv').config();

// Initial dropdown data
const initialDropdownData = [
  // Vaccination categories
  {
    category: 'vaccine_types',
    options: [
      { value: 'FMD', label: 'FMD', labelAr: 'الحمى القلاعية', sortOrder: 0 },
      { value: 'PPR', label: 'PPR', labelAr: 'طاعون المجترات الصغيرة', sortOrder: 1 },
      { value: 'HS', label: 'HS', labelAr: 'النزف الدموي', sortOrder: 2 },
      { value: 'CCPP', label: 'CCPP', labelAr: 'ذات الرئة المعدية', sortOrder: 3 },
      { value: 'ET', label: 'ET', labelAr: 'التهاب الأنتروتوكسيميا', sortOrder: 4 },
      { value: 'No Vaccination', label: 'No Vaccination', labelAr: 'بدون تطعيم', sortOrder: 5 },
      { value: 'SG POX', label: 'SG POX', labelAr: 'جدري الأغنام والماعز', sortOrder: 6 }
    ]
  },
  {
    category: 'herd_health',
    options: [
      { value: 'Healthy', label: 'Healthy', labelAr: 'سليم', sortOrder: 0, color: 'text-green-600' },
      { value: 'Sick', label: 'Sick', labelAr: 'مريض', sortOrder: 1, color: 'text-red-600' },
      { value: 'Sporadic Cases', label: 'Sporadic Cases', labelAr: 'حالات متفرقة', sortOrder: 2, color: 'text-yellow-600' }
    ]
  },
  {
    category: 'animals_handling',
    options: [
      { value: 'Easy', label: 'Easy', labelAr: 'سهل', sortOrder: 0, color: 'text-green-600' },
      { value: 'Difficult', label: 'Difficult', labelAr: 'صعب', sortOrder: 1, color: 'text-red-600' }
    ]
  },
  {
    category: 'labours',
    options: [
      { value: 'Available', label: 'Available', labelAr: 'متوفر', sortOrder: 0, color: 'text-green-600' },
      { value: 'Not Available', label: 'Not Available', labelAr: 'غير متوفر', sortOrder: 1, color: 'text-red-600' },
      { value: 'Not Helpful', label: 'Not Helpful', labelAr: 'غير مفيد', sortOrder: 2, color: 'text-yellow-600' }
    ]
  },
  {
    category: 'reachable_location',
    options: [
      { value: 'Easy', label: 'Easy', labelAr: 'سهل الوصول', sortOrder: 0, color: 'text-green-600' },
      { value: 'Hard to reach', label: 'Hard to reach', labelAr: 'صعب الوصول', sortOrder: 1, color: 'text-red-600' },
      { value: 'Moderate', label: 'Moderate', labelAr: 'متوسط', sortOrder: 2, color: 'text-yellow-600' }
    ]
  },
  {
    category: 'request_situation',
    options: [
      { value: 'Ongoing', label: 'Ongoing', labelAr: 'جاري', sortOrder: 0, color: 'text-blue-600' },
      { value: 'Closed', label: 'Closed', labelAr: 'مغلق', sortOrder: 1, color: 'text-gray-600' }
    ]
  },

  // Parasite Control categories
  {
    category: 'insecticide_types',
    options: [
      { value: 'Cyperdip 10%', label: 'Cyperdip 10%', labelAr: 'سايبرديب 10%', sortOrder: 0 },
      { value: 'Ultra-Pour 1%', label: 'Ultra-Pour 1%', labelAr: 'ألترا بور 1%', sortOrder: 1 },
      { value: 'Deltamethrin 5%', label: 'Deltamethrin 5%', labelAr: 'دلتاميثرين 5%', sortOrder: 2 },
      { value: 'Ivermectin', label: 'Ivermectin', labelAr: 'إيفرمكتين', sortOrder: 3 },
      { value: 'Fipronil', label: 'Fipronil', labelAr: 'فيبرونيل', sortOrder: 4 },
      { value: 'Permethrin', label: 'Permethrin', labelAr: 'بيرميثرين', sortOrder: 5 }
    ]
  },
  {
    category: 'spray_methods',
    options: [
      { value: 'Pour on', label: 'Pour on', labelAr: 'صب على الظهر', sortOrder: 0 },
      { value: 'Spray', label: 'Spray', labelAr: 'رش', sortOrder: 1 },
      { value: 'Oral Drenching', label: 'Oral Drenching', labelAr: 'جرعة فموية', sortOrder: 2 }
    ]
  },
  {
    category: 'insecticide_categories',
    options: [
      { value: 'Pour-on', label: 'Pour-on', labelAr: 'صب على الظهر', sortOrder: 0 },
      { value: 'Spray', label: 'Spray', labelAr: 'رش', sortOrder: 1 },
      { value: 'Oral Drenching', label: 'Oral Drenching', labelAr: 'جرعة فموية', sortOrder: 2 }
    ]
  },
  {
    category: 'spray_status',
    options: [
      { value: 'Sprayed', label: 'Sprayed', labelAr: 'تم الرش', sortOrder: 0, color: 'text-green-600' },
      { value: 'Not Sprayed', label: 'Not Sprayed', labelAr: 'لم يتم الرش', sortOrder: 1, color: 'text-red-600' }
    ]
  },
  {
    category: 'herd_health_status',
    options: [
      { value: 'Healthy', label: 'Healthy', labelAr: 'سليم', sortOrder: 0, color: 'text-green-600' },
      { value: 'Sick', label: 'Sick', labelAr: 'مريض', sortOrder: 1, color: 'text-red-600' },
      { value: 'Sporadic cases', label: 'Sporadic cases', labelAr: 'حالات متفرقة', sortOrder: 2, color: 'text-yellow-600' }
    ]
  },
  {
    category: 'compliance',
    options: [
      { value: 'Comply', label: 'Comply', labelAr: 'ملتزم', sortOrder: 0, color: 'text-green-600' },
      { value: 'Not Comply', label: 'Not Comply', labelAr: 'غير ملتزم', sortOrder: 1, color: 'text-red-600' },
      { value: 'Partially Comply', label: 'Partially Comply', labelAr: 'ملتزم جزئياً', sortOrder: 2, color: 'text-yellow-600' }
    ]
  },
  {
    category: 'breeding_sites',
    options: [
      { value: 'Sprayed', label: 'Sprayed', labelAr: 'تم الرش', sortOrder: 0, color: 'text-green-600' },
      { value: 'Not Available', label: 'Not Available', labelAr: 'غير متوفر', sortOrder: 1, color: 'text-gray-600' },
      { value: 'Not Applicable', label: 'Not Applicable', labelAr: 'غير قابل للتطبيق', sortOrder: 2, color: 'text-gray-600' }
    ]
  },

  // Equine Health categories
  {
    category: 'intervention_categories',
    options: [
      { value: 'Clinical Examination', label: 'Clinical Examination', labelAr: 'فحص سريري', sortOrder: 0 },
      { value: 'Ultrasonography', label: 'Ultrasonography', labelAr: 'تصوير بالموجات فوق الصوتية', sortOrder: 1 },
      { value: 'Lab Analysis', label: 'Lab Analysis', labelAr: 'تحليل مختبري', sortOrder: 2 },
      { value: 'Surgical Operation', label: 'Surgical Operation', labelAr: 'عملية جراحية', sortOrder: 3 },
      { value: 'Farriery', label: 'Farriery', labelAr: 'بيطرة الخيول', sortOrder: 4 }
    ]
  },
  {
    category: 'horse_gender',
    options: [
      { value: 'ذكر', label: 'Male', labelAr: 'ذكر', sortOrder: 0, color: 'text-blue-600' },
      { value: 'أنثى', label: 'Female', labelAr: 'أنثى', sortOrder: 1, color: 'text-pink-600' },
      { value: 'مخصي', label: 'Gelding', labelAr: 'مخصي', sortOrder: 2, color: 'text-gray-600' }
    ]
  },
  {
    category: 'health_status',
    options: [
      { value: 'سليم', label: 'Healthy', labelAr: 'سليم', sortOrder: 0, color: 'text-green-600' },
      { value: 'مريض', label: 'Sick', labelAr: 'مريض', sortOrder: 1, color: 'text-red-600' },
      { value: 'تحت العلاج', label: 'Under Treatment', labelAr: 'تحت العلاج', sortOrder: 2, color: 'text-yellow-600' },
      { value: 'متعافي', label: 'Recovered', labelAr: 'متعافي', sortOrder: 3, color: 'text-blue-600' }
    ]
  },
  {
    category: 'administration_routes',
    options: [
      { value: 'Oral', label: 'Oral', labelAr: 'فموي', sortOrder: 0 },
      { value: 'Injection', label: 'Injection', labelAr: 'حقن', sortOrder: 1 },
      { value: 'Topical', label: 'Topical', labelAr: 'موضعي', sortOrder: 2 },
      { value: 'Intravenous', label: 'Intravenous', labelAr: 'وريدي', sortOrder: 3 },
      { value: 'Intramuscular', label: 'Intramuscular', labelAr: 'عضلي', sortOrder: 4 },
      { value: 'Subcutaneous', label: 'Subcutaneous', labelAr: 'تحت الجلد', sortOrder: 5 }
    ]
  },

  // Laboratory categories
  {
    category: 'sample_types',
    options: [
      { value: 'Serum', label: 'Serum', labelAr: 'مصل', sortOrder: 0 },
      { value: 'Whole Blood', label: 'Whole Blood', labelAr: 'دم كامل', sortOrder: 1 },
      { value: 'Fecal Sample', label: 'Fecal Sample', labelAr: 'عينة براز', sortOrder: 2 },
      { value: 'Skin Scrape', label: 'Skin Scrape', labelAr: 'كشط جلد', sortOrder: 3 }
    ]
  },
  {
    category: 'test_types',
    options: [
      { value: 'Parasitology', label: 'Parasitology', labelAr: 'فحص طفيليات', sortOrder: 0 },
      { value: 'Bacteriology', label: 'Bacteriology', labelAr: 'فحص بكتيري', sortOrder: 1 },
      { value: 'Virology', label: 'Virology', labelAr: 'فحص فيروسي', sortOrder: 2 },
      { value: 'Serology', label: 'Serology', labelAr: 'فحص مصلي', sortOrder: 3 },
      { value: 'Histopathology', label: 'Histopathology', labelAr: 'فحص نسيجي', sortOrder: 4 }
    ]
  },
  {
    category: 'animal_types',
    options: [
      { value: 'sheep', label: 'Sheep', labelAr: 'أغنام', sortOrder: 0 },
      { value: 'goats', label: 'Goats', labelAr: 'ماعز', sortOrder: 1 },
      { value: 'cattle', label: 'Cattle', labelAr: 'أبقار', sortOrder: 2 },
      { value: 'camel', label: 'Camel', labelAr: 'إبل', sortOrder: 3 },
      { value: 'horse', label: 'Horse', labelAr: 'خيول', sortOrder: 4 }
    ]
  },

  // Scheduling categories
  {
    category: 'priority_levels',
    options: [
      { value: 'high', label: 'High', labelAr: 'عالية', sortOrder: 0, color: 'text-red-600' },
      { value: 'medium', label: 'Medium', labelAr: 'متوسطة', sortOrder: 1, color: 'text-yellow-600' },
      { value: 'low', label: 'Low', labelAr: 'منخفضة', sortOrder: 2, color: 'text-green-600' }
    ]
  },
  {
    category: 'task_status',
    options: [
      { value: 'scheduled', label: 'Scheduled', labelAr: 'مجدولة', sortOrder: 0, color: 'text-blue-600' },
      { value: 'in_progress', label: 'In Progress', labelAr: 'قيد التنفيذ', sortOrder: 1, color: 'text-yellow-600' },
      { value: 'completed', label: 'Completed', labelAr: 'مكتملة', sortOrder: 2, color: 'text-green-600' },
      { value: 'cancelled', label: 'Cancelled', labelAr: 'ملغية', sortOrder: 3, color: 'text-red-600' }
    ]
  },
  {
    category: 'reminder_times',
    options: [
      { value: '15', label: '15 minutes before', labelAr: 'قبل 15 دقيقة', sortOrder: 0 },
      { value: '30', label: '30 minutes before', labelAr: 'قبل 30 دقيقة', sortOrder: 1 },
      { value: '60', label: '1 hour before', labelAr: 'قبل ساعة', sortOrder: 2 },
      { value: '120', label: '2 hours before', labelAr: 'قبل ساعتين', sortOrder: 3 },
      { value: '1440', label: '1 day before', labelAr: 'قبل يوم', sortOrder: 4 }
    ]
  },
  {
    category: 'recurring_types',
    options: [
      { value: 'daily', label: 'Daily', labelAr: 'يومي', sortOrder: 0 },
      { value: 'weekly', label: 'Weekly', labelAr: 'أسبوعي', sortOrder: 1 },
      { value: 'monthly', label: 'Monthly', labelAr: 'شهري', sortOrder: 2 }
    ]
  },

  // Reports categories
  {
    category: 'time_periods',
    options: [
      { value: 'day', label: 'Daily', labelAr: 'يومي', sortOrder: 0 },
      { value: 'week', label: 'Weekly', labelAr: 'أسبوعي', sortOrder: 1 },
      { value: 'month', label: 'Monthly', labelAr: 'شهري', sortOrder: 2 },
      { value: 'quarter', label: 'Quarterly', labelAr: 'ربع سنوي', sortOrder: 3 },
      { value: 'year', label: 'Yearly', labelAr: 'سنوي', sortOrder: 4 },
      { value: 'custom', label: 'Custom', labelAr: 'مخصص', sortOrder: 5 }
    ]
  },

  // User Management categories
  {
    category: 'user_roles',
    options: [
      { value: 'super_admin', label: 'Super Admin', labelAr: 'مدير عام', sortOrder: 0, color: 'text-purple-600' },
      { value: 'section_supervisor', label: 'Section Supervisor', labelAr: 'مشرف قسم', sortOrder: 1, color: 'text-blue-600' },
      { value: 'field_worker', label: 'Field Worker', labelAr: 'عامل ميداني', sortOrder: 2, color: 'text-green-600' }
    ]
  }
];

async function seedDropdownLists() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ahcp_database');
    console.log('✅ Connected to MongoDB successfully');

    // Create a dummy user for createdBy field
    const dummyUserId = new mongoose.Types.ObjectId();
    console.log('👤 Using dummy user ID:', dummyUserId);

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const categoryData of initialDropdownData) {
      console.log(`\n📂 Processing category: ${categoryData.category}`);
      
      for (const optionData of categoryData.options) {
        try {
          // Check if option already exists
          const existingOption = await DropdownList.findOne({
            category: categoryData.category,
            value: optionData.value
          });

          if (existingOption) {
            console.log(`⏭️  Skipping existing option: ${optionData.value}`);
            totalSkipped++;
            continue;
          }

          // Create new option
          const newOption = new DropdownList({
            ...optionData,
            category: categoryData.category,
            createdBy: dummyUserId,
            isActive: true
          });

          await newOption.save();
          console.log(`✅ Created option: ${optionData.labelAr} (${optionData.value})`);
          totalCreated++;

        } catch (error) {
          console.error(`❌ Error creating option ${optionData.value}:`, error.message);
        }
      }
    }

    console.log(`\n🎉 Seeding completed!`);
    console.log(`📊 Summary:`);
    console.log(`   - Created: ${totalCreated} options`);
    console.log(`   - Skipped: ${totalSkipped} existing options`);
    console.log(`   - Categories: ${initialDropdownData.length}`);

    // Display category statistics
    console.log(`\n📈 Category Statistics:`);
    for (const categoryData of initialDropdownData) {
      const count = await DropdownList.countDocuments({ category: categoryData.category });
      console.log(`   - ${categoryData.category}: ${count} options`);
    }

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the seeding script
if (require.main === module) {
  seedDropdownLists()
    .then(() => {
      console.log('🏁 Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDropdownLists, initialDropdownData };
