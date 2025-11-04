const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Client = require('../models/Client');
const HoldingCode = require('../models/HoldingCode');
const ParasiteControl = require('../models/ParasiteControl');
const Vaccination = require('../models/Vaccination');
const MobileClinic = require('../models/MobileClinic');
const EquineHealth = require('../models/EquineHealth');
const Laboratory = require('../models/Laboratory');

// Sample data
const sampleUsers = [
  {
    name: 'مدير النظام',
    email: 'admin@ahcp.gov.sa',
    password: 'Admin@123456',
    role: 'super_admin',
    section: 'الإدارة العامة',
    isActive: true
  },
  {
    name: 'د. محمد علي الأحمد',
    email: 'parasite@ahcp.gov.sa',
    password: 'parasite123',
    role: 'section_supervisor',
    section: 'مكافحة الطفيليات',
    isActive: true
  },
  {
    name: 'د. سارة محمود الزهراني',
    email: 'vaccination@ahcp.gov.sa',
    password: 'vaccination123',
    role: 'section_supervisor',
    section: 'التحصينات',
    isActive: true
  },
  {
    name: 'د. أحمد حسن الشمري',
    email: 'clinic@ahcp.gov.sa',
    password: 'clinic123',
    role: 'section_supervisor',
    section: 'العيادة المتنقلة',
    isActive: true
  },
  {
    name: 'د. فاطمة عبدالله القحطاني',
    email: 'laboratory@ahcp.gov.sa',
    password: 'lab123',
    role: 'section_supervisor',
    section: 'المختبرات',
    isActive: true
  },
  {
    name: 'د. خالد إبراهيم العتيبي',
    email: 'equine@ahcp.gov.sa',
    password: 'equine123',
    role: 'section_supervisor',
    section: 'صحة الخيول',
    isActive: true
  },
  {
    name: 'د. نورا سعد الحربي',
    email: 'parasite2@ahcp.gov.sa',
    password: 'parasite456',
    role: 'section_supervisor',
    section: 'مكافحة الطفيليات',
    isActive: true
  },
  {
    name: 'عامل ميداني',
    email: 'field@ahcp.gov.sa',
    password: 'field123',
    role: 'field_worker',
    section: 'العمل الميداني',
    isActive: true
  }
];

