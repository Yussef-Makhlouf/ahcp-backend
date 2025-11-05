/**
 * Client Service Manager
 * Utility functions to manage client services across different modules
 * This ensures clients are never deleted when their records are deleted,
 * only their availableServices are updated appropriately
 */

const Client = require('../models/Client');
const Laboratory = require('../models/Laboratory');
const Vaccination = require('../models/Vaccination');
const ParasiteControl = require('../models/ParasiteControl');
const MobileClinic = require('../models/MobileClinic');
const EquineHealth = require('../models/EquineHealth');

/**
 * Check if a client has any records in a specific service
 * @param {String} clientId - Client ObjectId
 * @param {String} serviceType - Service type (laboratory, vaccination, parasite_control, mobile_clinic, equine_health)
 * @returns {Promise<Number>} - Count of records for the client in the service
 */
async function checkClientRecordsInService(clientId, serviceType) {
  if (!clientId) return 0;

  const serviceModels = {
    laboratory: Laboratory,
    vaccination: Vaccination,
    parasite_control: ParasiteControl,
    mobile_clinic: MobileClinic,
    equine_health: EquineHealth
  };

  const Model = serviceModels[serviceType];
  if (!Model) {
    console.warn(`⚠️ Unknown service type: ${serviceType}`);
    return 0;
  }

  try {
    const count = await Model.countDocuments({ client: clientId });
    return count;
  } catch (error) {
    console.error(`❌ Error checking records for client ${clientId} in ${serviceType}:`, error);
    return 0;
  }
}

/**
 * Get all service counts for a client
 * @param {String} clientId - Client ObjectId
 * @returns {Promise<Object>} - Object with service counts
 */
async function getAllServiceCountsForClient(clientId) {
  if (!clientId) return {};

  try {
    const [labCount, vaccinationCount, parasiteCount, mobileCount, equineCount] = await Promise.all([
      Laboratory.countDocuments({ client: clientId }),
      Vaccination.countDocuments({ client: clientId }),
      ParasiteControl.countDocuments({ client: clientId }),
      MobileClinic.countDocuments({ client: clientId }),
      EquineHealth.countDocuments({ client: clientId })
    ]);

    return {
      laboratory: labCount,
      vaccination: vaccinationCount,
      parasite_control: parasiteCount,
      mobile_clinic: mobileCount,
      equine_health: equineCount,
      total: labCount + vaccinationCount + parasiteCount + mobileCount + equineCount
    };
  } catch (error) {
    console.error(`❌ Error getting service counts for client ${clientId}:`, error);
    return { total: 0 };
  }
}

/**
 * Update client's availableServices based on actual records
 * Removes services with no records, keeps services with records
 * @param {String} clientId - Client ObjectId
 * @returns {Promise<Object>} - Updated client or null
 */
async function updateClientServices(clientId) {
  if (!clientId) {
    console.warn('⚠️ No clientId provided to updateClientServices');
    return null;
  }

  try {
    const client = await Client.findById(clientId);
    
    if (!client) {
      console.warn(`⚠️ Client ${clientId} not found`);
      return null;
    }

    // Get all service counts
    const serviceCounts = await getAllServiceCountsForClient(clientId);
    
    // Build new availableServices array based on actual records
    const newAvailableServices = [];
    
    if (serviceCounts.laboratory > 0) newAvailableServices.push('laboratory');
    if (serviceCounts.vaccination > 0) newAvailableServices.push('vaccination');
    if (serviceCounts.parasite_control > 0) newAvailableServices.push('parasite_control');
    if (serviceCounts.mobile_clinic > 0) newAvailableServices.push('mobile_clinic');
    if (serviceCounts.equine_health > 0) newAvailableServices.push('equine_health');

    // Update client's availableServices
    client.availableServices = newAvailableServices;
    await client.save();

    console.log(`✅ Updated client ${clientId} services:`, {
      services: newAvailableServices,
      counts: serviceCounts
    });

    return client;
  } catch (error) {
    console.error(`❌ Error updating client ${clientId} services:`, error);
    return null;
  }
}

/**
 * Remove a specific service from client if no records exist
 * @param {String} clientId - Client ObjectId
 * @param {String} serviceType - Service type to remove
 * @returns {Promise<Boolean>} - True if service was removed, false otherwise
 */
