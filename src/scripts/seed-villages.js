const mongoose = require('mongoose');
const Village = require('../models/Village');
const User = require('../models/User');
require('dotenv').config({ path: './production.env' });
require('dotenv').config();

const villagesData = [
  // Mughaira Sector
  {
    serialNumber: "M001",
    sector: "Mughaira Sector",
    nameArabic: "وقير",
    nameEnglish: "Wagir"
  },
  {
    serialNumber: "M002",
    sector: "Mughaira Sector",
    nameArabic: "خشيبة",
    nameEnglish: "Khishaiba"
  },
  {
    serialNumber: "M003",
    sector: "Mughaira Sector",
    nameArabic: "مغيراء",
    nameEnglish: "Mughaira"
  },
  {
    serialNumber: "M004",
    sector: "Mughaira Sector",
    nameArabic: "عرعر",
    nameEnglish: "Arar"
  },
  {
    serialNumber: "M005",
    sector: "Mughaira Sector",
    nameArabic: "أم شقوق",
    nameEnglish: "Um-Shiqooq"
  },
  {
    serialNumber: "M006",
    sector: "Mughaira Sector",
    nameArabic: "العين",
    nameEnglish: "Alain"
  },
  {
    serialNumber: "M007",
    sector: "Mughaira Sector",
    nameArabic: "الجديدة",
    nameEnglish: "Al-Jadida"
  },
  {
    serialNumber: "M008",
    sector: "Mughaira Sector",
    nameArabic: "كتيفه",
    nameEnglish: "Kitaifa"
  },
  {
    serialNumber: "M009",
    sector: "Mughaira Sector",
    nameArabic: "مصادر",
    nameEnglish: "Masadir"
  },
  {
    serialNumber: "M010",
    sector: "Mughaira Sector",
    nameArabic: "العين الجديدة",
    nameEnglish: "Alain Aljadida"
  },
  {
    serialNumber: "M011",
    sector: "Mughaira Sector",
    nameArabic: "القصيب الاعوج",
    nameEnglish: "Alqisaib Alawaj"
  },
  {
    serialNumber: "M012",
    sector: "Mughaira Sector",
    nameArabic: "المرمى",
    nameEnglish: "Almarma"
  },

  // Central Sector
  {
    serialNumber: "C001",
    sector: "Central Sector",
    nameArabic: "العلا",
    nameEnglish: "AlUla"
  },
  {
    serialNumber: "C002",
    sector: "Central Sector",
    nameArabic: "قراقر",
    nameEnglish: "Gragir"
  },
  {
    serialNumber: "C003",
    sector: "Central Sector",
    nameArabic: "العذيب",
    nameEnglish: "Al-Othaib"
  },
  {
    serialNumber: "C004",
    sector: "Central Sector",
    nameArabic: "وادي عشار",
    nameEnglish: "Ishar Valley"
  },
  {
    serialNumber: "C005",
    sector: "Central Sector",
    nameArabic: "رم",
    nameEnglish: "Rum"
  },
  {
    serialNumber: "C006",
    sector: "Central Sector",
    nameArabic: "قاع الحاج",
    nameEnglish: "Gaa' Alhaj"
  },
  {
    serialNumber: "C007",
    sector: "Central Sector",
    nameArabic: "المعتدل",
    nameEnglish: "Al-Mutadil"
  },
  {
    serialNumber: "C008",
    sector: "Central Sector",
    nameArabic: "حصاة الداب",
    nameEnglish: "Hasat Aldab"
  },
  {
    serialNumber: "C009",
    sector: "Central Sector",
    nameArabic: "ضاعا",
    nameEnglish: "Daa'"
  },
  {
    serialNumber: "C010",
    sector: "Central Sector",
    nameArabic: "وادي أمول",
    nameEnglish: "Amool Valley"
  },

  // Northern Sector
  {
    serialNumber: "N001",
    sector: "Northern Sector",
    nameArabic: "البريكة",
    nameEnglish: "Al-Biraika"
  },
  {
    serialNumber: "N002",
    sector: "Northern Sector",
    nameArabic: "الحجر",
    nameEnglish: "Al-Hijr"
  },
  {
    serialNumber: "N003",
    sector: "Northern Sector",
    nameArabic: "المزحم",
    nameEnglish: "Al-Mazham"
  },
  {
    serialNumber: "N004",
    sector: "Northern Sector",
    nameArabic: "الملسن",
    nameEnglish: "Al-Malsan"
  },
  {
    serialNumber: "N005",
    sector: "Northern Sector",
    nameArabic: "ثربة",
    nameEnglish: "Thirba"
  },
  {
    serialNumber: "N006",
    sector: "Northern Sector",
    nameArabic: "ميدان الاصايل",
    nameEnglish: "Asayel Yard"
  },
  {
    serialNumber: "N007",
    sector: "Northern Sector",
    nameArabic: "شلال",
    nameEnglish: "Shilal"
  },
  {
    serialNumber: "N008",
    sector: "Northern Sector",
    nameArabic: "عرده",
    nameEnglish: "Irda"
  },
  {
    serialNumber: "N009",
    sector: "Northern Sector",
    nameArabic: "شرعان",
    nameEnglish: "Shiraa'n"
  },
  {
    serialNumber: "N010",
    sector: "Northern Sector",
    nameArabic: "صوير",
    nameEnglish: "Sweir"
  },

  // Fadhla Sector
  {
    serialNumber: "F001",
    sector: "Fadhla Sector",
    nameArabic: "فضلا",
    nameEnglish: "Fadhla"
  },
  {
    serialNumber: "F002",
    sector: "Fadhla Sector",
    nameArabic: "قرم",
    nameEnglish: "Garm"
  },
  {
    serialNumber: "F003",
    sector: "Fadhla Sector",
    nameArabic: "قصيب ابو سيال",
    nameEnglish: "Gisaib Abu syal"
  },
  {
    serialNumber: "F004",
    sector: "Fadhla Sector",
    nameArabic: "الفرش",
    nameEnglish: "AlFarsh"
  },
  {
    serialNumber: "F005",
    sector: "Fadhla Sector",
    nameArabic: "الفلقه",
    nameEnglish: "Alfilqa"
  },
  {
    serialNumber: "F006",
    sector: "Fadhla Sector",
    nameArabic: "النجيل",
    nameEnglish: "Al-Nijail"
  },
  {
    serialNumber: "F007",
    sector: "Fadhla Sector",
    nameArabic: "حلاوة",
    nameEnglish: "Halawa"
  },
  {
    serialNumber: "F008",
    sector: "Fadhla Sector",
    nameArabic: "الضرس",
    nameEnglish: "Aldirs"
  },
  {
    serialNumber: "F009",
    sector: "Fadhla Sector",
    nameArabic: "المقرح الأبيض",
    nameEnglish: "Almagrah Alabyad"
  },
  {
    serialNumber: "F010",
    sector: "Fadhla Sector",
    nameArabic: "المقرح الأسمر",
    nameEnglish: "Almagrah Akasmar"
  },
  {
    serialNumber: "F011",
    sector: "Fadhla Sector",
    nameArabic: "الوفض",
    nameEnglish: "Alwafd"
  },
  {
    serialNumber: "F012",
    sector: "Fadhla Sector",
    nameArabic: "بلاطه",
    nameEnglish: "Balata"
  },
  {
    serialNumber: "F013",
    sector: "Fadhla Sector",
    nameArabic: "بئر الاراك",
    nameEnglish: "Bir Alarak"
  },
  {
    serialNumber: "F014",
    sector: "Fadhla Sector",
    nameArabic: "جيدة",
    nameEnglish: "Jaida"
  },
  {
    serialNumber: "F015",
    sector: "Fadhla Sector",
    nameArabic: "الورد",
    nameEnglish: "Alward"
  },
  {
    serialNumber: "F016",
    sector: "Fadhla Sector",
    nameArabic: "خصلف",
    nameEnglish: "Khusluf"
  },
  {
    serialNumber: "F017",
    sector: "Fadhla Sector",
    nameArabic: "دف رحال",
    nameEnglish: "Daf Rahal"
  },
  {
    serialNumber: "F018",
    sector: "Fadhla Sector",
    nameArabic: "سرار",
    nameEnglish: "Sirar"
  },
  {
    serialNumber: "F019",
    sector: "Fadhla Sector",
    nameArabic: "ام المخابيل",
    nameEnglish: "UmALmkhabeel"
  },
  {
    serialNumber: "F020",
    sector: "Fadhla Sector",
    nameArabic: "الكويرة",
    nameEnglish: "Alkiwaira"
  },
  {
    serialNumber: "F021",
    sector: "Fadhla Sector",
    nameArabic: "ذورة",
    nameEnglish: "Thowra"
  },
  {
    serialNumber: "F022",
    sector: "Fadhla Sector",
    nameArabic: "وادي ثري",
    nameEnglish: "Thri Valley"
  },
  {
    serialNumber: "F023",
    sector: "Fadhla Sector",
    nameArabic: "السطح",
    nameEnglish: "Alsatih"
  }
];

async function seedVillages() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ahcp_database', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('🔗 Connected to MongoDB');

    // Find admin user to assign as creator
    const adminUser = await User.findOne({ role: 'super_admin' });
    if (!adminUser) {
      console.log('❌ No admin user found. Please create an admin user first.');
      process.exit(1);
    }

    console.log(`👤 Found admin user: ${adminUser.name}`);

    // Clear existing villages
    await Village.deleteMany({});
    console.log('🗑️ Cleared existing villages');

    // Add createdBy to all villages
    const villagesWithCreator = villagesData.map(village => ({
      ...village,
      createdBy: adminUser._id
    }));

    // Insert villages
    const villages = await Village.insertMany(villagesWithCreator);
    console.log(`✅ Successfully seeded ${villages.length} villages`);

    // Display summary
    const sectors = await Village.aggregate([
      { $group: { _id: '$sector', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('\n📊 Villages by sector:');
    sectors.forEach(sector => {
      console.log(`  ${sector._id}: ${sector.count} villages`);
    });

    console.log('\n🎉 Village seeding completed successfully!');

  } catch (error) {
    console.error('❌ Error seeding villages:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the seeding function
if (require.main === module) {
  seedVillages();
}

module.exports = { seedVillages, villagesData };
