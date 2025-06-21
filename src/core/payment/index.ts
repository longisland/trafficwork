export * from './stripe.service';

/**
 * Client-side payment configuration for Stripe Elements
 * This configuration enables Apple Pay and Google Pay through Payment Request API
 */
export const paymentElementConfig = {
  // Payment Request options for Apple Pay and Google Pay
  paymentRequest: {
    country: 'US',
    currency: 'usd',
    requestPayerName: true,
    requestPayerEmail: true,
  },
  
  // Appearance customization
  appearance: {
    theme: 'stripe',
    variables: {
      colorPrimary: '#0570de',
      colorBackground: '#ffffff',
      colorSurface: '#ffffff',
      colorText: '#30313d',
      colorDanger: '#df1b41',
      fontFamily: 'system-ui, sans-serif',
      spacingUnit: '4px',
      borderRadius: '4px',
    },
  },
};

/**
 * Helper to create Stripe Payment Request Button element
 * This automatically detects and shows Apple Pay or Google Pay based on the browser
 */
export const createPaymentRequestButton = `
// This code should be used on the client side
async function createPaymentRequestButton(stripe, options) {
  const paymentRequest = stripe.paymentRequest({
    country: options.country || 'US',
    currency: options.currency || 'usd',
    total: {
      label: options.label || 'Subscription',
      amount: options.amount, // Amount in cents
    },
    requestPayerName: true,
    requestPayerEmail: true,
  });

  // Check if the Payment Request API is available
  const result = await paymentRequest.canMakePayment();
  
  if (!result) {
    // Hide the Payment Request Button if not available
    return null;
  }

  // Create the Payment Request Button element
  const elements = stripe.elements();
  const prButton = elements.create('paymentRequestButton', {
    paymentRequest: paymentRequest,
  });

  // Handle the payment
  paymentRequest.on('paymentmethod', async (ev) => {
    try {
      // Call your server to create the subscription with the payment method
      const response = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getAuthToken(),
        },
        body: JSON.stringify({
          paymentMethodId: ev.paymentMethod.id,
          priceId: options.priceId,
        }),
      });

      const data = await response.json();

      if (data.error) {
        ev.complete('fail');
        showError(data.error);
      } else {
        ev.complete('success');
        // Redirect to success page or show success message
        window.location.href = '/subscription/success';
      }
    } catch (error) {
      ev.complete('fail');
      showError('Payment failed. Please try again.');
    }
  });

  return prButton;
}

// Example usage:
// const prButton = await createPaymentRequestButton(stripe, {
//   amount: 999, // $9.99
//   label: 'Monthly Subscription',
//   priceId: 'price_monthly',
//   country: 'US',
//   currency: 'usd'
// });
// 
// if (prButton) {
//   prButton.mount('#payment-request-button');
// } else {
//   // Show regular card form as fallback
//   document.getElementById('card-element').style.display = 'block';
// }
`;

/**
 * Client-side code for Stripe Checkout (alternative approach)
 */
export const stripeCheckoutExample = `
// This code should be used on the client side
async function redirectToCheckout(priceId) {
  try {
    const response = await fetch('/api/subscription/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getAuthToken(),
      },
      body: JSON.stringify({ priceId }),
    });

    const { sessionId } = await response.json();

    // Redirect to Stripe Checkout
    const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
    const { error } = await stripe.redirectToCheckout({ sessionId });

    if (error) {
      showError(error.message);
    }
  } catch (error) {
    showError('Failed to create checkout session');
  }
}
`;

/**
 * Payment method types supported by the framework
 */
export enum PaymentMethodType {
  CARD = 'card',
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay',
  LINK = 'link',
}

/**
 * Subscription status types
 */
export enum SubscriptionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  UNPAID = 'unpaid',
  TRIALING = 'trialing',
}

/**
 * Helper to detect payment method from Stripe payment method object
 */
export function detectPaymentMethodType(paymentMethod: any): PaymentMethodType {
  if (paymentMethod.type === 'card') {
    // Check if it's a wallet payment
    if (paymentMethod.card?.wallet?.type === 'apple_pay') {
      return PaymentMethodType.APPLE_PAY;
    }
    if (paymentMethod.card?.wallet?.type === 'google_pay') {
      return PaymentMethodType.GOOGLE_PAY;
    }
    return PaymentMethodType.CARD;
  }
  if (paymentMethod.type === 'link') {
    return PaymentMethodType.LINK;
  }
  return PaymentMethodType.CARD;
}