async function removeServiceFromClientIfEmpty(clientId, serviceType) {
  if (!clientId || !serviceType) {
    console.warn('⚠️ Missing clientId or serviceType');
    return false;
  }

  try {
    // Check if client has any records in this service
    const recordCount = await checkClientRecordsInService(clientId, serviceType);
    
    if (recordCount > 0) {
      console.log(`📊 Client ${clientId} still has ${recordCount} records in ${serviceType}`);
      return false;
    }

    // No records found, remove service from client
    const client = await Client.findById(clientId);
    
    if (!client) {
      console.warn(`⚠️ Client ${clientId} not found`);
      return false;
    }

    const originalServices = [...client.availableServices];
    client.availableServices = client.availableServices.filter(s => s !== serviceType);
    
    if (originalServices.length !== client.availableServices.length) {
      await client.save();
      console.log(`✅ Removed '${serviceType}' from client ${clientId} services`);
      return true;
    } else {
      console.log(`ℹ️ Service '${serviceType}' was not in client ${clientId} services`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error removing service from client ${clientId}:`, error);
    return false;
  }
}

/**
 * Handle record deletion for a client
 * This is the main function to call when deleting a record
 * It updates the client's availableServices automatically
 * @param {String} clientId - Client ObjectId
 * @param {String} serviceType - Service type of the deleted record
 * @returns {Promise<Object>} - Result object with update status
 */
async function handleRecordDeletion(clientId, serviceType) {
  if (!clientId) {
    return { success: false, message: 'No clientId provided' };
  }

  console.log(`🔄 Handling record deletion for client ${clientId} in service ${serviceType}`);

  try {
    // Update client services based on remaining records
    const serviceRemoved = await removeServiceFromClientIfEmpty(clientId, serviceType);
    
    // Get updated service counts
    const serviceCounts = await getAllServiceCountsForClient(clientId);
    
    return {
      success: true,
      serviceRemoved: serviceRemoved,
      remainingServices: serviceCounts.total,
      serviceCounts: serviceCounts,
      message: serviceRemoved 
        ? `Service '${serviceType}' removed from client. ${serviceCounts.total} total records remaining.`
        : `Client still has records in '${serviceType}'. ${serviceCounts.total} total records remaining.`
    };
  } catch (error) {
    console.error(`❌ Error handling record deletion for client ${clientId}:`, error);
    return {
      success: false,
      message: error.message,
      error: error
    };
  }
}

/**
 * Handle bulk deletion (delete-all operation)
 * Updates all affected clients' availableServices
 * @param {Array} clientIds - Array of client ObjectIds
 * @param {String} serviceType - Service type being deleted
 * @returns {Promise<Object>} - Result with update statistics
 */
async function handleBulkDeletion(clientIds, serviceType) {
  if (!clientIds || clientIds.length === 0) {
    return { 
      success: true, 
      clientsUpdated: 0, 
      message: 'No clients to update' 
    };
  }

  console.log(`🔄 Handling bulk deletion for ${clientIds.length} clients in service ${serviceType}`);

  let clientsUpdated = 0;
  let servicesRemoved = 0;
  const errors = [];

  try {
    for (const clientId of clientIds) {
      if (!clientId) continue;

      try {
        const result = await handleRecordDeletion(clientId, serviceType);
        
        if (result.success) {
          clientsUpdated++;
          if (result.serviceRemoved) {
            servicesRemoved++;
          }
        }
      } catch (error) {
        errors.push({ clientId, error: error.message });
        console.error(`❌ Error updating client ${clientId}:`, error);
      }
    }

    return {
      success: true,
      clientsUpdated: clientsUpdated,
      servicesRemoved: servicesRemoved,
      errors: errors,
      message: `Updated ${clientsUpdated} clients, removed service from ${servicesRemoved} clients`
    };
  } catch (error) {
    console.error(`❌ Error in bulk deletion handler:`, error);
    return {
      success: false,
      message: error.message,
      error: error
    };
  }
}

/**
 * Add a service to client (used when creating records)
 * @param {String} clientId - Client ObjectId
 * @param {String} serviceType - Service type to add
 * @returns {Promise<Boolean>} - True if service was added, false otherwise
 */
async function addServiceToClient(clientId, serviceType) {
  if (!clientId || !serviceType) {
    console.warn('⚠️ Missing clientId or serviceType');
    return false;
  }

  try {
    const client = await Client.findById(clientId);
    
    if (!client) {
      console.warn(`⚠️ Client ${clientId} not found`);
      return false;
    }

    // Check if service already exists
    if (client.availableServices.includes(serviceType)) {
      console.log(`ℹ️ Service '${serviceType}' already in client ${clientId} services`);
      return false;
    }

    // Add service
    client.availableServices.push(serviceType);
    await client.save();
    
    console.log(`✅ Added '${serviceType}' to client ${clientId} services`);
    return true;
  } catch (error) {
    console.error(`❌ Error adding service to client ${clientId}:`, error);
    return false;
  }
}

module.exports = {
  checkClientRecordsInService,
  getAllServiceCountsForClient,
  updateClientServices,
  removeServiceFromClientIfEmpty,
  handleRecordDeletion,
  handleBulkDeletion,
  addServiceToClient
};
