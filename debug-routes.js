#!/usr/bin/env node

// Debug script to check route loading
console.log('🔍 Checking route loading...');

try {
  console.log('Loading mobileClinicsRoutes...');
  const mobileClinicsRoutes = require('./src/routes/mobileClinics');
  console.log('✅ mobileClinicsRoutes loaded successfully');
  console.log('Routes in mobileClinicsRoutes:', mobileClinicsRoutes.stack ? mobileClinicsRoutes.stack.length : 'No stack');
} catch (error) {
  console.log('❌ Error loading mobileClinicsRoutes:', error.message);
}

try {
  console.log('Loading clientsRoutes...');
  const clientsRoutes = require('./src/routes/clients');
  console.log('✅ clientsRoutes loaded successfully');
  console.log('Routes in clientsRoutes:', clientsRoutes.stack ? clientsRoutes.stack.length : 'No stack');
} catch (error) {
  console.log('❌ Error loading clientsRoutes:', error.message);
}

try {
  console.log('Loading vaccinationRoutes...');
  const vaccinationRoutes = require('./src/routes/vaccination');
  console.log('✅ vaccinationRoutes loaded successfully');
  console.log('Routes in vaccinationRoutes:', vaccinationRoutes.stack ? vaccinationRoutes.stack.length : 'No stack');
} catch (error) {
  console.log('❌ Error loading vaccinationRoutes:', error.message);
}

console.log('🔍 Route loading check complete');