const sampleClients = [
  {
    name: 'إبراهيم محمد الأحمد',
    nationalId: '1234567890',
    birthDate: new Date('1980-01-15'),
    phone: '+966501234567',
    email: 'ibrahim@example.com',
    village: 'الرياض',
    detailedAddress: 'مزرعة الأحمد، طريق الخرج',
    coordinates: {
      latitude: 24.7136,
      longitude: 46.6753
    },
    status: 'نشط',
    animals: [
      {
        animalType: 'sheep',
        breed: 'نجدي',
        age: 3,
        gender: 'أنثى',
        healthStatus: 'سليم',
        identificationNumber: 'SH001',
        animalCount: 150
      },
      {
        animalType: 'goats',
        breed: 'عارضي',
        age: 2,
        gender: 'ذكر',
        healthStatus: 'سليم',
        identificationNumber: 'GT001',
        animalCount: 80
      }
    ],
    availableServices: ['parasite_control', 'vaccination', 'mobile_clinic'],
    notes: 'مربي متعاون، يطبق تعليمات مكافحة الطفيليات'
  },
  {
    name: 'أحمد علي السعد',
    nationalId: '2345678901',
    birthDate: new Date('1975-05-20'),
    phone: '+966507654321',
    email: 'ahmed@example.com',
    village: 'القصيم',
    detailedAddress: 'مزرعة السعد، بريدة',
    coordinates: {
      latitude: 26.3260,
      longitude: 43.9750
    },
    status: 'نشط',
    animals: [
      {
        animalType: 'cattle',
        breed: 'هولشتاين',
        age: 4,
        gender: 'أنثى',
        healthStatus: 'سليم',
        identificationNumber: 'CT001',
        animalCount: 45
      },
      {
        animalType: 'sheep',
        breed: 'نعيمي',
        age: 2,
        gender: 'أنثى',
        healthStatus: 'سليم',
        identificationNumber: 'SH002',
        animalCount: 120
      }
    ],
    availableServices: ['vaccination', 'mobile_clinic', 'laboratory'],
    notes: 'مزرعة ألبان متوسطة الحجم'
  },
  {
    name: 'عثمان حسن المطيري',
    nationalId: '3456789012',
    birthDate: new Date('1985-12-10'),
    phone: '+966509876543',
    email: 'othman@example.com',
    village: 'حائل',
    detailedAddress: 'مزرعة المطيري، طريق الشملي',
    coordinates: {
      latitude: 27.5114,
      longitude: 41.6900
    },
    status: 'نشط',
    animals: [
      {
        animalType: 'camel',
        breed: 'مجاهيم',
        age: 5,
        gender: 'أنثى',
        healthStatus: 'سليم',
        identificationNumber: 'CM001',
        animalCount: 25
      },
      {
        animalType: 'sheep',
        breed: 'حري',
        age: 3,
        gender: 'ذكر',
        healthStatus: 'سليم',
        identificationNumber: 'SH003',
        animalCount: 200
      }
    ],
    availableServices: ['parasite_control', 'vaccination', 'mobile_clinic'],
    notes: 'مربي إبل وأغنام تقليدي'
  },
  {
    name: 'عبد المجيد أحمد الزهراني',
    nationalId: '4567890123',
    birthDate: new Date('1970-03-25'),
    phone: '+966512345678',
    email: 'abdulmajeed@example.com',
    village: 'الطائف',
    detailedAddress: 'مزرعة الزهراني، وادي محرم',
    coordinates: {
      latitude: 21.2854,
      longitude: 40.4183
    },
    status: 'نشط',
    animals: [
      {
        animalType: 'goats',
        breed: 'جبلي',
        age: 2,
        gender: 'أنثى',
        healthStatus: 'سليم',
        identificationNumber: 'GT002',
        animalCount: 90
      },
      {
        animalType: 'sheep',
        breed: 'نجدي',
        age: 4,
        gender: 'أنثى',
        healthStatus: 'سليم',
        identificationNumber: 'SH004',
        animalCount: 110
      }
    ],
    availableServices: ['parasite_control', 'vaccination', 'mobile_clinic'],
    notes: 'يطبق التعليمات بانتظام'
  },
  {
    name: 'محمد عواد الحربي',
    nationalId: '5678901234',
    birthDate: new Date('1982-08-12'),
    phone: '+966523456789',
    email: 'awaad@example.com',
    village: 'الجوف',
    detailedAddress: 'مزرعة الحربي، سكاكا',
    coordinates: {
      latitude: 29.9858,
      longitude: 40.2054
    },
    status: 'نشط',
    animals: [
      {
        animalType: 'sheep',
        breed: 'نعيمي',
        age: 3,
        gender: 'أنثى',
        healthStatus: 'سليم',
        identificationNumber: 'SH005',
        animalCount: 180
      },
      {
        animalType: 'camel',
        breed: 'صفر',
        age: 6,
        gender: 'ذكر',
        healthStatus: 'سليم',
        identificationNumber: 'CM002',
        animalCount: 15
      }
    ],
    availableServices: ['parasite_control', 'vaccination', 'mobile_clinic'],
    notes: 'مربي خبير في الأغنام'
  },
  {
    name: 'يوسف سالم القحطاني',
    nationalId: '6789012345',
    birthDate: new Date('1978-11-05'),
    phone: '+966534567890',
    email: 'yousif@example.com',
    village: 'عسير',
    detailedAddress: 'مزرعة القحطاني، أبها',
    coordinates: {
      latitude: 18.2465,
      longitude: 42.5056
    },
    status: 'نشط',
    animals: [
      {
        animalType: 'cattle',
        breed: 'محلي',
        age: 5,
        gender: 'أنثى',
        healthStatus: 'سليم',
        identificationNumber: 'CT002',
        animalCount: 30
      },
      {
        animalType: 'goats',
        breed: 'جبلي',
        age: 2,
        gender: 'أنثى',
        healthStatus: 'سليم',
        identificationNumber: 'GT003',
        animalCount: 65
      }
    ],
    availableServices: ['parasite_control', 'vaccination', 'mobile_clinic', 'laboratory'],
    notes: 'مزرعة جبلية متنوعة'
  },
  {
    name: 'محمد طاهر الشمري',
    nationalId: '7890123456',
    birthDate: new Date('1983-04-18'),
    phone: '+966545678901',
    email: 'tahir@example.com',
    village: 'الحدود الشمالية',
    detailedAddress: 'مزرعة الشمري، عرعر',
    coordinates: {
      latitude: 30.9753,
      longitude: 41.0381
    },
    status: 'نشط',
    animals: [
      {
        animalType: 'sheep',
        breed: 'عواسي',
        age: 3,
        gender: 'أنثى',
        healthStatus: 'سليم',
        identificationNumber: 'SH006',
        animalCount: 220
      }
    ],
    availableServices: ['vaccination', 'parasite_control'],
    notes: 'متخصص في تربية الأغنام العواسي'
  },
  {
    name: 'حبيب عبدالله النعيمي',
    nationalId: '8901234567',
    birthDate: new Date('1979-09-22'),
    phone: '+966556789012',
    email: 'habeeb@example.com',
    village: 'تبوك',
    detailedAddress: 'مزرعة النعيمي، تيماء',
    coordinates: {
      latitude: 27.6260,
      longitude: 38.5521
    },
    status: 'نشط',
    animals: [
      {
        animalType: 'goats',
        breed: 'شامي',
        age: 4,
        gender: 'أنثى',
        healthStatus: 'سليم',
        identificationNumber: 'GT004',
        animalCount: 95
      },
      {
        animalType: 'sheep',
        breed: 'نجدي',
        age: 2,
        gender: 'ذكر',
        healthStatus: 'سليم',
        identificationNumber: 'SH007',
        animalCount: 140
      }
    ],
    availableServices: ['vaccination', 'mobile_clinic', 'laboratory'],
    notes: 'يهتم بالتحصينات الدورية'
  }
];

