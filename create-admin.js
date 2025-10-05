const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import User model
const User = require('./src/models/User');

async function createAdminUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to MongoDB');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@ahcp.gov.sa' });
    if (existingAdmin) {
      console.log('✅ Admin user already exists');
      console.log('📧 Email:', existingAdmin.email);
      console.log('👤 Name:', existingAdmin.name);
      console.log('🔑 Role:', existingAdmin.role);
      
      // Update password to make sure it's correct
      existingAdmin.password = 'Admin@123456';
      await existingAdmin.save();
      console.log('🔄 Password updated to: Admin@123456');
    } else {
      // Create new admin user
      const adminUser = new User({
        name: 'مدير النظام',
        email: 'admin@ahcp.gov.sa',
        password: 'Admin@123456',
        role: 'super_admin',
        section: 'الإدارة العامة',
        isActive: true
      });

      await adminUser.save();
      console.log('✅ Admin user created successfully');
    }

    // Create additional test users
    const testUsers = [
      {
        name: 'إبراهيم أحمد',
        email: 'ibrahim@ahcp.gov.eg',
        password: 'admin123',
        role: 'super_admin',
        section: 'الإدارة العامة',
        isActive: true
      },
      {
        name: 'مشرف القسم',
        email: 'supervisor@ahcp.gov.sa',
        password: 'Supervisor@123',
        role: 'section_supervisor',
        section: 'مكافحة الطفيليات',
        isActive: true
      },
      {
        name: 'العامل الميداني',
        email: 'worker@ahcp.gov.sa',
        password: 'Worker@123',
        role: 'field_worker',
        section: 'العمل الميداني',
        isActive: true
      }
    ];

    for (const userData of testUsers) {
      const existingUser = await User.findOne({ email: userData.email });
      if (!existingUser) {
        const user = new User(userData);
        await user.save();
        console.log(`✅ Created user: ${userData.email}`);
      } else {
        // Update password
        existingUser.password = userData.password;
        await existingUser.save();
        console.log(`🔄 Updated user: ${userData.email}`);
      }
    }

    console.log('\n🎉 All users created/updated successfully!');
    console.log('\n📋 Available login credentials:');
    console.log('1. admin@ahcp.gov.sa / Admin@123456');
    console.log('2. ibrahim@ahcp.gov.eg / admin123');
    console.log('3. supervisor@ahcp.gov.sa / Supervisor@123');
    console.log('4. worker@ahcp.gov.sa / Worker@123');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

createAdminUser();
