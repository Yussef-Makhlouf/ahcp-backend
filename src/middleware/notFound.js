/**
 * 404 Not Found middleware
 * Handles requests to undefined routes
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  error.statusCode = 404;
  error.error = 'ROUTE_NOT_FOUND';
  
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    error: 'ROUTE_NOT_FOUND',
    method: req.method,
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
    availableRoutes: {
      auth: '/api/auth',
      parasiteControl: '/api/parasite-control',
      vaccination: '/api/vaccination',
      mobileClinics: '/api/mobile-clinics',
      equineHealth: '/api/equine-health',
      laboratories: '/api/laboratories',
      clients: '/api/clients',
      reports: '/api/reports',
      upload: '/api/upload',
      villages: '/api/villages',
      holdingCodes: '/api/holding-codes',
      importExport: '/api/import-export',
      health: '/health',
      docs: '/api-docs'
    }
  });
};

module.exports = notFound;
