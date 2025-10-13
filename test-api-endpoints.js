#!/usr/bin/env node

/**
 * اختبار endpoints الاستيراد والتصدير
 * Test script for import/export endpoints
 */

const https = require('https');
const fs = require('fs');

// Configuration
const BASE_URL = 'https://ahcp-backend.vercel.app';
const API_KEY = '60ecf8370fd9a917b1edff07ae5a30529b6dba28a3d9738a861686667e552b34';

// Helper function to make requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: {
        'X-API-Key': API_KEY,
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
async function testHealthCheck() {
  console.log('🔍 اختبار Health Check...');
  try {
    const response = await makeRequest(`${BASE_URL}/health`);
    console.log('✅ Health Check:', response.status === 200 ? 'PASS' : 'FAIL');
    console.log('   Response:', response.data);
  } catch (error) {
    console.log('❌ Health Check FAILED:', error.message);
  }
}

async function testExportEndpoints() {
  console.log('\n📤 اختبار Export Endpoints...');
  
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
  console.log('\n📋 اختبار Template Endpoints...');
  
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

async function testWithoutAPIKey() {
  console.log('\n🔒 اختبار الحماية (بدون API Key)...');
  
  try {
    const response = await makeRequest(`${BASE_URL}/api/mobile-clinics/export`, {
      headers: {} // No API Key
    });
    console.log('✅ Protection Test:', response.status === 401 ? 'PASS' : 'FAIL');
    if (response.status === 401) {
      console.log('   Correctly blocked without API key');
    } else {
      console.log('   ⚠️  Should be blocked but was allowed');
    }
  } catch (error) {
    console.log('❌ Protection Test FAILED:', error.message);
  }
}

async function testWithWrongAPIKey() {
  console.log('\n🔒 اختبار الحماية (API Key خاطئ)...');
  
  try {
    const response = await makeRequest(`${BASE_URL}/api/mobile-clinics/export`, {
      headers: { 'X-API-Key': 'wrong-key' }
    });
    console.log('✅ Wrong API Key Test:', response.status === 401 ? 'PASS' : 'FAIL');
    if (response.status === 401) {
      console.log('   Correctly blocked with wrong API key');
    } else {
      console.log('   ⚠️  Should be blocked but was allowed');
    }
  } catch (error) {
    console.log('❌ Wrong API Key Test FAILED:', error.message);
  }
}

// Main test function
async function runTests() {
  console.log('🚀 بدء اختبار AHCP Backend API...\n');
  
  await testHealthCheck();
  await testExportEndpoints();
  await testTemplateEndpoints();
  await testWithoutAPIKey();
  await testWithWrongAPIKey();
  
  console.log('\n✅ انتهى الاختبار!');
  console.log('\n📝 ملاحظات:');
  console.log('- تأكد من إضافة API_KEY في Vercel Environment Variables');
  console.log('- تأكد من أن القيمة مطابقة للمفتاح المستخدم في الاختبار');
  console.log('- جميع endpoints محمية بـ API Key');
}

// Run tests
runTests().catch(console.error);
