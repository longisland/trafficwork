import { Router } from 'express';
import { authenticate, AuthRequest } from '../auth';
import { prisma } from '../database';
import { stripeService } from '../payment';
import logger from '../../utils/logger';

/**
 * Admin panel functionality for the TrafficWork framework
 */

/**
 * Check if user is admin
 */
export async function requireAdmin(req: AuthRequest, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId }
  });

  // Check if user has admin role (you'll need to add 'role' field to User model)
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

/**
 * Create admin routes
 */
export function createAdminRoutes(): Router {
  const router = Router();

  // All admin routes require authentication and admin role
  router.use(authenticate());
  router.use(requireAdmin);

  // Dashboard stats
  router.get('/dashboard', async (req, res) => {
    try {
      const [
        totalUsers,
        activeSubscriptions,
        totalRevenue,
        recentPayments,
        recentUsers,
        conversionStats
      ] = await Promise.all([
        // Total users
        prisma.user.count(),
        
        // Active subscriptions
        prisma.user.count({
          where: { subscriptionStatus: 'active' }
        }),
        
        // Total revenue
        prisma.payment.aggregate({
          where: { status: 'succeeded' },
          _sum: { amount: true }
        }),
        
        // Recent payments
        prisma.payment.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { user: true }
        }),
        
        // Recent users
        prisma.user.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
            subscriptionStatus: true,
            keitaroSubId: true
          }
        }),
        
        // Conversion stats
        prisma.trackingEvent.groupBy({
          by: ['eventType'],
          _count: true
        })
      ]);

      res.json({
        stats: {
          totalUsers,
          activeSubscriptions,
          totalRevenue: (totalRevenue._sum.amount || 0) / 100, // Convert from cents
          conversionRate: totalUsers > 0 
            ? ((activeSubscriptions / totalUsers) * 100).toFixed(2) + '%'
            : '0%'
        },
        recentPayments: recentPayments.map(p => ({
          ...p,
          amount: p.amount / 100, // Convert from cents
          user: {
            email: p.user.email,
            name: p.user.name
          }
        })),
        recentUsers,
        conversionStats
      });
    } catch (error) {
      logger.error('Admin dashboard error', error);
      res.status(500).json({ error: 'Failed to load dashboard data' });
    }
  });

  // User management
  router.get('/users', async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string;

      const where = search ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' as any } },
          { name: { contains: search, mode: 'insensitive' as any } }
        ]
      } : {};

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            name: true,
            subscriptionStatus: true,
            subscriptionPlan: true,
            subscriptionEndDate: true,
            keitaroSubId: true,
            registrationSource: true,
            createdAt: true,
            lastLoginAt: true,
            _count: {
              select: { payments: true }
            }
          }
        }),
        prisma.user.count({ where })
      ]);

      res.json({
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Admin users list error', error);
      res.status(500).json({ error: 'Failed to load users' });
    }
  });

  // User details
  router.get('/users/:userId', async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
        include: {
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 20
          }
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Remove password from response
      const { password, ...userWithoutPassword } = user;

      res.json({
        user: userWithoutPassword,
        payments: user.payments.map(p => ({
          ...p,
          amount: p.amount / 100 // Convert from cents
        }))
      });
    } catch (error) {
      logger.error('Admin user details error', error);
      res.status(500).json({ error: 'Failed to load user details' });
    }
  });

  // Update user subscription
  router.put('/users/:userId/subscription', async (req, res) => {
    try {
      const { status, plan, endDate } = req.body;

      const updatedUser = await prisma.user.update({
        where: { id: req.params.userId },
        data: {
          subscriptionStatus: status,
          subscriptionPlan: plan,
          subscriptionEndDate: endDate ? new Date(endDate) : undefined
        }
      });

      res.json({ 
        message: 'Subscription updated',
        user: updatedUser 
      });
    } catch (error) {
      logger.error('Admin update subscription error', error);
      res.status(500).json({ error: 'Failed to update subscription' });
    }
  });

  // Delete user
  router.delete('/users/:userId', async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Cancel Stripe subscription if exists
      if (user.subscriptionId) {
        try {
          await stripeService.cancelSubscription(user.subscriptionId);
        } catch (error) {
          logger.warn('Failed to cancel Stripe subscription', error);
        }
      }

      // Delete user and related data (cascade delete)
      await prisma.user.delete({
        where: { id: req.params.userId }
      });

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      logger.error('Admin delete user error', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // Payment analytics
  router.get('/analytics/payments', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const payments = await prisma.payment.findMany({
        where: {
          createdAt: { gte: startDate },
          status: 'succeeded'
        },
        orderBy: { createdAt: 'asc' }
      });

      // Group by date
      const dailyRevenue: { [key: string]: number } = {};
      payments.forEach(payment => {
        const date = payment.createdAt.toISOString().split('T')[0];
        dailyRevenue[date] = (dailyRevenue[date] || 0) + payment.amount;
      });

      // Calculate totals by payment method
      const paymentMethods = await prisma.payment.groupBy({
        by: ['paymentMethod'],
        where: {
          createdAt: { gte: startDate },
          status: 'succeeded'
        },
        _sum: { amount: true },
        _count: true
      });

      res.json({
        dailyRevenue: Object.entries(dailyRevenue).map(([date, amount]) => ({
          date,
          amount: amount / 100 // Convert from cents
        })),
        paymentMethods: paymentMethods.map(pm => ({
          method: pm.paymentMethod || 'unknown',
          total: (pm._sum.amount || 0) / 100,
          count: pm._count
        })),
        summary: {
          totalRevenue: payments.reduce((sum, p) => sum + p.amount, 0) / 100,
          totalTransactions: payments.length,
          averageTransaction: payments.length > 0 
            ? (payments.reduce((sum, p) => sum + p.amount, 0) / payments.length / 100)
            : 0
        }
      });
    } catch (error) {
      logger.error('Admin payment analytics error', error);
      res.status(500).json({ error: 'Failed to load payment analytics' });
    }
  });

  // Conversion analytics
  router.get('/analytics/conversions', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get tracking events
      const trackingEvents = await prisma.trackingEvent.findMany({
        where: {
          createdAt: { gte: startDate }
        },
        orderBy: { createdAt: 'asc' }
      });

      // Group by source
      const sources = await prisma.user.groupBy({
        by: ['registrationSource'],
        where: {
          createdAt: { gte: startDate }
        },
        _count: true
      });

      // Calculate conversion funnel
      const registrations = trackingEvents.filter(e => e.eventType === 'registration').length;
      const purchases = trackingEvents.filter(e => e.eventType === 'purchase').length;

      res.json({
        funnel: {
          registrations,
          purchases,
          conversionRate: registrations > 0 
            ? ((purchases / registrations) * 100).toFixed(2) + '%'
            : '0%'
        },
        sources: sources.map(s => ({
          source: s.registrationSource || 'unknown',
          count: s._count
        })),
        events: trackingEvents
      });
    } catch (error) {
      logger.error('Admin conversion analytics error', error);
      res.status(500).json({ error: 'Failed to load conversion analytics' });
    }
  });

  // System logs
  router.get('/logs', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const level = req.query.level as string;

      // Get recent webhook events
      const webhookEvents = await prisma.webhookEvent.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        where: level === 'error' ? { error: { not: null } } : {}
      });

      res.json({
        webhookEvents,
        // In production, you might want to read actual log files
        message: 'For full logs, check the server log files'
      });
    } catch (error) {
      logger.error('Admin logs error', error);
      res.status(500).json({ error: 'Failed to load logs' });
    }
  });

  // Retry failed tracking events
  router.post('/tracking/retry', async (req, res) => {
    try {
      const { keitaroService } = await import('../analytics');
      await keitaroService.retryFailedPostbacks();
      
      res.json({ message: 'Retry process started' });
    } catch (error) {
      logger.error('Admin retry tracking error', error);
      res.status(500).json({ error: 'Failed to retry tracking events' });
    }
  });

  // Export data
  router.get('/export/users', async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          email: true,
          name: true,
          subscriptionStatus: true,
          subscriptionPlan: true,
          registrationSource: true,
          createdAt: true
        }
      });

      // Convert to CSV
      const csv = [
        'Email,Name,Subscription Status,Plan,Source,Created At',
        ...users.map(u => 
          `"${u.email}","${u.name || ''}","${u.subscriptionStatus || ''}","${u.subscriptionPlan || ''}","${u.registrationSource || ''}","${u.createdAt.toISOString()}"`
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
      res.send(csv);
    } catch (error) {
      logger.error('Admin export error', error);
      res.status(500).json({ error: 'Failed to export data' });
    }
  });

  return router;
}

/**
 * Admin dashboard configuration
 */
export const adminConfig = {
  // Define admin email in environment
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  
  // Dashboard refresh interval (ms)
  refreshInterval: 30000,
  
  // Chart colors
  chartColors: {
    primary: '#0570de',
    success: '#28a745',
    danger: '#dc3545',
    warning: '#ffc107',
    info: '#17a2b8'
  }
};
