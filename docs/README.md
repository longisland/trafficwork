# TrafficWork Framework Documentation

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Configuration](#configuration)
4. [Core Modules](#core-modules)
   - [Authentication](#authentication)
   - [Payment Integration](#payment-integration)
   - [Analytics Tracking](#analytics-tracking)
   - [Database](#database)
   - [API Routes](#api-routes)
   - [Admin Panel](#admin-panel)
5. [Deployment](#deployment)
6. [Troubleshooting](#troubleshooting)
7. [API Reference](#api-reference)

## Introduction

TrafficWork Framework is a mini-framework designed for rapid application development with built-in support for:

- **Stripe Payments**: Subscription management with Apple Pay and Google Pay support
- **Keitaro Analytics**: Traffic source and conversion tracking
- **Authentication**: JWT-based authentication system
- **Database**: PostgreSQL with Prisma ORM
- **Security**: Built-in security middleware and best practices

The framework is built with Node.js, Express, and TypeScript, providing a modern and type-safe development experience.

## Getting Started

### Prerequisites

- Node.js 16.0.0 or higher
- PostgreSQL database
- Stripe account with API keys
- Keitaro tracker instance (optional)

### Installation

1. **Clone the framework template**:
   ```bash
   git clone <framework-repository>
   cd trafficwork-framework
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration values.

4. **Set up the database**:
   ```bash
   npx prisma migrate dev
   ```

5. **Start the development server**:
   ```bash
   npm run dev
   ```

### Creating a New Application

To create a new application using the framework:

1. **Copy the app template**:
   ```bash
   cp -r templates/app-template my-new-app
   cd my-new-app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your app-specific configuration
   ```

4. **Run the application**:
   ```bash
   npm run dev
   ```

## Configuration

### Environment Variables

The framework uses environment variables for configuration. Here are the key variables:

#### Application Settings
- `NODE_ENV`: Environment (development/staging/production)
- `PORT`: Server port (default: 3000)
- `APP_NAME`: Application name
- `APP_URL`: Full application URL

#### Database
- `DATABASE_URL`: PostgreSQL connection string

#### Stripe Configuration
- `STRIPE_SECRET_KEY`: Your Stripe secret key
- `STRIPE_PUBLISHABLE_KEY`: Your Stripe publishable key
- `STRIPE_WEBHOOK_SECRET`: Webhook endpoint secret
- `STRIPE_MONTHLY_PRICE_ID`: Price ID for monthly subscription
- `STRIPE_ANNUAL_PRICE_ID`: Price ID for annual subscription

#### Keitaro Tracking
- `KEITARO_TRACKER_URL`: Your Keitaro tracker URL
- `KEITARO_POSTBACK_KEY`: Security key for postbacks
- `KEITARO_CAMPAIGN_ID`: Default campaign ID
- `KEITARO_JS_ENABLED`: Enable JavaScript tracking (true/false)

#### Security
- `JWT_SECRET`: Secret key for JWT tokens
- `JWT_EXPIRES_IN`: Token expiration time (e.g., "7d")
- `CORS_ORIGIN`: Allowed CORS origins
- `RATE_LIMIT_WINDOW_MS`: Rate limit window in milliseconds
- `RATE_LIMIT_MAX_REQUESTS`: Maximum requests per window

#### Admin Configuration
- `ADMIN_EMAIL`: Email address for admin access

### Stripe Setup

1. **Create Products and Prices in Stripe Dashboard**:
   - Create a product for your subscription
   - Add monthly and annual prices
   - Copy the price IDs to your `.env` file

2. **Configure Webhook Endpoint**:
   - Add webhook endpoint: `https://yourdomain.com/api/webhook/stripe`
   - Select events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.*`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`

3. **Apple Pay Domain Verification**:
   - Download the verification file from Stripe
   - Place it in your public directory
   - Update `APPLE_PAY_DOMAIN_VERIFICATION_FILE` in `.env`

### Keitaro Setup

1. **Create Campaign in Keitaro**:
   - Set up a new campaign for your application
   - Note the campaign ID

2. **Configure Postback URL**:
   - Get your postback key from Keitaro settings
   - The framework will automatically send conversions to:
     - Registration: `status=reg`
     - Purchase: `status=sale`

3. **Add Tracking Script** (optional):
   - The framework can automatically include Keitaro JS tracking
   - Enable with `KEITARO_JS_ENABLED=true`

## Core Modules

### Authentication

The authentication module provides JWT-based user authentication.

#### Key Features:
- User registration and login
- Password hashing with bcrypt
- JWT token generation and validation
- Session management
- Middleware for protected routes

#### Usage Example:

```typescript
import { AuthService, authenticate } from 'trafficwork-framework';

// Register a new user
const { user, token } = await AuthService.register(
  'user@example.com',
  'password123',
  'John Doe',
  keitaroSubId // optional tracking ID
);

// Protect a route
app.get('/protected', authenticate(), (req, res) => {
  res.json({ userId: req.user.userId });
});
```

### Payment Integration

The payment module handles Stripe integration for subscriptions.

#### Key Features:
- Subscription creation and management
- Apple Pay and Google Pay support via Payment Request API
- Webhook handling for payment events
- Customer portal integration
- Automatic user status updates

#### Client-Side Implementation:

```javascript
// Initialize Stripe
const stripe = Stripe(publishableKey);

// Create Payment Request for Apple/Google Pay
const paymentRequest = stripe.paymentRequest({
  country: 'US',
  currency: 'usd',
  total: {
    label: 'Monthly Subscription',
    amount: 999, // $9.99
  },
  requestPayerName: true,
  requestPayerEmail: true,
});

// Check if Payment Request is available
const result = await paymentRequest.canMakePayment();
if (result) {
  // Show Apple Pay or Google Pay button
  const prButton = elements.create('paymentRequestButton', {
    paymentRequest: paymentRequest,
  });
  prButton.mount('#payment-request-button');
} else {
  // Fall back to card element
  const cardElement = elements.create('card');
  cardElement.mount('#card-element');
}
```

#### Server-Side Usage:

```typescript
import { stripeService } from 'trafficwork-framework';

// Create checkout session
const session = await stripeService.createCheckoutSession(
  userId,
  priceId,
  'https://example.com/success',
  'https://example.com/cancel',
  keitaroSubId
);

// Create subscription directly
const subscription = await stripeService.createSubscription(
  userId,
  priceId,
  paymentMethodId,
  keitaroSubId
);
```

### Analytics Tracking

The analytics module integrates with Keitaro for conversion tracking.

#### Key Features:
- Automatic click ID capture from URL parameters
- Conversion tracking for registrations and purchases
- Postback retry mechanism
- JavaScript tracking script integration

#### Usage Example:

```typescript
import { keitaroService, KeitaroService } from 'trafficwork-framework';

// Track registration
await keitaroService.trackRegistration(userId, clickId);

// Track purchase
await keitaroService.trackPurchase(
  userId,
  999, // amount in cents
  'USD',
  clickId
);

// Middleware to capture click IDs
app.use(KeitaroService.trackingMiddleware());
```

#### Client-Side Tracking:

```javascript
// Get click ID from URL
function getKeitaroClickId() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramNames = ['subid', 'sub_id', 'clickid', 'click_id'];
  
  for (const param of paramNames) {
    const value = urlParams.get(param);
    if (value) {
      localStorage.setItem('keitaro_subid', value);
      return value;
    }
  }
  
  return localStorage.getItem('keitaro_subid');
}

// Include in API requests
const clickId = getKeitaroClickId();
fetch('/api/register', {
  method: 'POST',
  body: JSON.stringify({
    email,
    password,
    keitaroSubId: clickId
  })
});
```

### Database

The framework uses Prisma ORM with PostgreSQL.

#### Schema Overview:

- **User**: User accounts with subscription status
- **Session**: Authentication sessions
- **Payment**: Payment history
- **TrackingEvent**: Analytics events
- **WebhookEvent**: Webhook processing log

#### Usage Example:

```typescript
import { prisma } from 'trafficwork-framework';

// Find user with subscription
const user = await prisma.user.findUnique({
  where: { email: 'user@example.com' },
  include: { payments: true }
});

// Create tracking event
await prisma.trackingEvent.create({
  data: {
    userId,
    eventType: 'custom_event',
    subId: clickId,
    metadata: { custom: 'data' }
  }
});
```

### API Routes

The framework provides pre-built API routes for common operations.

#### Authentication Routes:
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

#### Subscription Routes:
- `POST /api/subscription/checkout` - Create checkout session
- `POST /api/subscription/create` - Create subscription
- `POST /api/subscription/cancel` - Cancel subscription
- `GET /api/subscription/status` - Get subscription status
- `POST /api/subscription/portal` - Create portal session

#### Payment Routes:
- `POST /api/payment/intent` - Create payment intent
- `GET /api/payment/history` - Get payment history

#### User Routes:
- `PUT /api/user/profile` - Update user profile
- `DELETE /api/user/account` - Delete user account

#### Webhook Routes:
- `POST /api/webhook/stripe` - Stripe webhook handler

### Admin Panel

The framework includes a comprehensive admin panel for managing users, monitoring payments, and analyzing conversions.

#### Key Features:
- Dashboard with real-time statistics
- User management with search and pagination
- Payment analytics with revenue charts
- Conversion funnel visualization
- System logs and webhook monitoring
- Data export functionality

#### Setup:

1. **Configure Admin Email**:
   Set the admin email in your `.env` file:
   ```
   ADMIN_EMAIL=admin@example.com
   ```

2. **Access Admin Panel**:
   - Navigate to `/admin.html` in your browser
   - Login with admin credentials
   - Only users with the configured admin email can access

#### Admin API Endpoints:

##### Dashboard & Analytics:
- `GET /api/admin/dashboard` - Dashboard statistics
- `GET /api/admin/analytics/payments` - Payment analytics
- `GET /api/admin/analytics/conversions` - Conversion analytics

##### User Management:
- `GET /api/admin/users` - List all users (paginated)
- `GET /api/admin/users/:userId` - User details
- `PUT /api/admin/users/:userId/subscription` - Update subscription
- `DELETE /api/admin/users/:userId` - Delete user

##### System Management:
- `GET /api/admin/logs` - System logs
- `POST /api/admin/tracking/retry` - Retry failed tracking events
- `GET /api/admin/export/users` - Export users to CSV

#### Admin Panel Usage:

```typescript
import { requireAdmin, createAdminRoutes } from 'trafficwork-framework';

// Add custom admin routes
const adminRouter = createAdminRoutes();

// Add custom admin endpoint
adminRouter.get('/custom-report', requireAdmin, async (req, res) => {
  // Your custom admin logic
  const report = await generateCustomReport();
  res.json(report);
});
```

#### Security Considerations:

1. **Access Control**: Only users with the admin email can access admin routes
2. **Rate Limiting**: Admin routes are subject to rate limiting
3. **Audit Trail**: All admin actions are logged
4. **HTTPS Required**: Always use HTTPS in production

#### Customizing the Admin Panel:

The admin panel HTML template is located at `templates/app-template/public/admin.html`. You can customize:

- Dashboard layout and statistics
- Chart types and visualizations
- Table columns and filters
- Color scheme and branding

Example customization:
```javascript
// Add custom chart to dashboard
const customChart = new Chart(ctx, {
  type: 'bar',
  data: {
    labels: customLabels,
    datasets: [{
      label: 'Custom Metric',
      data: customData,
      backgroundColor: '#9b59b6'
    }]
  }
});
```

## Deployment

### Production Checklist

1. **Environment Configuration**:
   - Set `NODE_ENV=production`
   - Use strong `JWT_SECRET`
   - Configure production database
   - Set correct `APP_URL`

2. **SSL/HTTPS Setup**:
   - Install SSL certificate
   - Enable HTTPS redirect
   - Update Stripe webhook URL

3. **Database Migrations**:
   ```bash
   npx prisma migrate deploy
   ```

4. **Build Application**:
   ```bash
   npm run build
   ```

5. **Process Management**:
   Using PM2:
   ```bash
   pm2 start dist/server.js --name my-app
   pm2 save
   pm2 startup
   ```

   Using Docker:
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   RUN npm run build
   EXPOSE 3000
   CMD ["node", "dist/server.js"]
   ```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Apple Pay domain verification
    location /.well-known/apple-developer-merchantid-domain-association {
        alias /path/to/apple-pay-verification-file;
    }
}
```

## Troubleshooting

### Common Issues

#### Stripe Errors

**Invalid API Key**:
- Check that you're using the correct key for your environment
- Ensure no extra spaces in the `.env` file

**Webhook Signature Verification Failed**:
- Verify the webhook secret is correct
- Ensure raw body parsing for webhook endpoint
- Check that the webhook URL is correct in Stripe

**Apple Pay Not Showing**:
- Domain must be verified in Stripe Dashboard
- Site must be served over HTTPS
- Browser must support Apple Pay

#### Keitaro Issues

**Conversions Not Tracked**:
- Verify postback URL and key are correct
- Check that click ID is being captured
- Look for errors in application logs
- Test postback URL manually

**Click ID Not Captured**:
- Check URL parameter names (subid, sub_id, etc.)
- Verify tracking middleware is enabled
- Check cookie settings

#### Database Issues

**Connection Failed**:
- Verify DATABASE_URL is correct
- Check PostgreSQL is running
- Ensure database exists
- Check network/firewall settings

**Migration Errors**:
- Run `npx prisma generate` first
- Check for pending migrations
- Verify database permissions

### Debug Mode

Enable detailed logging:

```bash
LOG_LEVEL=debug npm run dev
```

Check logs for:
- API request/response details
- Database queries (in development)
- Stripe webhook events
- Keitaro postback attempts

## API Reference

### Request Authentication

Include JWT token in requests:

```javascript
// Header
Authorization: Bearer <token>

// Cookie
Cookie: token=<token>
```

### Error Responses

```json
{
  "error": "Error message",
  "message": "Detailed description",
  "errors": [] // Validation errors
}
```

### Pagination

```javascript
GET /api/payments?page=1&limit=10&sortBy=createdAt&sortOrder=desc
```

Response:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

### Webhook Payload Verification

Stripe webhooks are automatically verified using the signature header. No manual verification needed.

## Best Practices

1. **Security**:
   - Always use HTTPS in production
   - Keep dependencies updated
   - Use environment variables for secrets
   - Enable rate limiting

2. **Performance**:
   - Use database indexes effectively
   - Implement caching where appropriate
   - Monitor application metrics
   - Use CDN for static assets

3. **Error Handling**:
   - Log all errors with context
   - Provide user-friendly error messages
   - Implement retry logic for external services
   - Monitor error rates

4. **Testing**:
   - Use Stripe test mode for development
   - Test webhook handling thoroughly
   - Verify tracking integration
   - Test payment flows end-to-end

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review application logs
3. Consult Stripe and Keitaro documentation
4. Contact the development team

---

TrafficWork Framework v1.0.0
