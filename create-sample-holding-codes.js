const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const HoldingCode = require('../ahcp-backend/src/models/HoldingCode');
const User = require('../ahcp-backend/src/models/User');

// Sample holding codes data
const sampleHoldingCodes = [
  {
    code: 'HC001',
    village: 'الرياض',
    description: 'رمز حيازة لمدينة الرياض',
    isActive: true
  },
  {
    code: 'HC002', 
    village: 'جدة',
    description: 'رمز حيازة لمدينة جدة',
    isActive: true
  },
  {
    code: 'HC003',
    village: 'الدمام',
    description: 'رمز حيازة لمدينة الدمام',
    isActive: true
  },
  {
    code: 'HC004',
    village: 'مكة المكرمة',
    description: 'رمز حيازة لمدينة مكة المكرمة',
    isActive: true
  },
  {
    code: 'HC005',
    village: 'المدينة المنورة',
    description: 'رمز حيازة لمدينة المدينة المنورة',
    isActive: true
  },
  {
    code: 'HC006',
    village: 'الطائف',
    description: 'رمز حيازة لمدينة الطائف',
    isActive: true
  },
  {
    code: 'HC007',
    village: 'بريدة',
    description: 'رمز حيازة لمدينة بريدة',
    isActive: true
  },
  {
    code: 'HC008',
    village: 'تبوك',
    description: 'رمز حيازة لمدينة تبوك',
    isActive: true
  },
  {
    code: 'HC009',
    village: 'حائل',
    description: 'رمز حيازة لمدينة حائل',
    isActive: true
  },
  {
    code: 'HC010',
    village: 'الخبر',
    description: 'رمز حيازة لمدينة الخبر',
    isActive: true
  }
];

async function createSampleHoldingCodes() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ahcp';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find or create a default user for holding codes
    let defaultUser = await User.findOne({ role: 'admin' });
    if (!defaultUser) {
      defaultUser = await User.findOne();
    }
    
    if (!defaultUser) {
      console.log('❌ No users found. Please create a user first.');
      return;
    }

    console.log(`👤 Using user: ${defaultUser.name} (${defaultUser.email})`);

    // Clear existing holding codes (optional)
    const existingCount = await HoldingCode.countDocuments();
    if (existingCount > 0) {
      console.log(`🗑️ Found ${existingCount} existing holding codes. Clearing...`);
      await HoldingCode.deleteMany({});
    }

    // Create sample holding codes
    console.log('📝 Creating sample holding codes...');
    
    for (const holdingCodeData of sampleHoldingCodes) {
      try {
        const holdingCode = new HoldingCode({
          ...holdingCodeData,
          createdBy: defaultUser._id
        });
        
        await holdingCode.save();
        console.log(`✅ Created holding code: ${holdingCode.code} for ${holdingCode.village}`);
      } catch (error) {
        if (error.code === 'DUPLICATE_VILLAGE_HOLDING_CODE') {
          console.log(`⚠️ Village ${holdingCodeData.village} already has a holding code, skipping...`);
        } else {
          console.error(`❌ Error creating holding code ${holdingCodeData.code}:`, error.message);
        }
      }
    }

    // Verify creation
    const totalHoldingCodes = await HoldingCode.countDocuments();
    console.log(`\n📊 Total holding codes created: ${totalHoldingCodes}`);
    
    // List all created holding codes
    const allHoldingCodes = await HoldingCode.find({}).populate('createdBy', 'name email');
    console.log('\n📋 Created holding codes:');
    allHoldingCodes.forEach(hc => {
      console.log(`  - ${hc.code} (${hc.village}) - ${hc.isActive ? 'Active' : 'Inactive'}`);
    });

    console.log('\n✅ Sample holding codes created successfully!');
    console.log('🌐 You can now test the holding code functionality in the dashboard.');

  } catch (error) {
    console.error('❌ Error creating sample holding codes:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  createSampleHoldingCodes();
}

module.exports = { createSampleHoldingCodes };
