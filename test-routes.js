// Test script to check if auth routes are loading properly
console.log('Testing route loading...');

try {
  console.log('Loading auth routes...');
  const authRoutes = require('./src/routes/auth');
  console.log('✅ Auth routes loaded successfully');
  console.log('Auth routes type:', typeof authRoutes);
  console.log('Auth routes:', authRoutes);
  
  // Check if it's a router
  if (authRoutes && typeof authRoutes === 'function') {
    console.log('✅ Auth routes is a function (router)');
  } else {
    console.log('❌ Auth routes is not a function');
  }
} catch (error) {
  console.error('❌ Error loading auth routes:', error.message);
  console.error('Stack trace:', error.stack);
}