// Sample Holding Codes
const sampleHoldingCodes = [
  {
    code: 'HC001',
    village: 'الرياض',
    description: 'رمز حيازة مزرعة الأحمد',
    isActive: true
  },
  {
    code: 'HC002',
    village: 'جدة',
    description: 'رمز حيازة مزرعة الشمري',
    isActive: true
  },
  {
    code: 'HC003',
    village: 'حائل',
    description: 'رمز حيازة مزرعة المطيري',
    isActive: true
  },
  {
    code: 'HC004',
    village: 'الطائف',
    description: 'رمز حيازة مزرعة الزهراني',
    isActive: true
  },
  {
    code: 'HC005',
    village: 'الجوف',
    description: 'رمز حيازة مزرعة الحربي',
    isActive: true
  },
  {
    code: 'HC006',
    village: 'عسير',
    description: 'رمز حيازة مزرعة القحطاني',
    isActive: true
  },
  {
    code: 'HC007',
    village: 'الحدود الشمالية',
    description: 'رمز حيازة مزرعة الشمري',
    isActive: true
  },
  {
    code: 'HC008',
    village: 'تبوك',
    description: 'رمز حيازة مزرعة النعيمي',
    isActive: true
  },
  {
    code: 'HC009',
    village: 'البريكه',
    description: 'رمز حيازة مزرعة البريكه',
    isActive: true
  }
];

// Sample Parasite Control Records
const sampleParasiteControl = [
  {
    serialNo: 'PC001',
    date: new Date('2024-09-07'),
    herdLocation: 'مزرعة الأحمد، طريق الخرج',
    coordinates: { latitude: 24.7136, longitude: 46.6753 },
    supervisor: 'د. محمد علي الأحمد',
    vehicleNo: 'P1',
    herdCounts: {
      sheep: { total: 150, young: 45, female: 90, treated: 150 },
      goats: { total: 80, young: 20, female: 50, treated: 80 },
      camel: { total: 0, young: 0, female: 0, treated: 0 },
      cattle: { total: 0, young: 0, female: 0, treated: 0 },
      horse: { total: 0, young: 0, female: 0, treated: 0 }
    },
    insecticide: {
      type: 'Cyperdip 10%',
      method: 'Pour on',
      volumeMl: 2300,
      status: 'Sprayed',
      category: 'Pour-on'
    },
    animalBarnSizeSqM: 200,
    breedingSites: 'Not Available',
    herdHealthStatus: 'Healthy',
    complyingToInstructions: 'Comply',
    request: {
      date: new Date('2024-09-05'),
      situation: 'Closed',
      fulfillingDate: new Date('2024-09-07')
    },
    remarks: 'Parasite Control Activity - تم الرش بنجاح'
  },
  {
    serialNo: 'PC002',
    date: new Date('2024-09-07'),
    herdLocation: 'مزرعة السعد، بريدة',
    coordinates: { latitude: 26.3260, longitude: 43.9750 },
    supervisor: 'د. نورا سعد الحربي',
    vehicleNo: 'P2',
    herdCounts: {
      sheep: { total: 120, young: 30, female: 75, treated: 0 },
      goats: { total: 0, young: 0, female: 0, treated: 0 },
      camel: { total: 0, young: 0, female: 0, treated: 0 },
      cattle: { total: 45, young: 10, female: 30, treated: 0 },
      horse: { total: 0, young: 0, female: 0, treated: 0 }
    },
    insecticide: {
      type: 'Ultra-Pour 1%',
      method: 'Pour on',
      volumeMl: 1650,
      status: 'Not Sprayed',
      category: 'Pour-on'
    },
    animalBarnSizeSqM: 150,
    breedingSites: 'Not Available',
    parasiteControlVolume: 0,
    parasiteControlStatus: 'Pending',
    herdHealthStatus: 'Healthy',
    complyingToInstructions: 'Comply',
    request: {
      date: new Date('2024-09-05'),
      situation: 'Closed',
      fulfillingDate: new Date('2024-09-07')
    },
    remarks: 'Parasite Control Activity - في انتظار الرش'
  }
];

