// ============================================================================
// Infrastructure Deployment Generator — Error Handler Middleware
// ============================================================================
// Centralized error handling with consistent response format.
// ============================================================================

import config from '../config/index.js';

export function errorHandler() {
  return (err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    console.error(`[Error] ${status} ${req.method} ${req.path}: ${message}`);
    if (config.app.nodeEnv !== 'production') {
      console.error(err.stack);
    }

    res.status(status).json({
      error: status >= 500 ? 'Internal Server Error' : message,
      message,
      ...(config.app.nodeEnv !== 'production' && {
        stack: err.stack,
        path: req.path,
      }),
    });
  };
}

export default errorHandler;
