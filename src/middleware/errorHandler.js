const mongoose = require('mongoose');

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error('Error:', err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = {
      message,
      statusCode: 404,
      error: 'RESOURCE_NOT_FOUND'
    };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    const message = `Duplicate value for ${field}: ${value}. This ${field} already exists.`;
    error = {
      message,
      statusCode: 400,
      error: 'DUPLICATE_FIELD',
      field,
      value
    };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    const fields = Object.keys(err.errors);
    error = {
      message,
      statusCode: 400,
      error: 'VALIDATION_ERROR',
      fields
    };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = {
      message: 'Invalid token',
      statusCode: 401,
      error: 'INVALID_TOKEN'
    };
  }

  if (err.name === 'TokenExpiredError') {
    error = {
      message: 'Token expired',
      statusCode: 401,
      error: 'TOKEN_EXPIRED'
    };
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    error = {
      message: 'File too large',
      statusCode: 400,
      error: 'FILE_TOO_LARGE',
      maxSize: err.limit
    };
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    error = {
      message: 'Too many files',
      statusCode: 400,
      error: 'TOO_MANY_FILES',
      maxCount: err.limit
    };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error = {
      message: 'Unexpected file field',
      statusCode: 400,
      error: 'UNEXPECTED_FILE_FIELD',
      fieldName: err.field
    };
  }

  // Custom application errors
  if (err.isOperational) {
    error = {
      message: err.message,
      statusCode: err.statusCode || 500,
      error: err.error || 'OPERATIONAL_ERROR'
    };
  }

  // Database connection errors
  if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
    error = {
      message: 'Database connection error',
      statusCode: 503,
      error: 'DATABASE_CONNECTION_ERROR'
    };
  }

  // Rate limiting errors
  if (err.status === 429) {
    error = {
      message: 'Too many requests, please try again later',
      statusCode: 429,
      error: 'RATE_LIMIT_EXCEEDED',
      retryAfter: err.retryAfter
    };
  }

  // Default error
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Server Error';
  const errorCode = error.error || 'INTERNAL_SERVER_ERROR';

  const response = {
    success: false,
    message,
    error: errorCode
  };

  // Add additional error details in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    response.details = error;
  } else {
    // في الإنتاج، إخفاء التفاصيل الحساسة
    delete response.stack;
    delete response.details;
  }

  // Add field-specific errors if available
  if (error.fields) {
    response.fields = error.fields;
  }

  if (error.field) {
    response.field = error.field;
  }

  if (error.value) {
    response.value = error.value;
  }

  if (error.maxSize) {
    response.maxSize = error.maxSize;
  }

  if (error.maxCount) {
    response.maxCount = error.maxCount;
  }

  if (error.retryAfter) {
    response.retryAfter = error.retryAfter;
  }

  res.status(statusCode).json(response);
};

/**
 * Custom error class for operational errors
 */
class AppError extends Error {
  constructor(message, statusCode, errorCode = null) {
    super(message);
    this.statusCode = statusCode;
    this.error = errorCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async error wrapper to catch async errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  AppError,
  asyncHandler
};
