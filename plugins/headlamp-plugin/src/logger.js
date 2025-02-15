const winston = require('winston');
const path = require('path');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

class Logger {
  constructor() {
    const logDir = process.env.LOG_DIR || '/logs';
    const logLevel = process.env.LOG_LEVEL || 'info';

    this.logger = winston.createLogger({
      level: logLevel,
      format: logFormat,
      defaultMeta: { service: 'headlamp-plugin' },
      transports: [
        // Write all logs to the console
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        // Write all logs to appropriate files
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error'
        }),
        new winston.transports.File({
          filename: path.join(logDir, 'combined.log')
        })
      ]
    });

    // Handle uncaught exceptions
    this.logger.exceptions.handle(
      new winston.transports.File({
        filename: path.join(logDir, 'exceptions.log')
      })
    );

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (error) => {
      this.logger.error('Unhandled Promise Rejection:', error);
    });
  }

  /**
   * Log an info message
   * @param {string} message - The message to log
   * @param {Object} [meta] - Additional metadata
   */
  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  /**
   * Log a warning message
   * @param {string} message - The message to log
   * @param {Object} [meta] - Additional metadata
   */
  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  /**
   * Log an error message
   * @param {string|Error} error - The error to log
   * @param {Object} [meta] - Additional metadata
   */
  error(error, meta = {}) {
    if (error instanceof Error) {
      this.logger.error(error.message, { ...meta, stack: error.stack });
    } else {
      this.logger.error(error, meta);
    }
  }

  /**
   * Log a debug message
   * @param {string} message - The message to log
   * @param {Object} [meta] - Additional metadata
   */
  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  /**
   * Create a child logger with additional default metadata
   * @param {Object} defaultMeta - Default metadata for the child logger
   * @returns {Logger} A new logger instance with the combined metadata
   */
  child(defaultMeta) {
    const childLogger = new Logger();
    childLogger.logger = this.logger.child(defaultMeta);
    return childLogger;
  }
}

// Export a singleton instance
module.exports = new Logger(); 