import Stripe from 'stripe';
import { config } from '../config';
import { prisma } from '../database';
import logger, { logStripeEvent } from '../../utils/logger';

/**
 * Stripe service for handling payments and subscriptions
 */
export class StripeService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16',
      typescript: true,
    });
  }

  /**
   * Create a Stripe customer for a user
   */
  async createCustomer(userId: string, email: string, name?: string): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          userId,
        },
      });

      // Update user with Stripe customer ID
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customer.id },
      });

      logger.info('Stripe customer created', { customerId: customer.id, userId });
      return customer;
    } catch (error) {
      logger.error('Failed to create Stripe customer', error);
      throw error;
    }
  }

  /**
   * Get or create Stripe customer for a user
   */
  async getOrCreateCustomer(userId: string): Promise<Stripe.Customer> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.stripeCustomerId) {
      try {
        const customer = await this.stripe.customers.retrieve(user.stripeCustomerId);
        if (!customer.deleted) {
          return customer as Stripe.Customer;
        }
      } catch (error) {
        logger.warn('Failed to retrieve Stripe customer, creating new one', error);
      }
    }

    return this.createCustomer(userId, user.email, user.name || undefined);
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    keitaroSubId?: string
  ): Promise<Stripe.Checkout.Session> {
    const customer = await this.getOrCreateCustomer(userId);

    const sessionData: Stripe.Checkout.SessionCreateParams = {
      customer: customer.id,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        keitaroSubId: keitaroSubId || '',
      },
      subscription_data: {
        metadata: {
          userId,
          keitaroSubId: keitaroSubId || '',
        },
      },
      // Enable Apple Pay and Google Pay
      payment_method_options: {
        card: {
          request_three_d_secure: 'automatic',
        },
      },
    };

    try {
      const session = await this.stripe.checkout.sessions.create(sessionData);
      logger.info('Checkout session created', { sessionId: session.id, userId });
      return session;
    } catch (error) {
      logger.error('Failed to create checkout session', error);
      throw error;
    }
  }

  /**
   * Create a payment intent for one-time payment
   */
  async createPaymentIntent(
    amount: number,
    currency: string = 'usd',
    userId: string,
    keitaroSubId?: string
  ): Promise<Stripe.PaymentIntent> {
    const customer = await this.getOrCreateCustomer(userId);

    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount,
        currency,
        customer: customer.id,
        metadata: {
          userId,
          keitaroSubId: keitaroSubId || '',
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      logger.info('Payment intent created', { paymentIntentId: paymentIntent.id, userId });
      return paymentIntent;
    } catch (error) {
      logger.error('Failed to create payment intent', error);
      throw error;
    }
  }

  /**
   * Create a subscription directly (for custom flows)
   */
  async createSubscription(
    userId: string,
    priceId: string,
    paymentMethodId: string,
    keitaroSubId?: string
  ): Promise<Stripe.Subscription> {
    const customer = await this.getOrCreateCustomer(userId);

    try {
      // Attach payment method to customer
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.id,
      });

      // Set as default payment method
      await this.stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      // Create subscription
      const subscription = await this.stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          userId,
          keitaroSubId: keitaroSubId || '',
        },
      });

      // Update user subscription status
      await this.updateUserSubscription(userId, subscription);

      logger.info('Subscription created', { subscriptionId: subscription.id, userId });
      return subscription;
    } catch (error) {
      logger.error('Failed to create subscription', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      logger.info('Subscription canceled', { subscriptionId });
      return subscription;
    } catch (error) {
      logger.error('Failed to cancel subscription', error);
      throw error;
    }
  }

  /**
   * Update user subscription status in database
   */
  async updateUserSubscription(userId: string, subscription: Stripe.Subscription): Promise<void> {
    const plan = subscription.items.data[0]?.price.id === config.stripe.prices.annual ? 'annual' : 'monthly';
    const endDate = new Date(subscription.current_period_end * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        subscriptionPlan: plan,
        subscriptionEndDate: endDate,
      },
    });
  }

  /**
   * Handle webhook events from Stripe
   */
  async handleWebhook(signature: string, payload: string): Promise<void> {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        config.stripe.webhookSecret
      );
    } catch (error) {
      logger.error('Webhook signature verification failed', error);
      throw new Error('Invalid webhook signature');
    }

    // Log the event
    logStripeEvent(event);

    // Check if we've already processed this event
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { eventId: event.id },
    });

    if (existingEvent) {
      logger.info('Webhook event already processed', { eventId: event.id });
      return;
    }

    // Store the event
    await prisma.webhookEvent.create({
      data: {
        source: 'stripe',
        eventId: event.id,
        eventType: event.type,
        payload: event as any,
      },
    });

    try {
      // Handle different event types
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        default:
          logger.info('Unhandled webhook event type', { type: event.type });
      }

      // Mark event as processed
      await prisma.webhookEvent.update({
        where: { eventId: event.id },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      // Mark event as failed
      await prisma.webhookEvent.update({
        where: { eventId: event.id },
        data: {
          processed: true,
          processedAt: new Date(),
          error: (error as Error).message,
        },
      });
      throw error;
    }
  }

  /**
   * Handle checkout session completed
   */
  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.userId;
    if (!userId) {
      logger.error('No userId in checkout session metadata');
      return;
    }

    // Retrieve the subscription
    const subscription = await this.stripe.subscriptions.retrieve(session.subscription as string);
    await this.updateUserSubscription(userId, subscription);

    // Record payment
    if (session.payment_intent) {
      await prisma.payment.create({
        data: {
          userId,
          stripePaymentId: session.payment_intent as string,
          amount: session.amount_total || 0,
          currency: session.currency || 'usd',
          status: 'succeeded',
          paymentMethod: 'card', // Will be updated when we get more info
          keitaroSubId: session.metadata?.keitaroSubId || null,
        },
      });
    }
  }

  /**
   * Handle subscription update
   */
  private async handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata?.userId;
    if (!userId) {
      logger.error('No userId in subscription metadata');
      return;
    }

    await this.updateUserSubscription(userId, subscription);
  }

  /**
   * Handle subscription deleted
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata?.userId;
    if (!userId) {
      logger.error('No userId in subscription metadata');
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: 'canceled',
        subscriptionEndDate: new Date(subscription.current_period_end * 1000),
      },
    });
  }

  /**
   * Handle invoice payment succeeded
   */
  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    if (!invoice.subscription || !invoice.payment_intent) {
      return;
    }

    const subscription = await this.stripe.subscriptions.retrieve(invoice.subscription as string);
    const userId = subscription.metadata?.userId;
    
    if (!userId) {
      return;
    }

    // Record payment
    await prisma.payment.create({
      data: {
        userId,
        stripePaymentId: invoice.payment_intent as string,
        amount: invoice.amount_paid,
        currency: invoice.currency,
        status: 'succeeded',
        paymentMethod: 'card',
        keitaroSubId: subscription.metadata?.keitaroSubId || null,
      },
    });
  }

  /**
   * Handle invoice payment failed
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    if (!invoice.subscription) {
      return;
    }

    const subscription = await this.stripe.subscriptions.retrieve(invoice.subscription as string);
    const userId = subscription.metadata?.userId;
    
    if (!userId) {
      return;
    }

    // Update subscription status
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: 'past_due',
      },
    });
  }

  /**
   * Get customer portal session
   */
  async createPortalSession(userId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.stripeCustomerId) {
      throw new Error('No Stripe customer found for user');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    return session;
  }
}

// Export singleton instance
export const stripeService = new StripeService();
