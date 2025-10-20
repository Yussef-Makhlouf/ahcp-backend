const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
// Load environment variables
require('dotenv').config({ path: './production.env' });
require('dotenv').config();

// Check critical environment variables
console.log('🔍 Environment check:');
console.log('📊 NODE_ENV:', process.env.NODE_ENV);
console.log('🔑 JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');
console.log('🗄️ MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('🌐 CORS_ORIGIN:', process.env.CORS_ORIGIN);

// Import routes with error handling
let authRoutes, usersRoutes, sectionsRoutes, seedRoutes;
let parasiteControlRoutes, vaccinationRoutes, mobileClinicsRoutes;
let equineHealthRoutes, laboratoriesRoutes, clientsRoutes;
let reportsRoutes, uploadRoutes, villagesRoutes, holdingCodesRoutes, importExportRoutes;
let dromoImportRoutes, dropdownListsRoutes;

let errorHandler, notFound, authMiddleware;

try {
  console.log('🔄 Loading routes...');
  authRoutes = require('./src/routes/auth');
  console.log('✅ Auth routes loaded');
  usersRoutes = require('./src/routes/users');
  sectionsRoutes = require('./src/routes/sections');
  seedRoutes = require('./src/routes/seed');
  parasiteControlRoutes = require('./src/routes/parasiteControl');
  vaccinationRoutes = require('./src/routes/vaccination');
  mobileClinicsRoutes = require('./src/routes/mobileClinics');
  equineHealthRoutes = require('./src/routes/equineHealth');
  laboratoriesRoutes = require('./src/routes/laboratories');
  clientsRoutes = require('./src/routes/clients');
  reportsRoutes = require('./src/routes/reports');
  uploadRoutes = require('./src/routes/upload');
  villagesRoutes = require('./src/routes/villages');
  holdingCodesRoutes = require('./src/routes/holdingCodes');
  importExportRoutes = require('./src/routes/import-export');
  dromoImportRoutes = require('./src/routes/dromo-import');
  dropdownListsRoutes = require('./src/routes/dropdownLists');
  console.log('✅ Dromo import routes loaded');

  // Import middleware
  errorHandler = require('./src/middleware/errorHandler').errorHandler;
  notFound = require('./src/middleware/notFound');
  authMiddleware = require('./src/middleware/auth').auth;
  console.log('✅ All routes and middleware loaded successfully');
} catch (error) {
  console.error('❌ Error loading routes or middleware:', error.message);
  console.error('❌ Stack trace:', error.stack);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept', 
    'Origin',
    'Cache-Control',
    'Pragma',
    'Expires',
    'X-CSRF-Token',
    'X-Requested-With',
    'X-Table-Type',
    'X-Source',
    'X-Dromo-Webhook'
  ],
  exposedHeaders: [
    'Content-Length',
    'Content-Type',
    'Content-Disposition'
  ],
  preflightContinue: false,
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Production mode
console.log('🔒 Production Mode: Full authentication enabled');

// Compression middleware
app.use(compression());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware to prevent 304 responses and ensure 200 OK
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
});

// Static files - Skip in serverless environment
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  app.use('/uploads', express.static('uploads'));
}

