#!/usr/bin/env node

/**
 * Test script to verify Vercel API endpoints
 * Run this after setting environment variables in Vercel
 */

const https = require('https');

const BASE_URL = 'https://ahcp-backend.vercel.app';

// Test endpoints
const endpoints = [
  { name: 'Health Check', url: '/health', method: 'GET' },
  { name: 'Root', url: '/', method: 'GET' },
  { name: 'Vaccination List', url: '/api/vaccination?page=1&limit=5', method: 'GET' },
  { name: 'Vaccination Statistics', url: '/api/vaccination/statistics', method: 'GET' },
  { name: 'Clients List', url: '/api/clients?page=1&limit=5', method: 'GET' },
  { name: 'Clients Statistics', url: '/api/clients/statistics', method: 'GET' }
];

function makeRequest(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            data: jsonData,
            headers: res.headers
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers,
            error: 'Invalid JSON response'
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function testEndpoints() {
  console.log('🧪 Testing Vercel API Endpoints...\n');
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Testing ${endpoint.name}...`);
      const url = `${BASE_URL}${endpoint.url}`;
      const response = await makeRequest(url, endpoint.method);
      
      if (response.status === 200) {
        console.log(`✅ ${endpoint.name}: ${response.status} OK`);
        if (response.data.database) {
          console.log(`   Database: ${response.data.database}`);
        }
      } else {
        console.log(`❌ ${endpoint.name}: ${response.status} ${response.data.message || 'Error'}`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint.name}: Error - ${error.message}`);
    }
    console.log('');
  }
  
  console.log('🏁 Testing completed!');
}

// Run the tests
testEndpoints().catch(console.error);
