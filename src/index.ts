import express, { Express } from 'express';
import { createServer } from 'http';
import { config } from './core/config';
import { prisma, checkDatabaseConnection } from './core/database';
import { setupApi } from './core/api';
import {
  securityMiddleware,
  rateLimitMiddleware,
  logRequest,
  errorHandler,
  notFoundHandler,
  httpsRedirect,
  rawBodyParser,
  trustProxy,
  customHeaders,
  requestId
} from './middleware';
import logger from './utils/logger';
import path from 'path';

/**
 * TrafficWork Framework Application
 */
export class TrafficWorkApp {
  private app: Express;
  private server: any;

  constructor() {
    this.app = express();
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    try {
      // Check database connection
      const dbConnected = await checkDatabaseConnection();
      if (!dbConnected) {
        throw new Error('Failed to connect to database');
      }

      // Setup middleware
      this.setupMiddleware();

      // Setup API routes
      setupApi(this.app);

      // Setup static files (if needed)
      this.setupStaticFiles();

      // Setup error handlers
      this.setupErrorHandlers();

      logger.info('Application initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize application', error);
      throw error;
    }
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // Trust proxy
    this.app.use(trustProxy());

    // Request ID
    this.app.use(requestId);

    // Custom headers
    this.app.use(customHeaders);

    // HTTPS redirect (production only)
    this.app.use(httpsRedirect);

    // Raw body parser for webhooks
    this.app.use(rawBodyParser);

    // Security middleware
    this.app.use(securityMiddleware());

    // Rate limiting
    this.app.use('/api/', rateLimitMiddleware());

    // Body parsing (skip for webhooks)
    this.app.use((req, res, next) => {
      if (req.path.startsWith('/api/webhook/')) {
        next();
      } else {
        express.json()(req, res, next);
      }
    });
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use(logRequest);
  }

  /**
   * Setup static files
   */
  private setupStaticFiles(): void {
    // Serve static files from public directory
    this.app.use(express.static(path.join(__dirname, '../public')));

    // Serve Stripe verification file for Apple Pay (if exists)
    if (config.applePay.domainVerificationFile) {
      this.app.get('/.well-known/apple-developer-merchantid-domain-association', (req, res) => {
        res.sendFile(config.applePay.domainVerificationFile!);
      });
    }
  }

  /**
   * Setup error handlers
   */
  private setupErrorHandlers(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  /**
   * Start the server
   */
  async start(port?: number): Promise<void> {
    const serverPort = port || config.app.port;

    this.server = createServer(this.app);

    return new Promise((resolve, reject) => {
      this.server.listen(serverPort, () => {
        logger.info(`Server started on port ${serverPort}`);
        logger.info(`Environment: ${config.app.env}`);
        logger.info(`App URL: ${config.app.url}`);
        resolve();
      });

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${serverPort} is already in use`);
        } else {
          logger.error('Server error', error);
        }
        reject(error);
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('Server stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Get Express app instance
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down gracefully...');

    // Stop accepting new connections
    await this.stop();

    // Close database connection
    await prisma.$disconnect();

    logger.info('Shutdown complete');
  }
}

/**
 * Create and configure application
 */
export async function createApp(): Promise<TrafficWorkApp> {
  const app = new TrafficWorkApp();
  await app.initialize();
  return app;
}

/**
 * Start application (for direct execution)
 */
if (require.main === module) {
  (async () => {
    try {
      const app = await createApp();
      await app.start();

      // Handle graceful shutdown
      process.on('SIGTERM', async () => {
        await app.shutdown();
        process.exit(0);
      });

      process.on('SIGINT', async () => {
        await app.shutdown();
        process.exit(0);
      });
    } catch (error) {
      logger.error('Failed to start application', error);
      process.exit(1);
    }
  })();
}

// Export all framework modules
export * from './core/config';
export * from './core/database';
export * from './core/auth';
export * from './core/payment';
export * from './core/analytics';
export * from './core/api';
export * from './middleware';
export * from './utils/logger';
