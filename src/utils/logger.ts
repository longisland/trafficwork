import winston from 'winston';
import path from 'path';
import { config } from '../core/config';

/**
 * Create Winston logger instance with file and console transports
 */
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: config.app.name },
  transports: [
    // Write all logs with importance level of 'error' or less to error.log
    new winston.transports.File({
      filename: path.join(path.dirname(config.logging.filePath), 'error.log'),
      level: 'error'
    }),
    // Write all logs to combined.log
    new winston.transports.File({
      filename: config.logging.filePath
    })
  ]
});

// If we're not in production, log to the console with colorized output
if (config.app.env !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

/**
 * Log HTTP requests
 */
export function logRequest(req: any, res: any, next: any) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  });
  
  next();
}

/**
 * Log errors with context
 */
export function logError(error: Error, context?: any) {
  logger.error('Error occurred', {
    message: error.message,
    stack: error.stack,
    context
  });
}

/**
 * Log Stripe events
 */
export function logStripeEvent(event: any) {
  logger.info('Stripe event', {
    type: event.type,
    id: event.id,
    created: new Date(event.created * 1000)
  });
}

/**
 * Log Keitaro tracking events
 */
export function logKeitaroEvent(eventType: string, data: any) {
  logger.info('Keitaro tracking event', {
    eventType,
    data
  });
}

export default logger;
