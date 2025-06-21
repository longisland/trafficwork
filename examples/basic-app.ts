/**
 * Basic example of using TrafficWork Framework
 * This demonstrates the core features: auth, payments, and tracking
 */

import { 
  createApp, 
  AuthService, 
  stripeService, 
  keitaroService,
  prisma 
} from 'trafficwork-framework';

async function startExampleApp() {
  try {
    // Create and initialize the app
    const app = await createApp();
    
    // Get Express instance for custom routes
    const expressApp = app.getApp();
    
    // Add custom routes
    expressApp.get('/', (req, res) => {
      res.send(`
        <h1>TrafficWork Example App</h1>
        <p>API is available at /api/*</p>
        <p>Payment demo at <a href="/payment-demo.html">/payment-demo.html</a></p>
      `);
    });
    
    // Custom route with authentication
    expressApp.get('/api/custom/stats', async (req: any, res) => {
      try {
        // Get user stats
        const totalUsers = await prisma.user.count();
        const activeSubscriptions = await prisma.user.count({
          where: { subscriptionStatus: 'active' }
        });
        const totalPayments = await prisma.payment.count();
        
        res.json({
          totalUsers,
          activeSubscriptions,
          totalPayments,
          conversionRate: totalUsers > 0 
            ? ((activeSubscriptions / totalUsers) * 100).toFixed(2) + '%'
            : '0%'
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get stats' });
      }
    });
    
    // Example: Handle custom webhook
    expressApp.post('/api/custom/webhook', async (req, res) => {
      // Your custom webhook logic
      console.log('Custom webhook received:', req.body);
      res.json({ received: true });
    });
    
    // Example: Custom subscription flow
    expressApp.post('/api/custom/quick-subscribe', async (req: any, res) => {
      try {
        const { email, paymentMethodId } = req.body;
        
        // Register user if not exists
        let user = await prisma.user.findUnique({ where: { email } });
        
        if (!user) {
          const { user: newUser } = await AuthService.register(
            email,
            Math.random().toString(36).substring(7), // Random password
            email.split('@')[0], // Name from email
            req.keitaroClickId // Tracking ID from middleware
          );
          user = newUser;
          
          // Track registration
          await keitaroService.trackRegistration(user.id);
        }
        
        // Create subscription
        const subscription = await stripeService.createSubscription(
          user.id,
          process.env.STRIPE_MONTHLY_PRICE_ID!,
          paymentMethodId,
          req.keitaroClickId
        );
        
        // Track purchase
        if (subscription.latest_invoice && typeof subscription.latest_invoice !== 'string') {
          await keitaroService.trackPurchase(
            user.id,
            subscription.latest_invoice.amount_paid,
            subscription.latest_invoice.currency
          );
        }
        
        res.json({ 
          success: true, 
          subscriptionId: subscription.id 
        });
      } catch (error: any) {
        res.status(400).json({ 
          error: error.message || 'Subscription failed' 
        });
      }
    });
    
    // Start the server
    await app.start();
    
    console.log('Example app is running!');
    console.log('Visit http://localhost:3000');
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      await app.shutdown();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      await app.shutdown();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start example app:', error);
    process.exit(1);
  }
}

// Run the example
startExampleApp();
