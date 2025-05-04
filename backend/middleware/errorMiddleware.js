const ApiError = require("../utils/ApiError");

// Custom error handler for API errors
const apiErrorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      status: "error",
      message: err.message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  }
  next(err);
};

// Handle validation errors
const validationErrorHandler = (err, req, res, next) => {
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((error) => error.message);
    return res.status(400).json({
      status: "error",
      message: "Validation Error",
      errors,
    });
  }
  next(err);
};

// Handle JWT errors
const jwtErrorHandler = (err, req, res, next) => {
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      status: "error",
      message: "Invalid token. Please log in again.",
    });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      status: "error",
      message: "Your token has expired. Please log in again.",
    });
  }
  next(err);
};

// Handle file upload errors
const multerErrorHandler = (err, req, res, next) => {
  if (err.name === "MulterError") {
    return res.status(400).json({
      status: "error",
      message: err.message,
    });
  }
  next(err);
};

// Handle database errors
const databaseErrorHandler = (err, req, res, next) => {
  if (err.name === "MongoError" || err.name === "MongoServerError") {
    if (err.code === 11000) {
      return res.status(409).json({
        status: "error",
        message: "Duplicate field value entered",
      });
    }
    return res.status(500).json({
      status: "error",
      message: "Database error occurred",
      ...(process.env.NODE_ENV === "development" && { error: err.message }),
    });
  }
  next(err);
};

// Generic error handler
const genericErrorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    status: "error",
    message,
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
      error: err,
    }),
  });
};

// Not found handler
const notFoundHandler = (req, res, next) => {
  const error = new ApiError(`Not Found - ${req.originalUrl}`, 404);
  next(error);
};

module.exports = {
  apiErrorHandler,
  validationErrorHandler,
  jwtErrorHandler,
  multerErrorHandler,
  databaseErrorHandler,
  genericErrorHandler,
  notFoundHandler,
};
