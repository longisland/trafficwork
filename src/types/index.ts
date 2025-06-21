/**
 * Common types for the TrafficWork framework
 */

/**
 * User type from database
 */
export interface User {
  id: string;
  email: string;
  password: string;
  name?: string | null;
  stripeCustomerId?: string | null;
  subscriptionId?: string | null;
  subscriptionStatus?: string | null;
  subscriptionPlan?: string | null;
  subscriptionEndDate?: Date | null;
  keitaroSubId?: string | null;
  registrationSource?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date | null;
}

/**
 * User without password (for API responses)
 */
export type UserResponse = Omit<User, 'password'>;

/**
 * Session type
 */
export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Payment type
 */
export interface Payment {
  id: string;
  userId: string;
  stripePaymentId: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod?: string | null;
  keitaroSubId?: string | null;
  createdAt: Date;
}

/**
 * Tracking event type
 */
export interface TrackingEvent {
  id: string;
  userId?: string | null;
  eventType: string;
  subId?: string | null;
  status?: string | null;
  amount?: number | null;
  currency?: string | null;
  metadata?: any;
  sentToTracker: boolean;
  sentAt?: Date | null;
  createdAt: Date;
}

/**
 * API Error response
 */
export interface ApiError {
  error: string;
  message?: string;
  errors?: any[];
}

/**
 * API Success response
 */
export interface ApiSuccess<T = any> {
  success: true;
  message?: string;
  data: T;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T = any> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Authentication response
 */
export interface AuthResponse {
  user: UserResponse;
  token: string;
}

/**
 * Subscription status response
 */
export interface SubscriptionStatus {
  hasSubscription: boolean;
  status: string;
  plan?: string | null;
  endDate?: Date | null;
}

/**
 * Framework configuration type (partial, for client)
 */
export interface PublicConfig {
  stripe: {
    publishableKey: string;
  };
  app: {
    name: string;
    url: string;
  };
}

/**
 * Request with pagination
 */
export interface PaginatedRequest {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Stripe webhook event types we handle
 */
export enum StripeWebhookEvent {
  CHECKOUT_SESSION_COMPLETED = 'checkout.session.completed',
  CUSTOMER_SUBSCRIPTION_CREATED = 'customer.subscription.created',
  CUSTOMER_SUBSCRIPTION_UPDATED = 'customer.subscription.updated',
  CUSTOMER_SUBSCRIPTION_DELETED = 'customer.subscription.deleted',
  INVOICE_PAYMENT_SUCCEEDED = 'invoice.payment_succeeded',
  INVOICE_PAYMENT_FAILED = 'invoice.payment_failed',
}

/**
 * Environment types
 */
export type Environment = 'development' | 'staging' | 'production';

/**
 * Framework metadata
 */
export const FRAMEWORK_VERSION = '1.0.0';
export const FRAMEWORK_NAME = 'TrafficWork Framework';
