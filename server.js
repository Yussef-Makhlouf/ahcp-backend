const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
require('dotenv').config();

// Import routes with error handling
let authRoutes, usersRoutes, sectionsRoutes, seedRoutes;
let parasiteControlRoutes, vaccinationRoutes, mobileClinicsRoutes;
let equineHealthRoutes, laboratoriesRoutes, clientsRoutes;
let reportsRoutes, uploadRoutes, villagesRoutes;

let errorHandler, notFound, authMiddleware, devAuth, devNoAuth;

try {
  authRoutes = require('./src/routes/auth');
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

  // Import middleware
  errorHandler = require('./src/middleware/errorHandler').errorHandler;
  notFound = require('./src/middleware/errorHandler').notFound;
  authMiddleware = require('./src/middleware/auth').auth;
  devAuth = require('./src/middleware/dev-auth');
  devNoAuth = require('./src/middleware/dev-no-auth');
} catch (error) {
  console.error('Error loading routes or middleware:', error.message);
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
    'X-Requested-With'
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

// Production mode check
if (process.env.NODE_ENV === 'production') {
  console.log('🔒 Production Mode: Full authentication enabled');
} else {
  console.log('🔓 Development Mode: Simplified authentication enabled');
}

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
if (authRoutes) app.use('/api/auth', authRoutes);
if (sectionsRoutes) app.use('/api/sections', sectionsRoutes);
if (seedRoutes) app.use('/api/seed', seedRoutes);

// Use authentication based on environment
const selectedAuth = process.env.NODE_ENV === 'production' ? authMiddleware : devAuth;

// Only add routes if they exist and auth middleware is available
if (usersRoutes && selectedAuth) app.use('/api/users', selectedAuth, usersRoutes);
if (parasiteControlRoutes && selectedAuth) app.use('/api/parasite-control', selectedAuth, parasiteControlRoutes);
if (vaccinationRoutes && selectedAuth) app.use('/api/vaccination', selectedAuth, vaccinationRoutes);
if (mobileClinicsRoutes && selectedAuth) app.use('/api/mobile-clinics', selectedAuth, mobileClinicsRoutes);
if (equineHealthRoutes && selectedAuth) app.use('/api/equine-health', selectedAuth, equineHealthRoutes);
if (laboratoriesRoutes && selectedAuth) app.use('/api/laboratories', selectedAuth, laboratoriesRoutes);
if (clientsRoutes && selectedAuth) app.use('/api/clients', selectedAuth, clientsRoutes);
if (reportsRoutes && selectedAuth) app.use('/api/reports', selectedAuth, reportsRoutes);
if (uploadRoutes && selectedAuth) app.use('/api/upload', selectedAuth, uploadRoutes);
if (villagesRoutes && selectedAuth) app.use('/api/villages', selectedAuth, villagesRoutes);

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
        villages: '/api/villages'
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
if (notFound) app.use(notFound);
if (errorHandler) app.use(errorHandler);

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
}

module.exports = app;
