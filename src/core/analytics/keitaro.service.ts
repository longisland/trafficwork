import axios from 'axios';
import { config } from '../config';
import { prisma } from '../database';
import logger, { logKeitaroEvent } from '../../utils/logger';

/**
 * Keitaro tracking service for conversion tracking
 */
export class KeitaroService {
  private trackerUrl: string;
  private postbackKey: string;

  constructor() {
    this.trackerUrl = config.keitaro.trackerUrl;
    this.postbackKey = config.keitaro.postbackKey;
  }

  /**
   * Extract click ID (subid) from request
   */
  static extractClickId(req: any): string | null {
    // Check multiple possible parameter names
    const possibleParams = ['subid', 'sub_id', 'clickid', 'click_id', '_subid'];
    
    for (const param of possibleParams) {
      if (req.query[param]) {
        return req.query[param] as string;
      }
    }

    // Check cookies if not in query
    if (req.cookies?.keitaro_subid) {
      return req.cookies.keitaro_subid;
    }

    return null;
  }

  /**
   * Store click ID in session/cookie
   */
  static storeClickId(res: any, clickId: string): void {
    // Store in cookie for 30 days
    res.cookie('keitaro_subid', clickId, {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: config.app.env === 'production',
      sameSite: 'lax'
    });
  }

  /**
   * Send conversion postback to Keitaro
   */
  async sendPostback(
    clickId: string,
    status: string,
    amount?: number,
    currency?: string
  ): Promise<boolean> {
    try {
      const params = new URLSearchParams({
        subid: clickId,
        status,
        key: this.postbackKey
      });

      if (amount !== undefined) {
        params.append('payout', amount.toString());
      }

      if (currency) {
        params.append('currency', currency);
      }

      const url = `${this.trackerUrl}/postback?${params.toString()}`;
      
      logger.info('Sending Keitaro postback', { url, clickId, status, amount });

      const response = await axios.get(url, {
        timeout: 5000,
        validateStatus: (status) => status < 500
      });

      if (response.status === 200) {
        logger.info('Keitaro postback sent successfully', { 
          clickId, 
          status, 
          response: response.data 
        });
        return true;
      } else {
        logger.error('Keitaro postback failed', { 
          clickId, 
          status, 
          responseStatus: response.status,
          responseData: response.data 
        });
        return false;
      }
    } catch (error) {
      logger.error('Failed to send Keitaro postback', { error, clickId, status });
      return false;
    }
  }

  /**
   * Track registration event
   */
  async trackRegistration(userId: string, clickId?: string): Promise<void> {
    if (!clickId) {
      // Try to get click ID from user record
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { keitaroSubId: true }
      });
      clickId = user?.keitaroSubId || undefined;
    }

    if (!clickId) {
      logger.info('No click ID for registration tracking', { userId });
      return;
    }

    // Log the tracking event
    logKeitaroEvent('registration', { userId, clickId });

    // Store tracking event in database
    const trackingEvent = await prisma.trackingEvent.create({
      data: {
        userId,
        eventType: 'registration',
        subId: clickId,
        status: config.keitaro.statuses.registration
      }
    });

    // Send postback
    const success = await this.sendPostback(
      clickId,
      config.keitaro.statuses.registration
    );

    // Update tracking event
    await prisma.trackingEvent.update({
      where: { id: trackingEvent.id },
      data: {
        sentToTracker: success,
        sentAt: success ? new Date() : null
      }
    });
  }

  /**
   * Track purchase/subscription event
   */
  async trackPurchase(
    userId: string,
    amount: number,
    currency: string = 'USD',
    clickId?: string
  ): Promise<void> {
    if (!clickId) {
      // Try to get click ID from user record
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { keitaroSubId: true }
      });
      clickId = user?.keitaroSubId || undefined;
    }

    if (!clickId) {
      logger.info('No click ID for purchase tracking', { userId, amount });
      return;
    }

    // Log the tracking event
    logKeitaroEvent('purchase', { userId, clickId, amount, currency });

    // Store tracking event in database
    const trackingEvent = await prisma.trackingEvent.create({
      data: {
        userId,
        eventType: 'purchase',
        subId: clickId,
        status: config.keitaro.statuses.purchase,
        amount: Math.round(amount), // Amount in cents
        currency
      }
    });

    // Convert amount to dollars for Keitaro (from cents)
    const amountInDollars = amount / 100;

    // Send postback
    const success = await this.sendPostback(
      clickId,
      config.keitaro.statuses.purchase,
      amountInDollars,
      currency
    );

    // Update tracking event
    await prisma.trackingEvent.update({
      where: { id: trackingEvent.id },
      data: {
        sentToTracker: success,
        sentAt: success ? new Date() : null
      }
    });
  }

  /**
   * Track custom event
   */
  async trackCustomEvent(
    eventType: string,
    clickId: string,
    metadata?: any
  ): Promise<void> {
    // Log the tracking event
    logKeitaroEvent(eventType, { clickId, metadata });

    // Store tracking event in database
    const trackingEvent = await prisma.trackingEvent.create({
      data: {
        eventType,
        subId: clickId,
        metadata: metadata || {}
      }
    });

    // For custom events, we might not send a postback
    // This depends on your Keitaro configuration
    logger.info('Custom event tracked', { eventType, clickId, metadata });
  }

  /**
   * Retry failed postbacks
   */
  async retryFailedPostbacks(): Promise<void> {
    const failedEvents = await prisma.trackingEvent.findMany({
      where: {
        sentToTracker: false,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      take: 100 // Process 100 at a time
    });

    logger.info(`Retrying ${failedEvents.length} failed postbacks`);

    for (const event of failedEvents) {
      if (!event.subId) continue;

      let success = false;

      if (event.eventType === 'registration') {
        success = await this.sendPostback(
          event.subId,
          event.status || config.keitaro.statuses.registration
        );
      } else if (event.eventType === 'purchase' && event.amount) {
        success = await this.sendPostback(
          event.subId,
          event.status || config.keitaro.statuses.purchase,
          event.amount / 100, // Convert cents to dollars
          event.currency || 'USD'
        );
      }

      if (success) {
        await prisma.trackingEvent.update({
          where: { id: event.id },
          data: {
            sentToTracker: true,
            sentAt: new Date()
          }
        });
      }
    }
  }

  /**
   * Get Keitaro JavaScript tracking code
   */
  static getTrackingScript(campaignId?: string): string {
    const campaign = campaignId || config.keitaro.campaignId;
    
    return `
<!-- Keitaro Tracking Script -->
<script>
(function() {
  var script = document.createElement('script');
  script.src = '${config.keitaro.trackerUrl}/js/kclick.js?${campaign}';
  script.async = true;
  document.head.appendChild(script);
})();
</script>
<!-- End Keitaro Tracking Script -->
`;
  }

  /**
   * Middleware to capture and store click IDs
   */
  static trackingMiddleware() {
    return (req: any, res: any, next: any) => {
      const clickId = KeitaroService.extractClickId(req);
      
      if (clickId) {
        // Store in request for later use
        req.keitaroClickId = clickId;
        
        // Store in cookie
        KeitaroService.storeClickId(res, clickId);
        
        logger.info('Keitaro click ID captured', { clickId });
      }
      
      next();
    };
  }
}

// Export singleton instance
export const keitaroService = new KeitaroService();
