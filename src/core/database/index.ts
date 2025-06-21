import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import logger from '../../utils/logger';

/**
 * Extended Prisma Client with logging in development
 */
class DatabaseClient {
  private static instance: PrismaClient;

  static getInstance(): PrismaClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new PrismaClient({
        log: config.app.env === 'development' 
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
      });

      // Log database connection
      DatabaseClient.instance.$connect()
        .then(() => {
          logger.info('Database connected successfully');
        })
        .catch((error) => {
          logger.error('Failed to connect to database', error);
          process.exit(1);
        });
    }

    return DatabaseClient.instance;
  }

  static async disconnect(): Promise<void> {
    if (DatabaseClient.instance) {
      await DatabaseClient.instance.$disconnect();
      logger.info('Database disconnected');
    }
  }
}

// Export singleton instance
export const prisma = DatabaseClient.getInstance();

// Export types from Prisma Client
export * from '@prisma/client';

/**
 * Database health check
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed', error);
    return false;
  }
}

/**
 * Run database migrations (for production)
 */
export async function runMigrations(): Promise<void> {
  if (config.app.env === 'production') {
    logger.info('Running database migrations...');
    // In production, migrations should be run separately
    // This is just a placeholder for the migration process
    logger.info('Migrations should be run using: npx prisma migrate deploy');
  }
}

/**
 * Seed database with initial data (for development)
 */
export async function seedDatabase(): Promise<void> {
  if (config.app.env !== 'development') {
    logger.warn('Database seeding is only available in development');
    return;
  }

  logger.info('Seeding database...');
  
  try {
    // Example: Create test user
    const testUser = await prisma.user.findUnique({
      where: { email: 'test@example.com' }
    });

    if (!testUser) {
      await prisma.user.create({
        data: {
          email: 'test@example.com',
          password: '$2a$10$YourHashedPasswordHere', // This should be properly hashed
          name: 'Test User'
        }
      });
      logger.info('Test user created');
    }
  } catch (error) {
    logger.error('Database seeding failed', error);
  }
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<void> {
  try {
    const result = await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
    
    if (result.count > 0) {
      logger.info(`Cleaned up ${result.count} expired sessions`);
    }
  } catch (error) {
    logger.error('Failed to cleanup expired sessions', error);
  }
}

/**
 * Database transaction helper
 */
export async function transaction<T>(
  fn: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(fn);
}
