// Error handling middleware

export function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  // Default error
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized access';
  } else if (err.code === '23505') { // PostgreSQL unique violation
    statusCode = 409;
    message = 'Resource already exists';
  } else if (err.code === '23503') { // PostgreSQL foreign key violation
    statusCode = 400;
    message = 'Invalid reference';
  }

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

export function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path
  });
}

// Async handler wrapper to catch errors
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// API key validation middleware (for internal services)
export function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const validKey = process.env.INTERNAL_API_KEY;

  if (validKey && apiKey !== validKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
}

