export * from './keitaro.service';

/**
 * Analytics module for the TrafficWork framework
 * Provides integration with Keitaro tracker for conversion tracking
 */

import { Request } from 'express';

/**
 * Extended Request with tracking information
 */
export interface TrackedRequest extends Request {
  keitaroClickId?: string;
}

/**
 * Helper function to get tracking script for HTML pages
 */
export function getAnalyticsHeadScript(campaignId?: string): string {
  const scripts: string[] = [];
  
  // Add Keitaro tracking script if enabled
  if (process.env.KEITARO_JS_ENABLED === 'true') {
    const { KeitaroService } = require('./keitaro.service');
    scripts.push(KeitaroService.getTrackingScript(campaignId));
  }
  
  return scripts.join('\n');
}

/**
 * Tracking event types
 */
export enum TrackingEventType {
  REGISTRATION = 'registration',
  PURCHASE = 'purchase',
  SUBSCRIPTION_START = 'subscription_start',
  SUBSCRIPTION_RENEWAL = 'subscription_renewal',
  SUBSCRIPTION_CANCEL = 'subscription_cancel',
  CUSTOM = 'custom'
}

/**
 * Conversion status types for Keitaro
 */
export enum ConversionStatus {
  LEAD = 'lead',
  REGISTRATION = 'reg',
  SALE = 'sale',
  DEPOSIT = 'dep',
  HOLD = 'hold',
  REJECT = 'reject',
  TRASH = 'trash'
}

/**
 * Analytics configuration interface
 */
export interface AnalyticsConfig {
  keitaro: {
    enabled: boolean;
    trackerUrl: string;
    postbackKey: string;
    campaignId: string;
    jsTracking: boolean;
    statuses: {
      registration: string;
      purchase: string;
    };
  };
}

/**
 * Helper to build postback URL manually (for debugging or custom implementations)
 */
export function buildKeitaroPostbackUrl(
  trackerUrl: string,
  clickId: string,
  status: string,
  key: string,
  options?: {
    amount?: number;
    currency?: string;
    tid?: string; // Transaction ID
    [key: string]: any;
  }
): string {
  const params = new URLSearchParams({
    subid: clickId,
    status,
    key
  });

  if (options) {
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });
  }

  return `${trackerUrl}/postback?${params.toString()}`;
}

/**
 * Client-side tracking helper code
 */
export const clientTrackingCode = `
// Client-side helper to get Keitaro click ID
function getKeitaroClickId() {
  // Check URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const paramNames = ['subid', 'sub_id', 'clickid', 'click_id', '_subid'];
  
  for (const param of paramNames) {
    const value = urlParams.get(param);
    if (value) {
      // Store in localStorage for persistence
      localStorage.setItem('keitaro_subid', value);
      return value;
    }
  }
  
  // Check localStorage
  return localStorage.getItem('keitaro_subid');
}

// Include click ID in API requests
function addClickIdToRequest(data) {
  const clickId = getKeitaroClickId();
  if (clickId) {
    data.keitaroSubId = clickId;
  }
  return data;
}

// Example usage in registration:
// const registrationData = addClickIdToRequest({
//   email: 'user@example.com',
//   password: 'password123'
// });
`;

/**
 * Server-side tracking integration example
 */
export const trackingIntegrationExample = `
// Example: Track registration after user signup
app.post('/api/register', async (req, res) => {
  try {
    // Register user
    const { user, token } = await AuthService.register(
      req.body.email,
      req.body.password,
      req.body.name,
      req.keitaroClickId || req.body.keitaroSubId // From middleware or request body
    );
    
    // Track registration conversion
    await keitaroService.trackRegistration(user.id);
    
    res.json({ user, token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Example: Track purchase after successful payment
stripeService.on('payment.succeeded', async (payment) => {
  await keitaroService.trackPurchase(
    payment.userId,
    payment.amount,
    payment.currency
  );
});
`;
