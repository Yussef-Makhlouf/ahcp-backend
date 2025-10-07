require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

/**
 * Seed script to create initial supervisor users for all sections
 * Run this script with: node seed-supervisors.js
 */

const supervisors = [
  {
    name: 'Dr. Ahmed Hassan',
    email: 'clinic@ahcp.gov.sa',
    password: 'password123', // Change this in production!
    role: 'section_supervisor',
    section: 'Mobile Clinic',
    isActive: true
  },
  {
    name: 'Dr. Khaled Ibrahim',
    email: 'equine@ahcp.gov.sa',
    password: 'password123', // Change this in production!
    role: 'section_supervisor',
    section: 'Equine Health',
    isActive: true
  },
  {
    name: 'Dr. Sarah Mahmoud',
    email: 'vaccination@ahcp.gov.sa',
    password: 'password123', // Change this in production!
    role: 'section_supervisor',
    section: 'Vaccination',
    isActive: true
  },
  {
    name: 'Dr. Fatimah AlQahtani',
    email: 'laboratory@ahcp.gov.sa',
    password: 'password123', // Change this in production!
    role: 'section_supervisor',
    section: 'Laboratory',
    isActive: true
  },
  {
    name: 'Dr. Mohammed AlAhmad',
    email: 'parasite@ahcp.gov.sa',
    password: 'password123', // Change this in production!
    role: 'section_supervisor',
    section: 'Parasite Control',
    isActive: true
  },
  {
    name: 'System Admin',
    email: 'admin@ahcp.gov.sa',
    password: 'admin123', // Change this in production!
    role: 'super_admin',
    section: 'Administration',
    isActive: true
  }
];

async function seedSupervisors() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ahcp_database', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB');

    // Check if supervisors already exist
    for (const supervisorData of supervisors) {
      const existingUser = await User.findOne({ email: supervisorData.email });
      
      if (existingUser) {
        console.log(`⚠️  User already exists: ${supervisorData.email} - Skipping`);
        continue;
      }

      // Create new supervisor
      const supervisor = new User(supervisorData);
      await supervisor.save();
      
      console.log(`✅ Created supervisor: ${supervisorData.name} (${supervisorData.email}) - ${supervisorData.section}`);
    }

    console.log('\n🎉 Supervisor seeding completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   - Super Admin: admin@ahcp.gov.sa (password: admin123)');
    console.log('   - Mobile Clinic: clinic@ahcp.gov.sa (password: password123)');
    console.log('   - Equine Health: equine@ahcp.gov.sa (password: password123)');
    console.log('   - Vaccination: vaccination@ahcp.gov.sa (password: password123)');
    console.log('   - Laboratory: laboratory@ahcp.gov.sa (password: password123)');
    console.log('   - Parasite Control: parasite@ahcp.gov.sa (password: password123)');
    console.log('\n⚠️  IMPORTANT: Change these passwords in production!');

  } catch (error) {
    console.error('❌ Error seeding supervisors:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the seed function
seedSupervisors();
