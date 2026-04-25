// stripe-webhook.js - Stripe webhook handler for subscription events
// POST /api/stripe-webhook
//
// Events handled:
//   checkout.session.completed  - Upgrade provider plan
//   customer.subscription.deleted - Downgrade to free
//   invoice.payment_failed - Log for monitoring

const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const sig = event.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !endpointSecret) {
    console.error('Missing stripe-signature header or STRIPE_WEBHOOK_SECRET env');
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing signature' }) };
  }

  // Verify Stripe signature
  let stripeEvent;
  try {
    stripeEvent = verifyStripeSignature(event.body, sig, endpointSecret);
  } catch (err) {
    console.error('Stripe signature verification failed:', err.message);
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  const { type, data } = stripeEvent;
  console.log(`Stripe webhook received: ${type}`);

  try {
    const { getStore } = require('./blobs');
    const store = getStore('provider-listings');

    switch (type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(store, data.object);
        break;
      }
      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(store, data.object);
        break;
      }
      case 'invoice.payment_failed': {
        await handlePaymentFailed(data.object);
        break;
      }
      default:
        console.log(`Unhandled event type: ${type}`);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.error(`Stripe webhook error (${type}):`, err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Webhook processing failed' }) };
  }
};

// --- Event Handlers ---

async function handleCheckoutCompleted(store, session) {
  const slug = session.metadata && session.metadata.slug;
  if (!slug) {
    console.log('checkout.session.completed: no slug in metadata, skipping');
    return;
  }

  const plan = (session.metadata && session.metadata.plan) || 'pro';
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  const listing = await store.get(slug, { type: 'json' }).catch(() => null);
  if (!listing) {
    console.error(`checkout.session.completed: listing not found for slug ${slug}`);
    return;
  }

  listing.plan = plan;
  listing.stripeCustomerId = customerId || listing.stripeCustomerId;
  listing.stripeSubscriptionId = subscriptionId || listing.stripeSubscriptionId;
  listing.planUpdatedAt = new Date().toISOString();
  listing.status = listing.status === 'pending' ? 'active' : listing.status;

  // Clear any pending upgrade flag
  delete listing.pendingUpgrade;

  await store.setJSON(slug, listing);
  console.log(`Upgraded ${slug} to ${plan} plan (customer: ${customerId})`);
}

async function handleSubscriptionDeleted(store, subscription) {
  const customerId = subscription.customer;
  if (!customerId) {
    console.log('customer.subscription.deleted: no customer ID, skipping');
    return;
  }

  // Find listing by stripeCustomerId
  const { blobs } = await store.list();
  for (const blob of (blobs || [])) {
    try {
      const listing = await store.get(blob.key, { type: 'json' });
      if (listing && listing.stripeCustomerId === customerId) {
        const previousPlan = listing.plan;
        listing.plan = 'free';
        listing.planUpdatedAt = new Date().toISOString();
        listing.stripeSubscriptionId = null;
        await store.setJSON(blob.key, listing);
        console.log(`Downgraded ${blob.key} from ${previousPlan} to free (subscription deleted)`);
        return;
      }
    } catch (e) {
      // continue searching
    }
  }
  console.log(`customer.subscription.deleted: no listing found for customer ${customerId}`);
}

async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;
  const amount = invoice.amount_due;
  const attemptCount = invoice.attempt_count;
  console.warn(`Payment failed for customer ${customerId}: $${(amount / 100).toFixed(2)}, attempt #${attemptCount}`);
  // Future: send notification email, flag account, etc.
}

// --- Stripe Signature Verification ---

function verifyStripeSignature(payload, sigHeader, secret) {
  const elements = sigHeader.split(',');
  const sigMap = {};
  for (const el of elements) {
    const [key, val] = el.split('=');
    if (key && val) sigMap[key.trim()] = val.trim();
  }

  const timestamp = sigMap.t;
  const signature = sigMap.v1;
  if (!timestamp || !signature) {
    throw new Error('Missing timestamp or signature in header');
  }

  // Protect against replay attacks (5 minute tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    throw new Error('Timestamp outside tolerance');
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  // Constant-time comparison
  if (expectedSig.length !== signature.length) {
    throw new Error('Signature mismatch');
  }
  const a = Buffer.from(expectedSig, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (!crypto.timingSafeEqual(a, b)) {
    throw new Error('Signature mismatch');
  }

  return JSON.parse(payload);
}
