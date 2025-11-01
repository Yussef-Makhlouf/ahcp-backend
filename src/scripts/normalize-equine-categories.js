require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const EquineHealth = require('../models/EquineHealth');
const {
  normalizeEquineInterventionCategory,
  EQUINE_INTERVENTION_CATEGORY_OPTIONS
} = require('../utils/interventionCategories');

const DEFAULT_URI = 'mongodb://localhost:27017/ahcp_database';

const normalizeRecords = async () => {
  const uri = process.env.MONGODB_URI || DEFAULT_URI;
  console.log(`📡 Connecting to MongoDB at ${uri}`);

  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  try {
    const records = await EquineHealth.find({}, { _id: 1, interventionCategory: 1 });
    console.log(`🔍 Found ${records.length} equine health records to inspect`);

    const bulkUpdates = [];
    let alreadyNormalized = 0;

    records.forEach((record) => {
      const normalized = normalizeEquineInterventionCategory(
        record.interventionCategory,
        { fallback: 'Clinical Examination' }
      );

      if (!normalized) {
        bulkUpdates.push({
          updateOne: {
            filter: { _id: record._id },
            update: { $set: { interventionCategory: 'Clinical Examination' } }
          }
        });
        return;
      }

      if (normalized !== record.interventionCategory) {
        bulkUpdates.push({
          updateOne: {
            filter: { _id: record._id },
            update: { $set: { interventionCategory: normalized } }
          }
        });
      } else if (EQUINE_INTERVENTION_CATEGORY_OPTIONS.includes(normalized)) {
        alreadyNormalized += 1;
      }
    });

    if (bulkUpdates.length === 0) {
      console.log('✅ All records already use the normalized intervention categories');
    } else {
      const result = await EquineHealth.bulkWrite(bulkUpdates);
      console.log(`✨ Normalized ${result.modifiedCount} records (${alreadyNormalized} were already normalized)`);
    }
  } catch (error) {
    console.error('❌ Failed to normalize intervention categories:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 MongoDB connection closed');
  }
};

normalizeRecords();

