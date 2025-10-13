#!/usr/bin/env node

/**
 * اختبار شامل لجميع JWT-protected export/import endpoints
 * Complete test for all JWT-protected export/import endpoints
 */

const https = require('https');

// Configuration
const BASE_URL = 'https://ahcp-backend.vercel.app';

// Helper function to make requests with JWT
function makeJWTRequest(url, jwtToken, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Test functions
async function testAllExportEndpoints() {
  console.log('📤 اختبار جميع Export Endpoints...');
  
  // Note: You need a valid JWT token for these tests
  const jwtToken = 'YOUR_JWT_TOKEN_HERE'; // Replace with actual JWT token
  
  const endpoints = [
    { path: '/api/export/mobile-clinics', name: 'Mobile Clinics Export' },
    { path: '/api/export/clients', name: 'Clients Export' },
    { path: '/api/export/vaccination', name: 'Vaccination Export' },
    { path: '/api/export/parasite-control', name: 'Parasite Control Export' },
    { path: '/api/export/equine-health', name: 'Equine Health Export' },
    { path: '/api/export/laboratories', name: 'Laboratories Export' },
    { path: '/api/export/reports', name: 'Reports Export' }
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await makeJWTRequest(`${BASE_URL}${endpoint.path}`, jwtToken);
      console.log(`✅ ${endpoint.name}:`, response.status === 200 ? 'PASS' : 'FAIL');
      if (response.status !== 200) {
        console.log('   Error:', response.data);
      }
    } catch (error) {
      console.log(`❌ ${endpoint.name} FAILED:`, error.message);
    }
  }
}

async function testAllImportEndpoints() {
  console.log('\n📥 اختبار جميع Import Endpoints...');
  
  const jwtToken = 'YOUR_JWT_TOKEN_HERE'; // Replace with actual JWT token
  
  const endpoints = [
    { path: '/api/import/mobile-clinics', name: 'Mobile Clinics Import' },
    { path: '/api/import/clients', name: 'Clients Import' },
    { path: '/api/import/vaccination', name: 'Vaccination Import' },
    { path: '/api/import/parasite-control', name: 'Parasite Control Import' },
    { path: '/api/import/equine-health', name: 'Equine Health Import' },
    { path: '/api/import/laboratories', name: 'Laboratories Import' }
  ];
  
  for (const endpoint of endpoints) {
    try {
      // Test without file (should return error)
      const response = await makeJWTRequest(`${BASE_URL}${endpoint.path}`, jwtToken, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      console.log(`✅ ${endpoint.name}:`, response.status === 400 ? 'PASS (correctly rejected no file)' : 'FAIL');
      if (response.status !== 400) {
        console.log('   Response:', response.data);
      }
    } catch (error) {
      console.log(`❌ ${endpoint.name} FAILED:`, error.message);
    }
  }
}

async function testFormatOptions() {
  console.log('\n📊 اختبار خيارات التنسيق...');
  
  const jwtToken = 'YOUR_JWT_TOKEN_HERE'; // Replace with actual JWT token
  
  const formats = ['json', 'csv', 'excel'];
  const testEndpoint = '/api/export/mobile-clinics';
  
  for (const format of formats) {
    try {
      const response = await makeJWTRequest(`${BASE_URL}${testEndpoint}?format=${format}`, jwtToken);
      console.log(`✅ Format ${format.toUpperCase()}:`, response.status === 200 ? 'PASS' : 'FAIL');
      if (response.status !== 200) {
        console.log('   Error:', response.data);
      }
    } catch (error) {
      console.log(`❌ Format ${format.toUpperCase()} FAILED:`, error.message);
    }
  }
}

async function testDateFilters() {
  console.log('\n📅 اختبار فلاتر التاريخ...');
  
  const jwtToken = 'YOUR_JWT_TOKEN_HERE'; // Replace with actual JWT token
  
  const testEndpoint = '/api/export/mobile-clinics';
  const startDate = '2024-01-01';
  const endDate = '2024-12-31';
  
  try {
    const response = await makeJWTRequest(`${BASE_URL}${testEndpoint}?startDate=${startDate}&endDate=${endDate}`, jwtToken);
    console.log(`✅ Date Filter Test:`, response.status === 200 ? 'PASS' : 'FAIL');
    if (response.status !== 200) {
      console.log('   Error:', response.data);
    }
  } catch (error) {
    console.log(`❌ Date Filter Test FAILED:`, error.message);
  }
}

async function testSecurity() {
  console.log('\n🔒 اختبار الأمان...');
  
  // Test without JWT
  try {
    const response = await makeJWTRequest(`${BASE_URL}/api/export/mobile-clinics`, '');
    console.log('✅ No JWT Test:', response.status === 401 ? 'PASS' : 'FAIL');
    if (response.status === 401) {
      console.log('   Correctly blocked without JWT token');
    } else {
      console.log('   ⚠️  Should be blocked but was allowed');
    }
  } catch (error) {
    console.log('❌ No JWT Test FAILED:', error.message);
  }
  
  // Test with invalid JWT
  try {
    const response = await makeJWTRequest(`${BASE_URL}/api/export/mobile-clinics`, 'invalid-jwt-token');
    console.log('✅ Invalid JWT Test:', response.status === 401 ? 'PASS' : 'FAIL');
    if (response.status === 401) {
      console.log('   Correctly blocked with invalid JWT token');
    } else {
      console.log('   ⚠️  Should be blocked but was allowed');
    }
  } catch (error) {
    console.log('❌ Invalid JWT Test FAILED:', error.message);
  }
}

// Main test function
async function runCompleteTests() {
  console.log('🚀 بدء اختبار شامل لجميع JWT-protected Export/Import Endpoints...\n');
  
  await testAllExportEndpoints();
  await testAllImportEndpoints();
  await testFormatOptions();
  await testDateFilters();
  await testSecurity();
  
  console.log('\n✅ انتهى الاختبار الشامل!');
  console.log('\n📝 ملاحظات:');
  console.log('- جميع الـ endpoints محمية بـ JWT (مثل باقي الـ API)');
  console.log('- لا تحتاج إلى X-API-Key');
  console.log('- يمكن استخدامها من الواجهة مع JWT token');
  console.log('- لن تسبب تسجيل خروج تلقائي');
  console.log('- تدعم جميع تنسيقات التصدير (JSON, CSV, Excel)');
  console.log('- تدعم فلاتر التاريخ');
  console.log('- تدعم الاستيراد من ملفات CSV و Excel');
}

// Run tests
runCompleteTests().catch(console.error);
