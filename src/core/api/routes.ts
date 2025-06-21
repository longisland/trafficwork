import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { AuthService, authenticate, requireSubscription, AuthRequest } from '../auth';
import { stripeService } from '../payment';
import { keitaroService } from '../analytics';
import { prisma } from '../database';
import { config, getPublicConfig } from '../config';
import logger from '../../utils/logger';

/**
 * Create API routes for the framework
 */
export function createApiRoutes(): Router {
  const router = Router();

  // Validation middleware
  const handleValidationErrors = (req: any, res: any, next: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  };

  // ===== Public Routes =====

  // Get public configuration
  router.get('/config', (req, res) => {
    res.json(getPublicConfig());
  });

  // Health check
  router.get('/health', async (req, res) => {
    const dbHealthy = await prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbHealthy ? 'connected' : 'disconnected'
    });
  });

  // ===== Authentication Routes =====

  // Register
  router.post('/auth/register',
    [
      body('email').isEmail().normalizeEmail(),
      body('password').isLength({ min: 6 }),
      body('name').optional().trim()
    ],
    handleValidationErrors,
    async (req: any, res) => {
      try {
        const { email, password, name, keitaroSubId } = req.body;
        
        // Get click ID from request or body
        const clickId = req.keitaroClickId || keitaroSubId;

        const result = await AuthService.register(email, password, name, clickId);
        
        // Set cookie
        res.cookie('token', result.token, {
          httpOnly: true,
          secure: config.app.env === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Track registration
        await keitaroService.trackRegistration(result.user.id, clickId);

        res.status(201).json(result);
      } catch (error: any) {
        logger.error('Registration error', error);
        res.status(400).json({ error: error.message });
      }
    }
  );

  // Login
  router.post('/auth/login',
    [
      body('email').isEmail().normalizeEmail(),
      body('password').notEmpty()
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const { email, password } = req.body;
        const result = await AuthService.login(email, password);
        
        // Set cookie
        res.cookie('token', result.token, {
          httpOnly: true,
          secure: config.app.env === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json(result);
      } catch (error: any) {
        logger.error('Login error', error);
        res.status(401).json({ error: error.message });
      }
    }
  );

  // Logout
  router.post('/auth/logout', authenticate(), async (req: AuthRequest, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || 
                   req.cookies?.token;
      
      if (token) {
        await AuthService.logout(token);
      }
      
      res.clearCookie('token');
      res.json({ message: 'Logged out successfully' });
    } catch (error: any) {
      logger.error('Logout error', error);
      res.status(500).json({ error: 'Failed to logout' });
    }
  });

  // Get current user
  router.get('/auth/me', authenticate(), async (req: AuthRequest, res) => {
    try {
      const user = await AuthService.getUserById(req.user!.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (error: any) {
      logger.error('Get user error', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  // ===== Subscription Routes =====

  // Create checkout session
  router.post('/subscription/checkout',
    authenticate(),
    [
      body('priceId').notEmpty(),
      body('successUrl').optional().isURL(),
      body('cancelUrl').optional().isURL()
    ],
    handleValidationErrors,
    async (req: AuthRequest, res) => {
      try {
        const { priceId, successUrl, cancelUrl } = req.body;
        
        // Get user's click ID for tracking
        const user = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { keitaroSubId: true }
        });

        const session = await stripeService.createCheckoutSession(
          req.user!.userId,
          priceId,
          successUrl || `${config.app.url}/subscription/success`,
          cancelUrl || `${config.app.url}/subscription/cancel`,
          user?.keitaroSubId || undefined
        );

        res.json({ 
          sessionId: session.id,
          url: session.url 
        });
      } catch (error: any) {
        logger.error('Checkout session error', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
      }
    }
  );

  // Create subscription with payment method
  router.post('/subscription/create',
    authenticate(),
    [
      body('paymentMethodId').notEmpty(),
      body('priceId').notEmpty()
    ],
    handleValidationErrors,
    async (req: AuthRequest, res) => {
      try {
        const { paymentMethodId, priceId } = req.body;
        
        // Get user's click ID for tracking
        const user = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { keitaroSubId: true }
        });

        const subscription = await stripeService.createSubscription(
          req.user!.userId,
          priceId,
          paymentMethodId,
          user?.keitaroSubId || undefined
        );

        // Track purchase
        if (subscription.latest_invoice && typeof subscription.latest_invoice !== 'string') {
          await keitaroService.trackPurchase(
            req.user!.userId,
            subscription.latest_invoice.amount_paid,
            subscription.latest_invoice.currency
          );
        }

        res.json({ subscription });
      } catch (error: any) {
        logger.error('Create subscription error', error);
        res.status(500).json({ error: error.message });
      }
    }
  );

  // Cancel subscription
  router.post('/subscription/cancel',
    authenticate(),
    requireSubscription,
    async (req: AuthRequest, res) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { subscriptionId: true }
        });

        if (!user?.subscriptionId) {
          return res.status(404).json({ error: 'No active subscription found' });
        }

        const subscription = await stripeService.cancelSubscription(user.subscriptionId);
        res.json({ subscription });
      } catch (error: any) {
        logger.error('Cancel subscription error', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
      }
    }
  );

  // Get subscription status
  router.get('/subscription/status', authenticate(), async (req: AuthRequest, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          subscriptionId: true,
          subscriptionStatus: true,
          subscriptionPlan: true,
          subscriptionEndDate: true
        }
      });

      res.json({
        hasSubscription: !!user?.subscriptionId,
        status: user?.subscriptionStatus || 'inactive',
        plan: user?.subscriptionPlan,
        endDate: user?.subscriptionEndDate
      });
    } catch (error: any) {
      logger.error('Get subscription status error', error);
      res.status(500).json({ error: 'Failed to get subscription status' });
    }
  });

  // Create customer portal session
  router.post('/subscription/portal',
    authenticate(),
    async (req: AuthRequest, res) => {
      try {
        const returnUrl = req.body.returnUrl || config.app.url;
        const session = await stripeService.createPortalSession(
          req.user!.userId,
          returnUrl
        );

        res.json({ url: session.url });
      } catch (error: any) {
        logger.error('Portal session error', error);
        res.status(500).json({ error: 'Failed to create portal session' });
      }
    }
  );

  // ===== Payment Routes =====

  // Create payment intent (for one-time payments)
  router.post('/payment/intent',
    authenticate(),
    [
      body('amount').isInt({ min: 50 }), // Minimum 50 cents
      body('currency').optional().isLength({ min: 3, max: 3 })
    ],
    handleValidationErrors,
    async (req: AuthRequest, res) => {
      try {
        const { amount, currency } = req.body;
        
        // Get user's click ID for tracking
        const user = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { keitaroSubId: true }
        });

        const paymentIntent = await stripeService.createPaymentIntent(
          amount,
          currency || 'usd',
          req.user!.userId,
          user?.keitaroSubId || undefined
        );

        res.json({
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id
        });
      } catch (error: any) {
        logger.error('Payment intent error', error);
        res.status(500).json({ error: 'Failed to create payment intent' });
      }
    }
  );

  // Get payment history
  router.get('/payment/history', authenticate(), async (req: AuthRequest, res) => {
    try {
      const payments = await prisma.payment.findMany({
        where: { userId: req.user!.userId },
        orderBy: { createdAt: 'desc' },
        take: 50
      });

      res.json(payments);
    } catch (error: any) {
      logger.error('Get payment history error', error);
      res.status(500).json({ error: 'Failed to get payment history' });
    }
  });

  // ===== Webhook Routes =====

  // Stripe webhook
  router.post('/webhook/stripe',
    // Note: Don't use body parser middleware for webhooks
    async (req, res) => {
      try {
        const signature = req.headers['stripe-signature'] as string;
        
        if (!signature) {
          return res.status(400).json({ error: 'Missing signature' });
        }

        // Get raw body
        const rawBody = req.body;
        
        await stripeService.handleWebhook(signature, rawBody);
        res.json({ received: true });
      } catch (error: any) {
        logger.error('Stripe webhook error', error);
        res.status(400).json({ error: error.message });
      }
    }
  );

  // ===== User Routes =====

  // Update user profile
  router.put('/user/profile',
    authenticate(),
    [
      body('name').optional().trim(),
      body('email').optional().isEmail().normalizeEmail()
    ],
    handleValidationErrors,
    async (req: AuthRequest, res) => {
      try {
        const { name, email } = req.body;
        
        const updatedUser = await prisma.user.update({
          where: { id: req.user!.userId },
          data: {
            ...(name && { name }),
            ...(email && { email })
          }
        });

        const { password: _, ...userWithoutPassword } = updatedUser;
        res.json(userWithoutPassword);
      } catch (error: any) {
        logger.error('Update profile error', error);
        res.status(500).json({ error: 'Failed to update profile' });
      }
    }
  );

  // Delete user account
  router.delete('/user/account',
    authenticate(),
    async (req: AuthRequest, res) => {
      try {
        // Cancel subscription if exists
        const user = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { subscriptionId: true }
        });

        if (user?.subscriptionId) {
          await stripeService.cancelSubscription(user.subscriptionId);
        }

        // Delete user
        await prisma.user.delete({
          where: { id: req.user!.userId }
        });

        res.clearCookie('token');
        res.json({ message: 'Account deleted successfully' });
      } catch (error: any) {
        logger.error('Delete account error', error);
        res.status(500).json({ error: 'Failed to delete account' });
      }
    }
  );

  return router;
}
