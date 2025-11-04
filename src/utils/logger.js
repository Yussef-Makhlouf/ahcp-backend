/**
 * Professional Logger Configuration using Winston
 * Replaces all console.log statements with structured logging
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists (only in non-serverless environments)
const logsDir = path.join(__dirname, '../../logs');
const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

if (!isServerless && !fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (error) {
    console.warn('Could not create logs directory:', error.message);
  }
}

// Custom format for console output with colors and emojis
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...metadata }) => {
    let emoji = '📝';
    if (level === 'error') emoji = '❌';
    else if (level === 'warn') emoji = '⚠️';
    else if (level === 'info') emoji = '✅';
    else if (level === 'debug') emoji = '🔍';

    let msg = `${timestamp} ${emoji} [${level.toUpperCase()}]: ${message}`;
    
    // Add metadata if exists
    if (Object.keys(metadata).length > 0) {
      msg += `\n${JSON.stringify(metadata, null, 2)}`;
    }
    
    // Add stack trace for errors
    if (stack) {
      msg += `\n${stack}`;
    }
    
    return msg;
  })
);

// Format for file output (JSON for easy parsing)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const transports = [];

// Only add file transports in non-serverless environments
if (!isServerless) {
  transports.push(
    // Error logs - separate file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Combined logs - all levels
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'ahcp-backend' },
  transports,
});

// Console transport - always enabled in serverless environments, or in development
if (isServerless || process.env.NODE_ENV !== 'production' || process.env.ENABLE_CONSOLE_LOGS === 'true') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        consoleFormat
      ),
    })
  );
}

// Performance logging helper
logger.logPerformance = (operation, duration, metadata = {}) => {
  const level = duration > 1000 ? 'warn' : 'info';
  logger[level](`Performance: ${operation}`, {
    duration: `${duration}ms`,
    ...metadata,
  });
};

// Query logging helper
logger.logQuery = (modelName, filter, duration, resultCount) => {
  logger.info(`Database Query: ${modelName}`, {
    filter: JSON.stringify(filter),
    duration: `${duration}ms`,
    resultCount,
  });
};

// API request logging helper
logger.logRequest = (method, url, statusCode, duration) => {
  const level = statusCode >= 400 ? 'warn' : 'info';
  logger[level](`API Request: ${method} ${url}`, {
    statusCode,
    duration: `${duration}ms`,
  });
};

// Security event logging
logger.logSecurity = (event, details = {}) => {
  logger.warn(`Security Event: ${event}`, details);
};

module.exports = logger;

