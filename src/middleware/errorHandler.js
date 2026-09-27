const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  logger.error(err.stack || err.message || err);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || 'Internal server error',
  });
};
