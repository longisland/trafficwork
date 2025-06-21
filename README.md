# TrafficWork Framework

A mini-framework for rapid application development with integrated payment processing and analytics tracking.

## Features

- 🔐 **Authentication System** - JWT-based authentication with session management
- 💳 **Stripe Integration** - Subscription management with Apple Pay and Google Pay support
- 📊 **Analytics Tracking** - Keitaro integration for conversion tracking
- 🗄️ **Database** - PostgreSQL with Prisma ORM
- 🔒 **Security** - Built-in security middleware and best practices
- 🚀 **TypeScript** - Full TypeScript support for type safety
- 📱 **Mobile Payments** - Native Apple Pay and Google Pay integration
- 👨‍💼 **Admin Panel** - Built-in admin dashboard for user and payment management

## Quick Start

### Using the Framework

1. Install the framework:
   ```bash
   npm install trafficwork-framework
   ```

2. Create a server file:
   ```typescript
   import { createApp } from 'trafficwork-framework';

   async function start() {
     const app = await createApp();
     await app.start();
   }

   start();
   ```

3. Configure environment variables (see `.env.example`)

4. Run your application:
   ```bash
   npm run dev
   ```

### Creating a New App from Template

1. Copy the template:
   ```bash
   cp -r templates/app-template my-app
   cd my-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure and run:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   npm run dev
   ```

## Documentation

See the [full documentation](docs/README.md) for detailed information on:

- Configuration options
- API reference
- Module usage
- Deployment guides
- Troubleshooting

## Project Structure

```
trafficwork-framework/
├── src/
│   ├── core/           # Core framework modules
│   │   ├── api/        # API routes and setup
│   │   ├── auth/       # Authentication system
│   │   ├── payment/    # Stripe integration
│   │   ├── analytics/  # Keitaro tracking
│   │   ├── database/   # Database connection
│   │   └── config/     # Configuration management
│   ├── middleware/     # Express middleware
│   ├── utils/          # Utility functions
│   └── types/          # TypeScript types
├── templates/          # Application templates
├── docs/               # Documentation
└── prisma/             # Database schema
```

## Requirements

- Node.js 16.0.0 or higher
- PostgreSQL database
- Stripe account
- Keitaro tracker (optional)

## License

MIT

## Support

For detailed documentation and troubleshooting, see the [docs](docs/README.md).