// Sample Vaccination Records
const sampleVaccination = [
  {
    serialNo: 'V001',
    date: new Date('2024-09-07'),
    farmLocation: 'مزرعة الشمري، عرعر',
    coordinates: { latitude: 30.9753, longitude: 41.0381 },
    supervisor: 'M.Tahir',
    team: 'V1',
    vehicleNo: 'VAC001',
    vaccineType: 'HS',
    vaccineCategory: 'Preventive',
    herdCounts: {
      sheep: { total: 220, young: 60, female: 140, vaccinated: 220 },
      goats: { total: 0, young: 0, female: 0, vaccinated: 0 },
      camel: { total: 0, young: 0, female: 0, vaccinated: 0 },
      cattle: { total: 0, young: 0, female: 0, vaccinated: 0 },
      horse: { total: 0, young: 0, female: 0, vaccinated: 0 }
    },
    herdHealth: 'Healthy',
    animalsHandling: 'Easy',
    labours: 'Available',
    reachableLocation: 'Easy',
    request: {
      date: new Date('2024-09-05'),
      situation: 'Closed',
      fulfillingDate: new Date('2024-09-07')
    },
    remarks: 'HS Vaccination Activity - تحصين ضد الحمى النزفية'
  },
  {
    serialNo: 'V002',
    date: new Date('2024-09-07'),
    farmLocation: 'مزرعة النعيمي، تيماء',
    coordinates: { latitude: 27.6260, longitude: 38.5521 },
    supervisor: 'Habeeb',
    team: 'V2',
    vehicleNo: 'VAC002',
    vaccineType: 'SG-Pox',
    vaccineCategory: 'Preventive',
    herdCounts: {
      sheep: { total: 140, young: 35, female: 85, vaccinated: 140 },
      goats: { total: 95, young: 25, female: 60, vaccinated: 95 },
      camel: { total: 0, young: 0, female: 0, vaccinated: 0 },
      cattle: { total: 0, young: 0, female: 0, vaccinated: 0 },
      horse: { total: 0, young: 0, female: 0, vaccinated: 0 }
    },
    herdHealth: 'Healthy',
    animalsHandling: 'Easy',
    labours: 'Available',
    reachableLocation: 'Easy',
    request: {
      date: new Date('2024-09-05'),
      situation: 'Closed',
      fulfillingDate: new Date('2024-09-07')
    },
    remarks: 'SG-Pox Vaccination Activity - تحصين ضد جدري الأغنام والماعز'
  }
];