// Swagger documentation setup
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AHCP API Documentation',
      version: '1.0.0',
      description: 'Animal Health Care Program - Complete API Documentation',
      contact: {
        name: 'AHCP Development Team',
        email: 'dev@ahcp.com'
      }
    },
    servers: [
      {
        url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${PORT}`,
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/routes/*.js', './src/models/*.js'],
};

const specs = swaggerJsdoc(swaggerOptions);

// API Documentation
if (process.env.API_DOCS_ENABLED === 'true') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'AHCP API Documentation'
  }));
}

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: '1.0.0',
      platform: process.env.VERCEL ? 'Vercel' : 'Local',
      database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Simple test endpoint
app.get('/test', (req, res) => {
  res.json({
    message: 'AHCP API is working!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    platform: process.env.VERCEL ? 'Vercel' : 'Local'
  });
});

// API routes - only add if routes are loaded successfully
if (authRoutes) {
  console.log('✅ Adding auth routes to /api/auth');
  app.use('/api/auth', authRoutes);
} else {
  console.error('❌ Auth routes not loaded - this will cause 500 errors');
  // Add a fallback route for auth
  app.use('/api/auth', (req, res) => {
    res.status(500).json({
      success: false,
      message: 'Auth routes not loaded',
      error: 'AUTH_ROUTES_NOT_LOADED'
    });
  });
}
if (sectionsRoutes) app.use('/api/sections', sectionsRoutes);
if (seedRoutes) app.use('/api/seed', seedRoutes);

// Use authentication for production
const selectedAuth = authMiddleware;

// Routes that need authentication
if (usersRoutes && selectedAuth) app.use('/api/users', selectedAuth, usersRoutes);

// Routes with mixed authentication (some endpoints protected, some not)
if (parasiteControlRoutes) {
  console.log('✅ Loading parasite-control routes with authentication');
  app.use('/api/parasite-control', selectedAuth, parasiteControlRoutes);
}
if (vaccinationRoutes) {
  console.log('✅ Loading vaccination routes with authentication');
  app.use('/api/vaccination', selectedAuth, vaccinationRoutes);
}
if (mobileClinicsRoutes) {
  console.log('✅ Loading mobile-clinics routes with authentication');
  app.use('/api/mobile-clinics', selectedAuth, mobileClinicsRoutes);
}
if (equineHealthRoutes) {
  console.log('✅ Loading equine-health routes with authentication');
  app.use('/api/equine-health', selectedAuth, equineHealthRoutes);
}
if (laboratoriesRoutes) {
  console.log('✅ Loading laboratories routes with authentication');
  app.use('/api/laboratories', selectedAuth, laboratoriesRoutes);
}
if (clientsRoutes) {
  console.log('✅ Loading clients routes with authentication');
  app.use('/api/clients', selectedAuth, clientsRoutes);
}
if (reportsRoutes) {
  console.log('✅ Loading reports routes with authentication');
  app.use('/api/reports', selectedAuth, reportsRoutes);
}
if (uploadRoutes) {
  console.log('✅ Loading upload routes with authentication');
  app.use('/api/upload', selectedAuth, uploadRoutes);
}
if (villagesRoutes && selectedAuth) {
  console.log('✅ Loading villages routes with authentication');
  app.use('/api/villages', selectedAuth, villagesRoutes);
}
if (holdingCodesRoutes) {
  console.log('✅ Loading holding-codes routes with authentication');
  app.use('/api/holding-codes', selectedAuth, holdingCodesRoutes);
}
if (dropdownListsRoutes) {
  console.log('✅ Loading dropdown-lists routes with authentication');
  app.use('/api/dropdown-lists', selectedAuth, dropdownListsRoutes);
}

// Import/Export routes
if (importExportRoutes) {
  console.log('✅ Loading import-export routes with authentication');
  app.use('/api/import-export', selectedAuth, importExportRoutes);
}

// Dedicated Dromo Import routes (no auth required)
if (dromoImportRoutes) {
  console.log('✅ Loading dedicated Dromo import routes (no auth)');
  app.use('/import-export', dromoImportRoutes);
}


// Test webhook endpoint
app.post('/import-export/test-webhook', (req, res) => {
  console.log('🧪 Test webhook called');
  console.log('🧪 Headers:', req.headers);
  console.log('🧪 Body:', req.body);
  res.json({
    success: true,
    message: 'Test webhook working',
    receivedData: req.body
  });
});

// Test endpoint for debugging
app.get('/test-routes', (req, res) => {
  res.json({
    message: 'Routes test',
    mobileClinicsRoutes: !!mobileClinicsRoutes,
    clientsRoutes: !!clientsRoutes,
    vaccinationRoutes: !!vaccinationRoutes,
    timestamp: new Date().toISOString()
  });
});

// Welcome message
app.get('/', (req, res) => {
  try {
    res.json({
      message: 'مرحباً بك في نظام إدارة الصحة الحيوانية - AHCP API',
      version: '1.0.0',
      platform: process.env.VERCEL ? 'Vercel' : 'Local',
      documentation: process.env.API_DOCS_ENABLED === 'true' ? '/api-docs' : 'Documentation disabled',
      endpoints: {
        test: '/test',
        health: '/health',
        auth: '/api/auth',
        users: '/api/users',
        sections: '/api/sections',
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
        dropdownLists: '/api/dropdown-lists'
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Error handling middleware - only add if they exist
if (notFound) {
  console.log('✅ Adding notFound middleware');
  app.use(notFound);
} else {
  console.error('❌ notFound middleware not loaded');
}

if (errorHandler) {
  console.log('✅ Adding errorHandler middleware');
  app.use(errorHandler);
} else {
  console.error('❌ errorHandler middleware not loaded');
}

// Database connection with better error handling
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI environment variable is not set');
      return;
    }
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB successfully');
    console.log(`📊 Database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    // Don't exit the process in serverless environment
  }
};

// Connect to database
connectDB();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
    process.exit(1);
  }
});

// Start server only if not in Vercel environment
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 AHCP Backend Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  });
} else {
  console.log('🌐 Running on Vercel environment');
}

// Add global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

module.exports = app;
