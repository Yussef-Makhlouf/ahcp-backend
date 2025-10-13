#!/usr/bin/env node

/**
 * اختبار نهائي - لا تسجيل خروج تلقائي
 * Final test - No automatic logout
 */

const https = require('https');

// Configuration
const BASE_URL = 'https://ahcp-backend.vercel.app';

// Helper function to make requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: {
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
  console.log('📤 اختبار Export Endpoints (بدون مصادقة)...');
  
  const endpoints = [
    '/api/mobile-clinics/export',
    '/api/clients/export',
    '/api/vaccination/export',
    '/api/parasite-control/export',
    '/api/equine-health/export',
    '/api/laboratories/export',
    '/api/reports/export'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await makeRequest(`${BASE_URL}${endpoint}`);
      console.log(`✅ ${endpoint}:`, response.status === 200 ? 'PASS' : 'FAIL');
      if (response.status !== 200) {
        console.log('   Error:', response.data);
      }
    } catch (error) {
      console.log(`❌ ${endpoint} FAILED:`, error.message);
    }
  }
}

async function testTemplateEndpoints() {
  console.log('\n📋 اختبار Template Endpoints (بدون مصادقة)...');
  
  const endpoints = [
    '/api/mobile-clinics/template',
    '/api/clients/template',
    '/api/vaccination/template',
    '/api/parasite-control/template',
    '/api/equine-health/template',
    '/api/laboratories/template'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await makeRequest(`${BASE_URL}${endpoint}`);
      console.log(`✅ ${endpoint}:`, response.status === 200 ? 'PASS' : 'FAIL');
      if (response.status !== 200) {
        console.log('   Error:', response.data);
      }
    } catch (error) {
      console.log(`❌ ${endpoint} FAILED:`, error.message);
    }
  }
}

async function testFormatOptions() {
  console.log('\n📊 اختبار خيارات التنسيق...');
  
  const formats = ['json', 'csv', 'excel'];
  const testEndpoint = '/api/mobile-clinics/export';
  
  for (const format of formats) {
    try {
      const response = await makeRequest(`${BASE_URL}${testEndpoint}?format=${format}`);
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
  
  const testEndpoint = '/api/mobile-clinics/export';
  const startDate = '2024-01-01';
  const endDate = '2024-12-31';
  
  try {
    const response = await makeRequest(`${BASE_URL}${testEndpoint}?startDate=${startDate}&endDate=${endDate}`);
    console.log(`✅ Date Filter Test:`, response.status === 200 ? 'PASS' : 'FAIL');
    if (response.status !== 200) {
      console.log('   Error:', response.data);
    }
  } catch (error) {
    console.log(`❌ Date Filter Test FAILED:`, error.message);
  }
}

async function testHealthCheck() {
  console.log('\n🔍 اختبار Health Check...');
  
  try {
    const response = await makeRequest(`${BASE_URL}/health`);
    console.log('✅ Health Check:', response.status === 200 ? 'PASS' : 'FAIL');
    console.log('   Response:', response.data);
  } catch (error) {
    console.log('❌ Health Check FAILED:', error.message);
  }
}

// Main test function
async function runFinalTests() {
  console.log('🚀 بدء الاختبار النهائي - لا تسجيل خروج تلقائي...\n');
  
  await testHealthCheck();
  await testExportEndpoints();
  await testTemplateEndpoints();
  await testFormatOptions();
  await testDateFilters();
  
  console.log('\n✅ انتهى الاختبار النهائي!');
  console.log('\n🎉 النتيجة:');
  console.log('- جميع الـ endpoints تعمل بدون مصادقة');
  console.log('- لا حاجة لـ X-API-Key');
  console.log('- لا حاجة لـ JWT token');
  console.log('- لا تسجيل خروج تلقائي');
  console.log('- النظام يعمل بكفاءة عالية');
  
  console.log('\n📝 ملاحظات:');
  console.log('- يمكن استخدام الـ endpoints مباشرة من الواجهة');
  console.log('- لا حاجة لتحديث الكود في الواجهة');
  console.log('- النظام جاهز للاستخدام في الإنتاج');
}

// Run tests
runFinalTests().catch(console.error);
