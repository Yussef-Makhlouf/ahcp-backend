const mongoose = require('mongoose');
const DropdownList = require('./src/models/DropdownList');

// MongoDB connection string - update this to match your setup
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ahcp';

async function updateDropdownActiveStatus() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    console.log('🔍 Checking existing dropdown records...');
    
    // Count records without isActive field
    const recordsWithoutActive = await DropdownList.countDocuments({
      isActive: { $exists: false }
    });
    
    console.log(`📊 Found ${recordsWithoutActive} records without isActive field`);
    
    if (recordsWithoutActive > 0) {
      console.log('🔄 Updating records to set isActive: true...');
      
      const result = await DropdownList.updateMany(
        { isActive: { $exists: false } },
        { $set: { isActive: true } }
      );
      
      console.log(`✅ Updated ${result.modifiedCount} records`);
    } else {
      console.log('✅ All records already have isActive field');
    }
    
    // Verify the update
    const totalRecords = await DropdownList.countDocuments({});
    const activeRecords = await DropdownList.countDocuments({ isActive: true });
    const inactiveRecords = await DropdownList.countDocuments({ isActive: false });
    
    console.log('\n📈 Final Status:');
    console.log(`   Total records: ${totalRecords}`);
    console.log(`   Active records: ${activeRecords}`);
    console.log(`   Inactive records: ${inactiveRecords}`);
    
    console.log('\n🎉 Update completed successfully!');
    
  } catch (error) {
    console.error('❌ Error updating dropdown active status:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the update
updateDropdownActiveStatus();
