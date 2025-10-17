// Test script to check if server.js loads properly
console.log('Testing server.js loading...');

try {
  console.log('Loading server.js...');
  const app = require('./server.js');
  console.log('✅ Server.js loaded successfully');
  console.log('App type:', typeof app);
  
  // Test if we can get the routes
  const routes = app._router.stack;
  console.log('Total routes loaded:', routes.length);
  
  // Look for auth routes
  const authRoutes = routes.filter(route => 
    route.route && route.route.path && route.route.path.includes('/api/auth')
  );
  console.log('Auth routes found:', authRoutes.length);
  
  // Look for login route specifically
  const loginRoutes = routes.filter(route => 
    route.route && route.route.path && route.route.path.includes('/login')
  );
  console.log('Login routes found:', loginRoutes.length);
  
  if (loginRoutes.length > 0) {
    console.log('Login route details:', loginRoutes[0].route);
  }
  
} catch (error) {
  console.error('❌ Error loading server.js:', error.message);
  console.error('Stack trace:', error.stack);
}
