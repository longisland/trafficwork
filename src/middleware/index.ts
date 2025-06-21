import { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { config } from '../core/config';
import { logRequest } from '../utils/logger';

/**
 * Security middleware
 */
export function securityMiddleware() {
  return [
    // Helmet for security headers
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", config.keitaro.trackerUrl],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://api.stripe.com", config.keitaro.trackerUrl],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
        },
      },
      crossOriginEmbedderPolicy: false, // Required for Stripe
    }),

    // CORS
    cors({
      origin: config.security.corsOrigin === '*' 
        ? true 
        : config.security.corsOrigin.split(',').map(origin => origin.trim()),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),

    // Cookie parser
    cookieParser(),
  ];
}

/**
 * Rate limiting middleware
 */
export function rateLimitMiddleware() {
  return rateLimit({
    windowMs: config.security.rateLimit.windowMs,
    max: config.security.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * Request logging middleware
 */
export { logRequest };

/**
 * Error handling middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log error
  console.error('Error:', err);

  // Don't leak error details in production
  const isDev = config.app.env === 'development';
  
  res.status(500).json({
    error: 'Internal server error',
    message: isDev ? err.message : 'Something went wrong',
    stack: isDev ? err.stack : undefined,
  });
}

/**
 * Not found handler
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
}

/**
 * HTTPS redirect middleware (for production)
 */
export function httpsRedirect(req: Request, res: Response, next: NextFunction) {
  if (config.app.env === 'production' && !req.secure && req.get('x-forwarded-proto') !== 'https') {
    return res.redirect('https://' + req.get('host') + req.url);
  }
  next();
}

/**
 * Raw body parser for webhooks
 */
export function rawBodyParser(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith('/api/webhook/')) {
    let data = '';
    req.setEncoding('utf8');
    
    req.on('data', (chunk) => {
      data += chunk;
    });
    
    req.on('end', () => {
      req.body = data;
      next();
    });
  } else {
    next();
  }
}

/**
 * Trust proxy settings
 */
export function trustProxy() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Trust proxy headers in production
    if (config.app.env === 'production') {
      req.app.set('trust proxy', true);
    }
    next();
  };
}

/**
 * Custom headers middleware
 */
export function customHeaders(req: Request, res: Response, next: NextFunction) {
  // Add custom headers
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Remove powered by header
  res.removeHeader('X-Powered-By');
  
  next();
}

/**
 * Request ID middleware for tracking
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = Math.random().toString(36).substring(2, 15);
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}
