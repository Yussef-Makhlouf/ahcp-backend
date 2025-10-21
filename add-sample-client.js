const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Client = require('./src/models/Client');
const MobileClinic = require('./src/models/MobileClinic');
const Vaccination = require('./src/models/Vaccination');

async function addSampleData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/animal-care-system');
    console.log('✅ Connected to MongoDB');

    // Create a sample client
    const sampleClient = new Client({
      name: 'أحمد محمد الفتح',
      nationalId: '1234567890',
      phone: '+966501234567',
      email: 'ahmed@example.com',
      village: 'al-fateh',
      birthDate: new Date('1980-01-15'),
      status: 'نشط',
      createdBy: new mongoose.Types.ObjectId(), // Dummy user ID
      animals: [
        {
          animalType: 'sheep',
          breed: 'نجدي',
          age: 3,
          gender: 'ذكر',
          healthStatus: 'سليم',
          animalCount: 25,
          identificationNumber: 'SH001'
        },
        {
          animalType: 'goats',
          breed: 'عارضي',
          age: 2,
          gender: 'أنثى',
          healthStatus: 'سليم',
          animalCount: 15,
          identificationNumber: 'GT001'
        }
      ]
    });

    const savedClient = await sampleClient.save();
    console.log('✅ Sample client created:', savedClient._id);

    // Create sample mobile clinic visit
    const mobileClinicVisit = new MobileClinic({
      client: savedClient._id,
      date: new Date('2024-10-15'),
      serialNo: 'MC001',
      supervisor: 'د. محمد العلي',
      vehicleNo: 'V123',
      diagnosis: 'فحص دوري',
      interventionCategory: 'Preventive',
      treatment: 'تطعيم ضد الحمى القلاعية',
      animalCounts: {
        sheep: 25,
        goats: 15
      },
      medicationsUsed: [
        {
          name: 'لقاح الحمى القلاعية',
          dosage: '2 مل',
          quantity: 40
        }
      ],
      createdBy: new mongoose.Types.ObjectId()
    });

    await mobileClinicVisit.save();
    console.log('✅ Sample mobile clinic visit created');

    // Create sample vaccination visit
    const vaccinationVisit = new Vaccination({
      client: savedClient._id,
      date: new Date('2024-10-20'),
      serialNo: 'VAC001',
      supervisor: 'د. فاطمة أحمد',
      vehicleNo: 'V124',
      vaccineType: 'لقاح الجدري',
      herdStatus: 'سليم',
      animalCounts: {
        sheep: 25,
        goats: 15
      },
      easeOfHandling: 'سهل',
      accessibility: 'جيد',
      createdBy: new mongoose.Types.ObjectId()
    });

    await vaccinationVisit.save();
    console.log('✅ Sample vaccination visit created');

    console.log('🎉 Sample data added successfully!');
    console.log('Client ID:', savedClient._id);
    
  } catch (error) {
    console.error('❌ Error adding sample data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

addSampleData();
