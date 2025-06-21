export * from './routes';

import { Express, Request, Response, NextFunction } from 'express';
import { createApiRoutes } from './routes';
import { createAdminRoutes } from '../admin';
import { KeitaroService } from '../analytics';

/**
 * Setup API routes and middleware for the application
 */
export function setupApi(app: Express): void {
  // Add Keitaro tracking middleware
  app.use(KeitaroService.trackingMiddleware());

  // Mount API routes
  app.use('/api', createApiRoutes());

  // Mount admin routes
  app.use('/api/admin', createAdminRoutes());

  // 404 handler for API routes
  app.use('/api/*', (req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Global error handler for API
  app.use('/api/*', (err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('API Error:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  });
}

/**
 * API response helpers
 */
export const ApiResponse = {
  success: (data: any, message?: string) => ({
    success: true,
    message,
    data
  }),

  error: (message: string, errors?: any) => ({
    success: false,
    message,
    errors
  }),

  paginated: (data: any[], page: number, limit: number, total: number) => ({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  })
};

/**
 * Common API middleware
 */
export const apiMiddleware = {
  /**
   * Pagination middleware
   */
  pagination: (req: Request, res: Response, next: NextFunction) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    // Ensure reasonable limits
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    
    req.pagination = {
      page: safePage,
      limit: safeLimit,
      offset: (safePage - 1) * safeLimit
    };
    
    next();
  },

  /**
   * Sort middleware
   */
  sort: (req: Request, res: Response, next: NextFunction) => {
    const sortBy = req.query.sortBy as string || 'createdAt';
    const sortOrder = req.query.sortOrder as string || 'desc';
    
    req.sort = {
      by: sortBy,
      order: sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc'
    };
    
    next();
  }
};

/**
 * Extend Express Request type
 */
declare global {
  namespace Express {
    interface Request {
      pagination?: {
        page: number;
        limit: number;
        offset: number;
      };
      sort?: {
        by: string;
        order: 'asc' | 'desc';
      };
      keitaroClickId?: string;
    }
  }
}

/**
 * API documentation
 */
export const apiDocs = {
  baseUrl: '/api',
  version: '1.0.0',
  endpoints: {
    auth: {
      register: 'POST /auth/register',
      login: 'POST /auth/login',
      logout: 'POST /auth/logout',
      me: 'GET /auth/me'
    },
    subscription: {
      checkout: 'POST /subscription/checkout',
      create: 'POST /subscription/create',
      cancel: 'POST /subscription/cancel',
      status: 'GET /subscription/status',
      portal: 'POST /subscription/portal'
    },
    payment: {
      intent: 'POST /payment/intent',
      history: 'GET /payment/history'
    },
    user: {
      profile: 'PUT /user/profile',
      delete: 'DELETE /user/account'
    },
    webhook: {
      stripe: 'POST /webhook/stripe'
    },
    admin: {
      dashboard: 'GET /admin/dashboard',
      users: {
        list: 'GET /admin/users',
        details: 'GET /admin/users/:userId',
        updateSubscription: 'PUT /admin/users/:userId/subscription',
        delete: 'DELETE /admin/users/:userId'
      },
      analytics: {
        payments: 'GET /admin/analytics/payments',
        conversions: 'GET /admin/analytics/conversions'
      },
      logs: 'GET /admin/logs',
      tracking: {
        retry: 'POST /admin/tracking/retry'
      },
      export: {
        users: 'GET /admin/export/users'
      }
    }
  }
};
