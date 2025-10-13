#!/usr/bin/env node

/**
 * اختبار JWT-protected export/import endpoints
 * Test script for JWT-protected export/import endpoints
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
async function testExportEndpoints() {
  console.log('📤 اختبار JWT Export Endpoints...');
  
  // Note: You need a valid JWT token for these tests
  const jwtToken = 'YOUR_JWT_TOKEN_HERE'; // Replace with actual JWT token
  
  const endpoints = [
    '/api/export/mobile-clinics',
    '/api/export/clients',
    '/api/export/vaccination',
    '/api/export/parasite-control',
    '/api/export/equine-health',
    '/api/export/laboratories'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await makeJWTRequest(`${BASE_URL}${endpoint}`, jwtToken);
      console.log(`✅ ${endpoint}:`, response.status === 200 ? 'PASS' : 'FAIL');
      if (response.status !== 200) {
        console.log('   Error:', response.data);
      }
    } catch (error) {
      console.log(`❌ ${endpoint} FAILED:`, error.message);
    }
  }
}

async function testWithoutJWT() {
  console.log('\n🔒 اختبار الحماية (بدون JWT)...');
  
  try {
    const response = await makeJWTRequest(`${BASE_URL}/api/export/mobile-clinics`, '');
    console.log('✅ JWT Protection Test:', response.status === 401 ? 'PASS' : 'FAIL');
    if (response.status === 401) {
      console.log('   Correctly blocked without JWT token');
    } else {
      console.log('   ⚠️  Should be blocked but was allowed');
    }
  } catch (error) {
    console.log('❌ JWT Protection Test FAILED:', error.message);
  }
}

async function testWithInvalidJWT() {
  console.log('\n🔒 اختبار الحماية (JWT خاطئ)...');
  
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
async function runTests() {
  console.log('🚀 بدء اختبار JWT-protected Export/Import Endpoints...\n');
  
  await testExportEndpoints();
  await testWithoutJWT();
  await testWithInvalidJWT();
  
  console.log('\n✅ انتهى الاختبار!');
  console.log('\n📝 ملاحظات:');
  console.log('- هذه الـ endpoints محمية بـ JWT (مثل باقي الـ API)');
  console.log('- لا تحتاج إلى X-API-Key');
  console.log('- يمكن استخدامها من الواجهة مع JWT token');
  console.log('- لن تسبب تسجيل خروج تلقائي');
}

// Run tests
runTests().catch(console.error);
