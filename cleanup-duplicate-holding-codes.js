const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const HoldingCode = require('../ahcp-backend/src/models/HoldingCode');

async function cleanupDuplicateHoldingCodes() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ahcp';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    console.log('🔍 Analyzing holding codes for duplicates...');

    // Find all holding codes
    const allHoldingCodes = await HoldingCode.find({}).sort({ code: 1, village: 1 });
    console.log(`📊 Total holding codes found: ${allHoldingCodes.length}`);

    // Group by code to find duplicates
    const codeGroups = {};
    allHoldingCodes.forEach(hc => {
      if (!codeGroups[hc.code]) {
        codeGroups[hc.code] = [];
      }
      codeGroups[hc.code].push(hc);
    });

    // Find codes with multiple entries
    const duplicateCodes = Object.keys(codeGroups).filter(code => codeGroups[code].length > 1);
    
    if (duplicateCodes.length === 0) {
      console.log('✅ No duplicate codes found!');
      return;
    }

    console.log(`⚠️ Found ${duplicateCodes.length} codes with duplicates:`);
    
    for (const code of duplicateCodes) {
      const duplicates = codeGroups[code];
      console.log(`\n📋 Code: ${code} (${duplicates.length} entries)`);
      
      duplicates.forEach((hc, index) => {
        console.log(`  ${index + 1}. Village: ${hc.village}, ID: ${hc._id}, Active: ${hc.isActive}`);
      });

      // Keep the first active one, deactivate others
      const activeOnes = duplicates.filter(hc => hc.isActive);
      const inactiveOnes = duplicates.filter(hc => !hc.isActive);
      
      if (activeOnes.length > 1) {
        console.log(`🔄 Multiple active codes found for ${code}, keeping the first one...`);
        
        // Keep the first one, deactivate the rest
        for (let i = 1; i < activeOnes.length; i++) {
          const hc = activeOnes[i];
          hc.isActive = false;
          hc.description = (hc.description || '') + ' [DEACTIVATED - Duplicate]';
          await hc.save();
          console.log(`  ✅ Deactivated duplicate: ${hc._id} for village ${hc.village}`);
        }
      }
    }

    // Also check for village duplicates (should be unique per village)
    console.log('\n🔍 Checking for village duplicates...');
    const villageGroups = {};
    allHoldingCodes.forEach(hc => {
      if (!villageGroups[hc.village]) {
        villageGroups[hc.village] = [];
      }
      villageGroups[hc.village].push(hc);
    });

    const duplicateVillages = Object.keys(villageGroups).filter(village => villageGroups[village].length > 1);
    
    if (duplicateVillages.length > 0) {
      console.log(`⚠️ Found ${duplicateVillages.length} villages with multiple codes:`);
      
      for (const village of duplicateVillages) {
        const codes = villageGroups[village];
        console.log(`\n📋 Village: ${village} (${codes.length} codes)`);
        
        codes.forEach((hc, index) => {
          console.log(`  ${index + 1}. Code: ${hc.code}, ID: ${hc._id}, Active: ${hc.isActive}`);
        });

        // Keep the first active one, deactivate others
        const activeCodes = codes.filter(hc => hc.isActive);
        if (activeCodes.length > 1) {
          console.log(`🔄 Multiple active codes for village ${village}, keeping the first one...`);
          
          for (let i = 1; i < activeCodes.length; i++) {
            const hc = activeCodes[i];
            hc.isActive = false;
            hc.description = (hc.description || '') + ' [DEACTIVATED - Village Duplicate]';
            await hc.save();
            console.log(`  ✅ Deactivated duplicate: ${hc._id} with code ${hc.code}`);
          }
        }
      }
    } else {
      console.log('✅ No village duplicates found!');
    }

    // Final statistics
    const finalCount = await HoldingCode.countDocuments({ isActive: true });
    const inactiveCount = await HoldingCode.countDocuments({ isActive: false });
    
    console.log('\n📊 Final Statistics:');
    console.log(`  Active holding codes: ${finalCount}`);
    console.log(`  Inactive holding codes: ${inactiveCount}`);
    console.log(`  Total holding codes: ${finalCount + inactiveCount}`);

    console.log('\n✅ Cleanup completed successfully!');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  cleanupDuplicateHoldingCodes();
}

module.exports = { cleanupDuplicateHoldingCodes };
