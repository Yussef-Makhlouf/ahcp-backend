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

// Import routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const sectionsRoutes = require('./routes/sections');
const seedRoutes = require('./routes/seed');
const parasiteControlRoutes = require('./routes/parasiteControl');
const vaccinationRoutes = require('./routes/vaccination');
const mobileClinicsRoutes = require('./routes/mobileClinics');
const equineHealthRoutes = require('./routes/equineHealth');
const laboratoriesRoutes = require('./routes/laboratories');
const clientsRoutes = require('./routes/clients');
const reportsRoutes = require('./routes/reports');
const uploadRoutes = require('./routes/upload');
const villagesRoutes = require('./routes/villages');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const { auth: authMiddleware } = require('./middleware/auth');
const devAuth = require('./middleware/dev-auth');
const devNoAuth = require('./middleware/dev-no-auth');

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

// CORS configuration - السماح لجميع الأصول
const corsOptions = {
  origin: '*', // السماح لجميع الأصول
  credentials: false, // تجنب مشاكل credentials
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

// Middleware إضافي للـ CORS - السماح لجميع الأصول
// app.use((req, res, next) => {
//   // تعيين headers الأساسية - السماح لجميع الأصول
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS,HEAD');
//   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Expires, X-CSRF-Token');
//   res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Content-Disposition');
//   res.header('Access-Control-Max-Age', '86400');
  
//   // التعامل مع preflight requests
//   if (req.method === 'OPTIONS') {
//     res.status(200).end();
//     return;
//   }
  
//   next();
// });

// Production mode check - تفعيل المصادقة الكاملة
if (process.env.NODE_ENV === 'production') {
  console.log('🔒 Production Mode: Full authentication enabled');
} else {
  console.log('🔓 Development Mode: Simplified authentication enabled');
}

// Compression middlewarea
app.use(compression());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware to prevent 304 responses and ensure 200 OK
app.use((req, res, next) => {
  // Set headers to prevent caching and ensure 200 OK responses
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
});

// Static files
app.use('/uploads', express.static('uploads'));

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
        url: `http://localhost:${PORT}`,
        description: 'Development server'
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
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/sections', sectionsRoutes);
app.use('/api/seed', seedRoutes);

// استخدام المصادقة الحقيقية بناءً على البيئة
const selectedAuth = process.env.NODE_ENV === 'production' ? authMiddleware : devAuth;

app.use('/api/users', selectedAuth, usersRoutes);
app.use('/api/parasite-control', selectedAuth, parasiteControlRoutes);
app.use('/api/vaccination', selectedAuth, vaccinationRoutes);
app.use('/api/mobile-clinics', selectedAuth, mobileClinicsRoutes);
app.use('/api/equine-health', selectedAuth, equineHealthRoutes);
app.use('/api/laboratories', selectedAuth, laboratoriesRoutes);
app.use('/api/clients', selectedAuth, clientsRoutes);
app.use('/api/reports', selectedAuth, reportsRoutes);
app.use('/api/upload', selectedAuth, uploadRoutes);
app.use('/api/villages', selectedAuth, villagesRoutes);

// Welcome message
app.get('/', (req, res) => {
  res.json({
    message: 'مرحباً بك في نظام إدارة الصحة الحيوانية - AHCP API',
    version: '1.0.0',
    documentation: process.env.API_DOCS_ENABLED === 'true' ? '/api-docs' : 'Documentation disabled',
    endpoints: {
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
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ahcp_database', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB successfully');
  console.log(`📊 Database: ${mongoose.connection.name}`);
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error.message);
  process.exit(1);
});

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

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 AHCP Backend Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
