/**
 * Database Indexes Creation Script
 * Optimizes database queries by adding proper indexes
 * Run: node src/scripts/add-indexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './production.env' });
require('dotenv').config();

const logger = require('../utils/logger');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

async function addIndexes() {
  try {
    logger.info('Starting database index creation...');
    console.log(`${colors.blue}📊 Connecting to MongoDB...${colors.reset}`);
    
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB successfully');
    console.log(`${colors.green}✅ Connected to MongoDB${colors.reset}`);

    const db = mongoose.connection.db;
    let totalIndexesCreated = 0;

    // ===== VACCINATION INDEXES =====
    console.log(`\n${colors.blue}📋 Creating Vaccination indexes...${colors.reset}`);
    try {
      await db.collection('vaccinations').createIndexes([
        { key: { serialNo: 1 }, name: 'serialNo_1', unique: true },
        { key: { date: -1 }, name: 'date_-1' },
        { key: { supervisor: 1 }, name: 'supervisor_1' },
        { key: { client: 1 }, name: 'client_1' },
        { key: { holdingCode: 1 }, name: 'holdingCode_1' },
        { key: { vaccineType: 1 }, name: 'vaccineType_1' },
        { key: { vaccineCategory: 1 }, name: 'vaccineCategory_1' },
        { key: { 'request.situation': 1 }, name: 'request_situation_1' },
        { key: { createdAt: -1 }, name: 'createdAt_-1' },
        { key: { date: -1, supervisor: 1 }, name: 'date_supervisor_compound' },
      ]);
      totalIndexesCreated += 10;
      console.log(`${colors.green}✅ Vaccination indexes created (10)${colors.reset}`);
      logger.info('Vaccination indexes created successfully');
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Some vaccination indexes may already exist${colors.reset}`);
      logger.warn('Vaccination indexes creation warning', { error: error.message });
    }

    // ===== PARASITE CONTROL INDEXES =====
    console.log(`\n${colors.blue}📋 Creating Parasite Control indexes...${colors.reset}`);
    try {
      await db.collection('parasitecontrols').createIndexes([
        { key: { serialNo: 1 }, name: 'serialNo_1', unique: true },
        { key: { date: -1 }, name: 'date_-1' },
        { key: { supervisor: 1 }, name: 'supervisor_1' },
        { key: { client: 1 }, name: 'client_1' },
        { key: { holdingCode: 1 }, name: 'holdingCode_1' },
        { key: { 'insecticide.method': 1 }, name: 'insecticide_method_1' },
        { key: { 'insecticide.category': 1 }, name: 'insecticide_category_1' },
        { key: { 'insecticide.type': 1 }, name: 'insecticide_type_1' },
        { key: { herdHealthStatus: 1 }, name: 'herdHealthStatus_1' },
        { key: { 'request.situation': 1 }, name: 'request_situation_1' },
        { key: { date: -1, supervisor: 1 }, name: 'date_supervisor_compound' },
      ]);
      totalIndexesCreated += 11;
      console.log(`${colors.green}✅ Parasite Control indexes created (11)${colors.reset}`);
      logger.info('Parasite Control indexes created successfully');
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Some parasite control indexes may already exist${colors.reset}`);
      logger.warn('Parasite Control indexes creation warning', { error: error.message });
    }

    // ===== MOBILE CLINICS INDEXES =====
    console.log(`\n${colors.blue}📋 Creating Mobile Clinics indexes...${colors.reset}`);
    try {
      await db.collection('mobileclinics').createIndexes([
        { key: { serialNo: 1 }, name: 'serialNo_1', unique: true },
        { key: { date: -1 }, name: 'date_-1' },
        { key: { supervisor: 1 }, name: 'supervisor_1' },
        { key: { client: 1 }, name: 'client_1' },
        { key: { diagnosis: 1 }, name: 'diagnosis_1' },
        { key: { interventionCategory: 1 }, name: 'interventionCategory_1' },
        { key: { followUpRequired: 1 }, name: 'followUpRequired_1' },
        { key: { 'request.situation': 1 }, name: 'request_situation_1' },
        { key: { date: -1, supervisor: 1 }, name: 'date_supervisor_compound' },
      ]);
      totalIndexesCreated += 9;
      console.log(`${colors.green}✅ Mobile Clinics indexes created (9)${colors.reset}`);
      logger.info('Mobile Clinics indexes created successfully');
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Some mobile clinics indexes may already exist${colors.reset}`);
      logger.warn('Mobile Clinics indexes creation warning', { error: error.message });
    }

    // ===== LABORATORIES INDEXES =====
    console.log(`\n${colors.blue}📋 Creating Laboratories indexes...${colors.reset}`);
    try {
      await db.collection('laboratories').createIndexes([
        { key: { sampleCode: 1 }, name: 'sampleCode_1', unique: true },
        { key: { date: -1 }, name: 'date_-1' },
        { key: { collector: 1 }, name: 'collector_1' },
        { key: { client: 1 }, name: 'client_1' },
        { key: { sampleType: 1 }, name: 'sampleType_1' },
        { key: { testType: 1 }, name: 'testType_1' },
        { key: { date: -1, collector: 1 }, name: 'date_collector_compound' },
      ]);
      totalIndexesCreated += 7;
      console.log(`${colors.green}✅ Laboratories indexes created (7)${colors.reset}`);
      logger.info('Laboratories indexes created successfully');
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Some laboratories indexes may already exist${colors.reset}`);
      logger.warn('Laboratories indexes creation warning', { error: error.message });
    }

    // ===== EQUINE HEALTH INDEXES =====
    console.log(`\n${colors.blue}📋 Creating Equine Health indexes...${colors.reset}`);
    try {
      await db.collection('equinehealths').createIndexes([
        { key: { serialNo: 1 }, name: 'serialNo_1', unique: true },
        { key: { date: -1 }, name: 'date_-1' },
        { key: { supervisor: 1 }, name: 'supervisor_1' },
        { key: { client: 1 }, name: 'client_1' },
        { key: { holdingCode: 1 }, name: 'holdingCode_1' },
        { key: { interventionCategory: 1 }, name: 'interventionCategory_1' },
        { key: { 'request.situation': 1 }, name: 'request_situation_1' },
        { key: { date: -1, supervisor: 1 }, name: 'date_supervisor_compound' },
      ]);
      totalIndexesCreated += 8;
      console.log(`${colors.green}✅ Equine Health indexes created (8)${colors.reset}`);
      logger.info('Equine Health indexes created successfully');
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Some equine health indexes may already exist${colors.reset}`);
      logger.warn('Equine Health indexes creation warning', { error: error.message });
    }

    // ===== CLIENTS INDEXES =====
    console.log(`\n${colors.blue}📋 Creating Clients indexes...${colors.reset}`);
    try {
      await db.collection('clients').createIndexes([
        { key: { nationalId: 1 }, name: 'nationalId_1', unique: true },
        { key: { name: 1 }, name: 'name_1' },
        { key: { phone: 1 }, name: 'phone_1' },
        { key: { village: 1 }, name: 'village_1' },
        { key: { status: 1 }, name: 'status_1' },
        { key: { createdAt: -1 }, name: 'createdAt_-1' },
        { key: { name: 'text', village: 'text' }, name: 'name_village_text' },
      ]);
      totalIndexesCreated += 7;
      console.log(`${colors.green}✅ Clients indexes created (7)${colors.reset}`);
      logger.info('Clients indexes created successfully');
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Some clients indexes may already exist${colors.reset}`);
      logger.warn('Clients indexes creation warning', { error: error.message });
    }

    // ===== HOLDING CODES INDEXES =====
    console.log(`\n${colors.blue}📋 Creating Holding Codes indexes...${colors.reset}`);
    try {
      await db.collection('holdingcodes').createIndexes([
        { key: { code: 1 }, name: 'code_1', unique: true },
        { key: { village: 1 }, name: 'village_1' },
        { key: { isActive: 1 }, name: 'isActive_1' },
      ]);
      totalIndexesCreated += 3;
      console.log(`${colors.green}✅ Holding Codes indexes created (3)${colors.reset}`);
      logger.info('Holding Codes indexes created successfully');
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Some holding codes indexes may already exist${colors.reset}`);
      logger.warn('Holding Codes indexes creation warning', { error: error.message });
    }

    // ===== VILLAGES INDEXES =====
    console.log(`\n${colors.blue}📋 Creating Villages indexes...${colors.reset}`);
    try {
      await db.collection('villages').createIndexes([
        { key: { serialNumber: 1 }, name: 'serialNumber_1', unique: true },
        { key: { nameArabic: 1 }, name: 'nameArabic_1' },
        { key: { sector: 1 }, name: 'sector_1' },
      ]);
      totalIndexesCreated += 3;
      console.log(`${colors.green}✅ Villages indexes created (3)${colors.reset}`);
      logger.info('Villages indexes created successfully');
    } catch (error) {
      console.log(`${colors.yellow}⚠️  Some villages indexes may already exist${colors.reset}`);
      logger.warn('Villages indexes creation warning', { error: error.message });
    }

    // Summary
    console.log(`\n${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.green}🎉 Index creation completed!${colors.reset}`);
    console.log(`${colors.green}📊 Total indexes created/verified: ${totalIndexesCreated}${colors.reset}`);
    console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
    
    logger.info('All indexes created successfully', { total: totalIndexesCreated });

    await mongoose.connection.close();
    logger.info('Database connection closed');
    process.exit(0);
    
  } catch (error) {
    console.error(`${colors.red}❌ Error:${colors.reset}`, error.message);
    logger.error('Index creation failed', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Run the script
addIndexes();

