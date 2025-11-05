/**
 * Soft Delete Plugin for Mongoose Models
 * Adds soft delete functionality to models with deletedAt, deletedBy, and isDeleted fields
 * This is a safe version that doesn't interfere with existing queries
 */

module.exports = function softDeletePlugin(schema, options = {}) {
  const { autoFilter = false } = options;
  // Add soft delete fields to schema
  schema.add({
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    },
    deletedBy: {
      type: schema.path('createdBy') ? schema.path('createdBy').instance : 'ObjectId',
      ref: 'User',
      default: null
    }
  });

  // Override default find methods to exclude deleted documents
  // ONLY if autoFilter is enabled (disabled by default for safety)
  if (autoFilter) {
    const excludeDeleted = function(next) {
      try {
        // Only apply filter if not explicitly querying deleted records
        if (this.getOptions && !this.getOptions().skipFilter) {
          const query = this.getQuery();
          if (query.isDeleted === undefined) {
            this.where({ isDeleted: false });
          }
        }
      } catch (error) {
        // Silently fail to prevent breaking existing queries
        console.error('Soft delete filter error:', error.message);
      }
      if (next) next();
    };

    // Apply to all find operations
    schema.pre('find', function(next) {
      excludeDeleted.call(this, next);
    });
    
    schema.pre('findOne', function(next) {
      excludeDeleted.call(this, next);
    });
    
    schema.pre('countDocuments', function(next) {
      excludeDeleted.call(this, next);
    });
  }

  // Add soft delete method
  schema.methods.softDelete = function(userId) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = userId || null;
    return this.save();
  };

  // Add restore method
  schema.methods.restore = function() {
    this.isDeleted = false;
    this.deletedAt = null;
    this.deletedBy = null;
    return this.save();
  };

  // Static method to find deleted documents
  schema.statics.findDeleted = function(filter = {}) {
    return this.find({ ...filter, isDeleted: true });
  };

  // Static method to find all (including deleted)
  schema.statics.findWithDeleted = function(filter = {}) {
    return this.find(filter).setOptions({ skipFilter: true });
  };

  // Static method to restore by ID
  schema.statics.restoreById = function(id) {
    return this.findOneAndUpdate(
      { _id: id, isDeleted: true },
      { isDeleted: false, deletedAt: null, deletedBy: null },
      { new: true }
    ).setOptions({ skipFilter: true });
  };

  // Static method to hard delete (permanent)
  schema.statics.hardDelete = function(id) {
    return this.findOneAndDelete({ _id: id, isDeleted: true })
      .setOptions({ skipFilter: true });
  };

  // Static method to soft delete by ID
  schema.statics.softDeleteById = function(id, userId) {
    return this.findByIdAndUpdate(
      id,
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId || null
      },
      { new: true }
    );
  };

  // Static method to get all deleted with pagination
  schema.statics.getDeleted = function(options = {}) {
    const {
      page = 1,
      limit = 50,
      sort = '-deletedAt',
      populate = []
    } = options;

    const query = this.find({ isDeleted: true })
      .setOptions({ skipFilter: true })
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit);

    // Apply population
    if (populate.length > 0) {
      populate.forEach(pop => query.populate(pop));
    }

    return query;
  };

  // Static method to count deleted
  schema.statics.countDeleted = function(filter = {}) {
    return this.countDocuments({ ...filter, isDeleted: true })
      .setOptions({ skipFilter: true });
  };

  // Static method to empty trash (delete all soft-deleted records permanently)
  schema.statics.emptyTrash = function() {
    return this.deleteMany({ isDeleted: true })
      .setOptions({ skipFilter: true });
  };
};
