// square-webhook.js - Square subscription webhook handler
// POST /api/square-webhook
// Handles: subscription.updated, payment.completed, subscription.cancelled
// Idempotent via subscription_events.event_id unique constraint
// Triggers commission engine on each successful payment

const crypto = require('crypto');
const { db }  = require('./_supabase');
const { processPaymentCommission, processClawback } = require('./_commission');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Verify Square HMAC-SHA256 signature
  const signature = event.headers['x-square-hmacsha256-signature']
                  || event.headers['X-Square-HMACSHA256-Signature']
                  || '';
  const sigKey    = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '';

  if (sigKey && signature) {
    const notificationUrl = process.env.SQUARE_WEBHOOK_URL || `${process.env.SITE_URL}/api/square-webhook`;
    const hmac = crypto.createHmac('sha256', sigKey);
    hmac.update(notificationUrl + event.body);
    const expected = hmac.digest('base64');
    if (signature !== expected) {
      console.warn('Square webhook signature mismatch');
      return { statusCode: 403, body: 'Invalid signature' };
    }
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const eventId   = payload.event_id || payload.id;
  const eventType = payload.type     || payload.event_type || '';

  if (!eventId) return { statusCode: 400, body: 'Missing event_id' };

  // Idempotency check
  const { data: existing } = await db.subscription_events()
    .select('id')
    .eq('event_id', eventId)
    .maybeSingle();

  if (existing) {
    console.log('Square webhook already processed:', eventId);
    return { statusCode: 200, body: JSON.stringify({ idempotent: true, event_id: eventId }) };
  }

  try {
    // Record event first (idempotency)
    const { data: eventRecord } = await db.subscription_events().insert({
      event_id:   eventId,
      event_type: eventType,
      payload
    }).select('id').single();

    const data         = payload.data?.object || {};
    const subscriptionData = data.subscription || {};
    const paymentData  = data.payment || {};

    if (eventType === 'subscription.created' || eventType === 'subscription.updated') {
      const squareSubId = subscriptionData.id;
      const customerId  = subscriptionData.customer_id;
      const planId      = subscriptionData.plan_id || subscriptionData.plan_variation_id;
      const status      = subscriptionData.status?.toLowerCase();

      if (squareSubId) {
        // Find provider by Square subscription ID or customer ID
        const { data: sub } = await db.subscriptions()
          .select('id, provider_id, status')
          .eq('square_subscription_id', squareSubId)
          .maybeSingle();

        if (sub) {
          await db.subscriptions().update({
            status:               mapSquareStatus(status),
            square_customer_id:   customerId,
            updated_at:           new Date().toISOString()
          }).eq('id', sub.id);

          // Update event with subscription ref
          await db.subscription_events().update({ subscription_id: sub.id }).eq('id', eventRecord.id);
        }
      }
    }

    if (eventType === 'payment.completed' || eventType === 'invoice.payment_made') {
      const amountCents  = paymentData.amount_money?.amount || paymentData.total_money?.amount;
      const squareSubId  = paymentData.subscription_id || subscriptionData.id;

      if (squareSubId && amountCents) {
        const { data: sub } = await db.subscriptions()
          .select('id, tenant_id, assigned_rep_id, started_at')
          .eq('square_subscription_id', squareSubId)
          .maybeSingle();

        if (sub) {
          await db.subscription_events().update({ subscription_id: sub.id }).eq('id', eventRecord.id);

          // Trigger commission engine
          const commResult = await processPaymentCommission({
            tenantId:       sub.tenant_id,
            subscriptionId: sub.id,
            eventId:        eventRecord.id,
            grossCents:     amountCents,
            paymentDate:    new Date().toISOString()
          });

          console.log('Commission processed:', commResult);
        }
      }
    }

    if (eventType === 'subscription.cancelled' || eventType === 'subscription.deactivated') {
      const squareSubId = subscriptionData.id;

      if (squareSubId) {
        const { data: sub } = await db.subscriptions()
          .select('id, provider_id')
          .eq('square_subscription_id', squareSubId)
          .maybeSingle();

        if (sub) {
          await db.subscriptions().update({
            status:        'cancelled',
            cancelled_at:  new Date().toISOString()
          }).eq('id', sub.id);

          await db.subscription_events().update({ subscription_id: sub.id }).eq('id', eventRecord.id);

          // Update provider plan back to free
          await db.providers().update({
            plan:               'free',
            subscription_status: 'cancelled'
          }).eq('id', sub.provider_id);

          // Process clawback
          const clawResult = await processClawback({
            subscriptionId: sub.id,
            cancelledAt:    new Date().toISOString(),
            reason:         'Square subscription cancelled'
          });
          console.log('Clawback processed:', clawResult);
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true, event_id: eventId, event_type: eventType }) };
  } catch (err) {
    console.error('square-webhook error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};

function mapSquareStatus(squareStatus) {
  const map = { active: 'active', canceled: 'cancelled', paused: 'paused', pending: 'active', deactivated: 'cancelled' };
  return map[squareStatus] || squareStatus || 'active';
}
