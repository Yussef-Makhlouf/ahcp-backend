const mongoose = require('mongoose');
const User = require('./src/models/User');

async function quickUpdate() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ahcp');
    console.log('✅ Connected to MongoDB');

    // Find all users first
    const allUsers = await User.find({}).select('name email role section');
    console.log('\n📋 All users in database:');
    allUsers.forEach(user => {
      console.log(`- ${user.name} | ${user.email} | ${user.role} | ${user.section || 'N/A'}`);
    });

    // Find the specific supervisor
    const supervisor = await User.findOne({
      $or: [
        { email: 'vaccination@ahcp.gov.sa' },
        { name: /سارة/ },
        { section: /تحصين/ }
      ]
    });

    if (!supervisor) {
      console.log('❌ Supervisor not found');
      return;
    }

    console.log('📋 Found supervisor:', supervisor.name);
    console.log('   Role:', supervisor.role);
    console.log('   Section:', supervisor.section);
    console.log('   Current code:', supervisor.supervisorCode || 'None');
    console.log('   Current vehicle:', supervisor.vehicleNo || 'None');

    // Generate code and vehicle number
    const supervisorCode = await User.generateSupervisorCode(supervisor.section || 'التحصينات');
    const firstName = supervisor.name.split(' ')[0];
    const vehicleNo = `${firstName}-${supervisorCode}`;

    console.log('\n🔄 Updating supervisor...');
    console.log('   New code:', supervisorCode);
    console.log('   New vehicle:', vehicleNo);

    // Update the supervisor
    await User.findByIdAndUpdate(supervisor._id, {
      supervisorCode,
      vehicleNo
    });

    console.log('✅ Supervisor updated successfully!');

    // Verify the update
    const updatedSupervisor = await User.findById(supervisor._id);
    console.log('\n📊 Updated supervisor:');
    console.log('   Name:', updatedSupervisor.name);
    console.log('   Code:', updatedSupervisor.supervisorCode);
    console.log('   Vehicle:', updatedSupervisor.vehicleNo);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

quickUpdate();
