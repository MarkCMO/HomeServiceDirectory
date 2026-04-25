// listing-checkout.js - Square Checkout for listing upgrades
// POST /api/listing-checkout { plan, slug, email, rep_id? }
// Creates Square payment link + records subscription in Supabase

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'POST only' }) };

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        error:      'payment_not_configured',
        message:    'Payment processing is being set up. Contact hello@homeservicedirectory.com to upgrade.',
        contactUrl: '/contact'
      })
    };
  }

  try {
    const { plan, slug, email, rep_id } = JSON.parse(event.body || '{}');
    if (!plan || !slug) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'plan and slug required' }) };
    }

    const siteUrl = process.env.SITE_URL || 'https://homeservicedirectory.com';

    const planMap = {
      pro:     { variationId: process.env.SQUARE_PRO_PLAN_ID,     name: 'Pro',         amount: 14900 },
      premium: { variationId: process.env.SQUARE_PREMIUM_PLAN_ID, name: 'Premium',     amount: 29900 },
      elite:   { variationId: process.env.SQUARE_ELITE_PLAN_ID,   name: 'Elite',       amount: 49900 },
      sponsor: { variationId: process.env.SQUARE_SPONSOR_PLAN_ID, name: 'City Sponsor', amount: 79900 }
    };

    const planConfig = planMap[plan];
    if (!planConfig) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid plan: pro | premium | elite | sponsor' }) };
    }

    // Load provider (Supabase → Blobs)
    let provider   = null;
    let providerId = null;
    try {
      const { db } = require('./_supabase');
      const { data: prov } = await db.providers()
        .select('id, name, city, state, email')
        .eq('slug', slug)
        .maybeSingle();
      if (prov) { provider = prov; providerId = prov.id; }
    } catch (e) {}

    if (!provider) {
      try {
        const { getStore } = require('./blobs');
        provider = await getStore('provider-listings').get(slug, { type: 'json' }).catch(() => null);
      } catch (e) {}
    }

    const providerName = provider
      ? provider.name + (provider.city ? ` - ${provider.city}, ${provider.state}` : '')
      : slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const idempotencyKey = 'hsd-' + slug + '-' + plan + '-' + Date.now();
    const locationId     = await getLocationId(accessToken);

    // ── Create Square Payment Link ──────────────────────────────────
    const checkoutRes = await fetch('https://connect.squareup.com/v2/online-checkout/payment-links', {
      method: 'POST',
      headers: {
        'Authorization':  'Bearer ' + accessToken,
        'Content-Type':   'application/json',
        'Square-Version': '2024-01-18'
      },
      body: JSON.stringify({
        idempotency_key: idempotencyKey,
        quick_pay: {
          name:         'HomeServiceDirectory ' + planConfig.name + ' - ' + providerName,
          price_money:  { amount: planConfig.amount, currency: 'USD' },
          location_id:  locationId
        },
        checkout_options: {
          redirect_url:           siteUrl + '/listing-upgrade-success?slug=' + encodeURIComponent(slug) + '&plan=' + plan,
          allow_tipping:          false,
          subscription_plan_id:   planConfig.variationId || undefined
        },
        pre_populated_data: { buyer_email: email || (provider?.email) || undefined },
        payment_note: 'HSD-' + plan.toUpperCase() + '-' + slug
      })
    });

    const checkoutData = await checkoutRes.json();

    if (checkoutData.payment_link?.url) {
      const orderId = checkoutData.payment_link.order_id;

      // ── Record pending subscription in Supabase ─────────────────
      if (providerId) {
        try {
          const { db } = require('./_supabase');
          const { getTenant } = require('./_tenant');
          const tenant = await getTenant(event).catch(() => null);

          await db.subscriptions().upsert({
            tenant_id:     tenant?.id || null,
            provider_id:   providerId,
            plan,
            monthly_amount: planConfig.amount,
            status:        'pending',
            assigned_rep_id: rep_id || null
          }, { onConflict: 'provider_id' });

          // Update provider plan immediately (optimistic - Square confirms via webhook)
          await db.providers().update({
            plan,
            subscription_status: 'pending'
          }).eq('id', providerId);
        } catch (dbErr) { console.log('Supabase subscription record failed:', dbErr.message); }
      }

      // Mark pending in Blobs too
      try {
        const { getStore } = require('./blobs');
        const store = getStore('provider-listings');
        const listing = await store.get(slug, { type: 'json' }).catch(() => null);
        if (listing) {
          listing.pendingUpgrade = { plan, orderId, createdAt: new Date().toISOString() };
          await store.setJSON(slug, listing);
        }
      } catch (e) {}

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ url: checkoutData.payment_link.url, orderId })
      };
    }

    // ── Fallback: one-time charge without subscription ──────────────
    console.warn('Square subscription checkout failed, trying one-time:', JSON.stringify(checkoutData.errors));

    const simpleRes = await fetch('https://connect.squareup.com/v2/online-checkout/payment-links', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json', 'Square-Version': '2024-01-18' },
      body: JSON.stringify({
        idempotency_key: idempotencyKey + '-simple',
        quick_pay: {
          name:        'HomeServiceDirectory ' + planConfig.name + ' - ' + providerName,
          price_money: { amount: planConfig.amount, currency: 'USD' },
          location_id: locationId
        },
        checkout_options: {
          redirect_url: siteUrl + '/listing-upgrade-success?slug=' + encodeURIComponent(slug) + '&plan=' + plan
        },
        pre_populated_data: { buyer_email: email || undefined }
      })
    });

    const simpleData = await simpleRes.json();
    if (simpleData.payment_link?.url) {
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ url: simpleData.payment_link.url }) };
    }

    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Could not create checkout. Contact hello@homeservicedirectory.com', details: simpleData.errors || checkoutData.errors })
    };
  } catch (err) {
    console.error('listing-checkout error:', err);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: err.message }) };
  }
};

let cachedLocationId = null;
async function getLocationId(token) {
  if (cachedLocationId) return cachedLocationId;
  try {
    const res  = await fetch('https://connect.squareup.com/v2/locations', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    cachedLocationId = data.locations?.[0]?.id;
  } catch (e) {}
  return cachedLocationId;
}

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
}
