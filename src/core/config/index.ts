import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

/**
 * Configuration interface for the TrafficWork framework
 */
export interface Config {
  // Application
  app: {
    name: string;
    env: string;
    port: number;
    url: string;
  };

  // Database
  database: {
    url: string;
  };

  // Stripe
  stripe: {
    secretKey: string;
    publishableKey: string;
    webhookSecret: string;
    prices: {
      monthly: string;
      annual: string;
    };
  };

  // JWT
  jwt: {
    secret: string;
    expiresIn: string;
  };

  // Keitaro
  keitaro: {
    trackerUrl: string;
    postbackKey: string;
    campaignId: string;
    jsEnabled: boolean;
    statuses: {
      registration: string;
      purchase: string;
    };
  };

  // Security
  security: {
    corsOrigin: string;
    rateLimit: {
      windowMs: number;
      maxRequests: number;
    };
  };

  // Logging
  logging: {
    level: string;
    filePath: string;
  };

  // SSL
  ssl: {
    enabled: boolean;
    certPath?: string;
    keyPath?: string;
  };

  // Apple Pay
  applePay: {
    domainVerificationFile?: string;
  };
}

/**
 * Validates required environment variables
 */
function validateEnv(): void {
  const required = [
    'DATABASE_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'JWT_SECRET',
    'KEITARO_TRACKER_URL',
    'KEITARO_POSTBACK_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Creates and exports the configuration object
 */
export function createConfig(): Config {
  // Validate environment variables in production
  if (process.env.NODE_ENV === 'production') {
    validateEnv();
  }

  return {
    app: {
      name: process.env.APP_NAME || 'TrafficWork App',
      env: process.env.NODE_ENV || 'development',
      port: parseInt(process.env.PORT || '3000', 10),
      url: process.env.APP_URL || 'http://localhost:3000'
    },

    database: {
      url: process.env.DATABASE_URL || 'postgresql://localhost:5432/trafficwork_db'
    },

    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
      prices: {
        monthly: process.env.STRIPE_MONTHLY_PRICE_ID || '',
        annual: process.env.STRIPE_ANNUAL_PRICE_ID || ''
      }
    },

    jwt: {
      secret: process.env.JWT_SECRET || 'default_secret_change_in_production',
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    },

    keitaro: {
      trackerUrl: process.env.KEITARO_TRACKER_URL || '',
      postbackKey: process.env.KEITARO_POSTBACK_KEY || '',
      campaignId: process.env.KEITARO_CAMPAIGN_ID || '',
      jsEnabled: process.env.KEITARO_JS_ENABLED === 'true',
      statuses: {
        registration: process.env.KEITARO_STATUS_REGISTRATION || 'reg',
        purchase: process.env.KEITARO_STATUS_PURCHASE || 'sale'
      }
    },

    security: {
      corsOrigin: process.env.CORS_ORIGIN || '*',
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
      }
    },

    logging: {
      level: process.env.LOG_LEVEL || 'info',
      filePath: process.env.LOG_FILE_PATH || './logs/app.log'
    },

    ssl: {
      enabled: process.env.SSL_ENABLED === 'true',
      certPath: process.env.SSL_CERT_PATH,
      keyPath: process.env.SSL_KEY_PATH
    },

    applePay: {
      domainVerificationFile: process.env.APPLE_PAY_DOMAIN_VERIFICATION_FILE
    }
  };
}

// Export singleton config instance
export const config = createConfig();

// Export helper to get Stripe public config for frontend
export function getPublicConfig() {
  return {
    stripe: {
      publishableKey: config.stripe.publishableKey
    },
    app: {
      name: config.app.name,
      url: config.app.url
    }
  };
}
