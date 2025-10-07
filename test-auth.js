require('dotenv').config();
const axios = require('axios');

/**
 * Quick test script to verify the authentication and authorization system
 * Run this after starting the server: node test-auth.js
 */

const BASE_URL = 'http://localhost:3001';

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testAuth() {
  log('\n🧪 Testing AHCP Authentication & Authorization System\n', 'cyan');

  try {
    // Test 1: Login as Super Admin
    log('📝 Test 1: Login as Super Admin', 'blue');
    const adminLogin = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@ahcp.gov.sa',
      password: 'admin123'
    });
    
    if (adminLogin.data.success) {
      log('✅ Super Admin login successful', 'green');
      const adminToken = adminLogin.data.data.token;
      log(`   Token: ${adminToken.substring(0, 50)}...`, 'yellow');
      
      // Test 2: Super Admin accessing Mobile Clinic section
      log('\n📝 Test 2: Super Admin accessing Mobile Clinic section', 'blue');
      try {
        const mobileClinicsResponse = await axios.get(`${BASE_URL}/api/mobile-clinics`, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        log('✅ Super Admin can access Mobile Clinic section', 'green');
      } catch (error) {
        log('❌ Super Admin cannot access Mobile Clinic section', 'red');
        log(`   Error: ${error.response?.data?.message}`, 'red');
      }

      // Test 3: Super Admin accessing Vaccination section
      log('\n📝 Test 3: Super Admin accessing Vaccination section', 'blue');
      try {
        const vaccinationResponse = await axios.get(`${BASE_URL}/api/vaccination`, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        log('✅ Super Admin can access Vaccination section', 'green');
      } catch (error) {
        log('❌ Super Admin cannot access Vaccination section', 'red');
        log(`   Error: ${error.response?.data?.message}`, 'red');
      }
    }

    // Test 4: Login as Mobile Clinic Supervisor
    log('\n📝 Test 4: Login as Mobile Clinic Supervisor', 'blue');
    const clinicLogin = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'clinic@ahcp.gov.sa',
      password: 'password123'
    });
    
    if (clinicLogin.data.success) {
      log('✅ Mobile Clinic Supervisor login successful', 'green');
      const clinicToken = clinicLogin.data.data.token;
      log(`   User: ${clinicLogin.data.data.user.name}`, 'yellow');
      log(`   Section: ${clinicLogin.data.data.user.section}`, 'yellow');
      
      // Test 5: Mobile Clinic Supervisor accessing own section
      log('\n📝 Test 5: Mobile Clinic Supervisor accessing own section', 'blue');
      try {
        const ownSectionResponse = await axios.get(`${BASE_URL}/api/mobile-clinics`, {
          headers: { Authorization: `Bearer ${clinicToken}` }
        });
        log('✅ Mobile Clinic Supervisor can access own section', 'green');
      } catch (error) {
        log('❌ Mobile Clinic Supervisor cannot access own section', 'red');
        log(`   Error: ${error.response?.data?.message}`, 'red');
      }

      // Test 6: Mobile Clinic Supervisor accessing different section (should fail)
      log('\n📝 Test 6: Mobile Clinic Supervisor accessing Vaccination section (should fail)', 'blue');
      try {
        const otherSectionResponse = await axios.get(`${BASE_URL}/api/vaccination`, {
          headers: { Authorization: `Bearer ${clinicToken}` }
        });
        log('❌ SECURITY ISSUE: Mobile Clinic Supervisor can access Vaccination section!', 'red');
      } catch (error) {
        if (error.response?.status === 403) {
          log('✅ Correctly denied access to different section', 'green');
          log(`   Error: ${error.response?.data?.error}`, 'yellow');
          log(`   Message: ${error.response?.data?.message}`, 'yellow');
        } else {
          log('❌ Unexpected error', 'red');
          log(`   Error: ${error.response?.data?.message || error.message}`, 'red');
        }
      }
    }

    // Test 7: Login as Vaccination Supervisor
    log('\n📝 Test 7: Login as Vaccination Supervisor', 'blue');
    const vaccinationLogin = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'vaccination@ahcp.gov.sa',
      password: 'password123'
    });
    
    if (vaccinationLogin.data.success) {
      log('✅ Vaccination Supervisor login successful', 'green');
      const vaccinationToken = vaccinationLogin.data.data.token;
      
      // Test 8: Vaccination Supervisor accessing own section
      log('\n📝 Test 8: Vaccination Supervisor accessing own section', 'blue');
      try {
        const ownSectionResponse = await axios.get(`${BASE_URL}/api/vaccination`, {
          headers: { Authorization: `Bearer ${vaccinationToken}` }
        });
        log('✅ Vaccination Supervisor can access own section', 'green');
      } catch (error) {
        log('❌ Vaccination Supervisor cannot access own section', 'red');
        log(`   Error: ${error.response?.data?.message}`, 'red');
      }

      // Test 9: Vaccination Supervisor accessing Equine Health section (should fail)
      log('\n📝 Test 9: Vaccination Supervisor accessing Equine Health section (should fail)', 'blue');
      try {
        const otherSectionResponse = await axios.get(`${BASE_URL}/api/equine-health`, {
          headers: { Authorization: `Bearer ${vaccinationToken}` }
        });
        log('❌ SECURITY ISSUE: Vaccination Supervisor can access Equine Health section!', 'red');
      } catch (error) {
        if (error.response?.status === 403) {
          log('✅ Correctly denied access to different section', 'green');
        } else {
          log('❌ Unexpected error', 'red');
        }
      }
    }

    // Test 10: Get all supervisors
    log('\n📝 Test 10: Get all supervisors', 'blue');
    try {
      const supervisorsResponse = await axios.get(`${BASE_URL}/api/auth/supervisors`);
      if (supervisorsResponse.data.success) {
        log('✅ Successfully retrieved supervisors', 'green');
        log(`   Count: ${supervisorsResponse.data.data.length}`, 'yellow');
        supervisorsResponse.data.data.forEach(sup => {
          log(`   - ${sup.name} (${sup.section})`, 'yellow');
        });
      }
    } catch (error) {
      log('❌ Failed to retrieve supervisors', 'red');
      log(`   Error: ${error.response?.data?.message || error.message}`, 'red');
    }

    // Test 11: Access without token (should fail)
    log('\n📝 Test 11: Access protected endpoint without token (should fail)', 'blue');
    try {
      const noTokenResponse = await axios.get(`${BASE_URL}/api/mobile-clinics`);
      log('❌ SECURITY ISSUE: Can access protected endpoint without token!', 'red');
    } catch (error) {
      if (error.response?.status === 401) {
        log('✅ Correctly denied access without token', 'green');
        log(`   Error: ${error.response?.data?.error}`, 'yellow');
      } else {
        log('❌ Unexpected error', 'red');
      }
    }

    log('\n✨ All tests completed!\n', 'cyan');

  } catch (error) {
    log('\n❌ Test failed with error:', 'red');
    console.error(error.response?.data || error.message);
  }
}

// Run tests
testAuth();