// Sample Mobile Clinic Records
const sampleMobileClinics = [
  {
    serialNo: 'MC001',
    date: new Date('2024-09-12'),
    farmLocation: 'مزرعة القحطاني، أبها',
    coordinates: { latitude: 18.2465, longitude: 42.5056 },
    supervisor: 'Osama',
    vehicleNo: 'C1',
    animalCounts: {
      sheep: 0,
      goats: 65,
      camel: 0,
      cattle: 30,
      horse: 0
    },
    diagnosis: 'فحص سريري روتيني للماشية والماعز',
    interventionCategory: 'Routine',
    interventionCategories: ['Routine'],
    treatment: 'فحص عام وإعطاء الفيتامينات اللازمة',
    medicationsUsed: [
      {
        name: 'فيتامين أ د 3 هـ',
        dosage: '5 مل',
        quantity: 20,
        route: 'Intramuscular'
      }
    ],
    request: {
      date: new Date('2024-09-10'),
      situation: 'Closed',
      fulfillingDate: new Date('2024-09-12')
    },
    followUpRequired: false,
    remarks: 'Monitoring & Treatment - فحص دوري ناجح'
  },
  {
    serialNo: 'MC002',
    date: new Date('2024-09-13'),
    farmLocation: 'مزرعة الزهراني، وادي محرم',
    coordinates: { latitude: 21.2854, longitude: 40.4183 },
    supervisor: 'Kandil',
    vehicleNo: 'C2',
    animalCounts: {
      sheep: 110,
      goats: 90,
      camel: 0,
      cattle: 0,
      horse: 0
    },
    diagnosis: 'عملية جراحية طارئة لإزالة جسم غريب',
    interventionCategory: 'Emergency',
    interventionCategories: ['Emergency'],
    treatment: 'عملية جراحية ناجحة مع المضادات الحيوية',
    medicationsUsed: [
      {
        name: 'بنسيلين',
        dosage: '10 مل',
        quantity: 5,
        route: 'Intramuscular'
      },
      {
        name: 'مسكن الألم',
        dosage: '3 مل',
        quantity: 3,
        route: 'Subcutaneous'
      }
    ],
    request: {
      date: new Date('2024-09-13'),
      situation: 'Closed',
      fulfillingDate: new Date('2024-09-13')
    },
    followUpRequired: true,
    followUpDate: new Date('2024-09-20'),
    remarks: 'Monitoring & Treatment - حالة طارئة تم التعامل معها'
  }
];

// Sample Laboratory Records
const sampleLaboratory = [
  {
    sampleCode: 'LAB001',
    sampleType: 'Blood',
    collector: 'Osama',
    date: new Date('2024-09-12'),
    farmLocation: 'مزرعة القحطاني، أبها',
    coordinates: { latitude: 18.2465, longitude: 42.5056 },
    speciesCounts: {
      sheep: 0,
      goats: 10,
      camel: 0,
      cattle: 5,
      horse: 0
    },
    testType: 'Serology',
    testResults: [
      {
        parameter: 'Brucella Ab',
        result: 'Negative',
        normalRange: 'Negative',
        status: 'Normal',
        unit: 'IU/ml'
      }
    ],
    positiveCases: 0,
    negativeCases: 15,
    testStatus: 'Completed',
    priority: 'Normal',
    expectedCompletionDate: new Date('2024-09-15'),
    actualCompletionDate: new Date('2024-09-14'),
    laboratoryTechnician: 'د. محمد الأحمد',
    equipment: 'ELISA Reader',
    remarks: 'فحص مصلي للبروسيلا - النتائج سليمة'
  },
  {
    sampleCode: 'LAB002',
    sampleType: 'Feces',
    collector: 'Kandil',
    date: new Date('2024-09-13'),
    farmLocation: 'مزرعة الزهراني، وادي محرم',
    coordinates: { latitude: 21.2854, longitude: 40.4183 },
    speciesCounts: {
      sheep: 20,
      goats: 15,
      camel: 0,
      cattle: 0,
      horse: 0
    },
    testType: 'Parasitology',
    testResults: [
      {
        parameter: 'Coccidia',
        result: 'Positive',
        normalRange: 'Negative',
        status: 'Abnormal',
        unit: 'oocysts/g'
      }
    ],
    positiveCases: 8,
    negativeCases: 27,
    testStatus: 'Completed',
    priority: 'High',
    expectedCompletionDate: new Date('2024-09-16'),
    actualCompletionDate: new Date('2024-09-15'),
    laboratoryTechnician: 'د. فاطمة السعد',
    equipment: 'Microscope',
    remarks: 'فحص طفيليات - وجود كوكسيديا يتطلب علاج'
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ahcp_database');
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await User.deleteMany({});
    await Client.deleteMany({});
    await HoldingCode.deleteMany({});
    await ParasiteControl.deleteMany({});
    await Vaccination.deleteMany({});
    await MobileClinic.deleteMany({});
    await EquineHealth.deleteMany({});
    await Laboratory.deleteMany({});

    // Create users
    console.log('👥 Creating sample users...');
    const createdUsers = [];
    
    for (const userData of sampleUsers) {
      const user = new User(userData);
      await user.save();
      createdUsers.push(user);
      console.log(`   ✓ Created user: ${user.name} (${user.email})`);
    }

    // Create clients
    console.log('🏢 Creating sample clients...');
    const adminUser = createdUsers.find(user => user.role === 'super_admin');
    const createdClients = [];
    
    for (const clientData of sampleClients) {
      const client = new Client({
        ...clientData,
        createdBy: adminUser._id
      });
      await client.save();
      createdClients.push(client);
      console.log(`   ✓ Created client: ${client.name}`);
    }

    // Create holding codes
    console.log('🏷️ Creating sample holding codes...');
    const createdHoldingCodes = [];
    
    for (const holdingCodeData of sampleHoldingCodes) {
      const holdingCode = new HoldingCode({
        ...holdingCodeData,
        createdBy: adminUser._id
      });
      await holdingCode.save();
      createdHoldingCodes.push(holdingCode);
      console.log(`   ✓ Created holding code: ${holdingCode.code} (${holdingCode.village})`);
    }

    // Create parasite control records
    console.log('🦠 Creating parasite control records...');
    for (let i = 0; i < sampleParasiteControl.length; i++) {
      const recordData = sampleParasiteControl[i];
      const client = createdClients[i]; // Link to corresponding client
      
      const holdingCode = createdHoldingCodes[i % createdHoldingCodes.length]; // Cycle through holding codes
      
      const record = new ParasiteControl({
        ...recordData,
        client: client._id,
        holdingCode: holdingCode._id,
        createdBy: adminUser._id
      });
      await record.save();
      console.log(`   ✓ Created parasite control record: ${record.serialNo}`);
    }

    // Create vaccination records
    console.log('💉 Creating vaccination records...');
    for (let i = 0; i < sampleVaccination.length; i++) {
      const recordData = sampleVaccination[i];
      const client = createdClients[i + 6]; // Link to different clients
      const holdingCode = createdHoldingCodes[(i + 2) % createdHoldingCodes.length]; // Different holding codes
      
      const record = new Vaccination({
        ...recordData,
        client: client._id,
        holdingCode: holdingCode._id,
        createdBy: adminUser._id
      });
      await record.save();
      console.log(`   ✓ Created vaccination record: ${record.serialNo}`);
    }

    // Create mobile clinic records
    console.log('🚑 Creating mobile clinic records...');
    for (let i = 0; i < sampleMobileClinics.length; i++) {
      const recordData = sampleMobileClinics[i];
      const client = createdClients[i + 5]; // Link to different clients
      const holdingCode = createdHoldingCodes[(i + 4) % createdHoldingCodes.length]; // Different holding codes
      
      const record = new MobileClinic({
        ...recordData,
        client: client._id,
        holdingCode: holdingCode._id,
        createdBy: adminUser._id
      });
      await record.save();
      console.log(`   ✓ Created mobile clinic record: ${record.serialNo}`);
    }

    // Create laboratory records
    console.log('🔬 Creating laboratory records...');
    for (let i = 0; i < sampleLaboratory.length; i++) {
      const recordData = sampleLaboratory[i];
      const client = createdClients[i + 5]; // Link to same clients as mobile clinics
      const holdingCode = createdHoldingCodes[(i + 6) % createdHoldingCodes.length]; // Different holding codes
      
      const record = new Laboratory({
        ...recordData,
        client: client._id,
        holdingCode: holdingCode._id,
        createdBy: adminUser._id
      });
      await record.save();
      console.log(`   ✓ Created laboratory record: ${record.sampleCode}`);
    }

    console.log('\n🎉 Database seeded successfully!');
    console.log('\n📋 Sample Login Credentials:');
    console.log('================================');
    
    sampleUsers.forEach(user => {
      console.log(`${user.name}:`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Password: ${user.password}`);
      console.log(`  Role: ${user.role}`);
      console.log('');
    });

    console.log('📊 Database Statistics:');
    console.log('======================');
    console.log(`👥 Users: ${createdUsers.length}`);
    console.log(`🏢 Clients: ${createdClients.length}`);
    console.log(`🦠 Parasite Control Records: ${sampleParasiteControl.length}`);
    console.log(`💉 Vaccination Records: ${sampleVaccination.length}`);
    console.log(`🚑 Mobile Clinic Records: ${sampleMobileClinics.length}`);
    console.log(`🔬 Laboratory Records: ${sampleLaboratory.length}`);
    console.log('');
    console.log('🚀 You can now start the server and login with these credentials');
    console.log('📚 API Documentation: https://ahcp-backend-production.up.railway.app/api-docs');
    console.log('🏥 Health Check: http://https://ahcp-backend.vercel.app/health');
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run seeding
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
