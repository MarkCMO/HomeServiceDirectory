// admin-stats.js - Admin stats dashboard
// GET /api/admin-stats
// Requires X-Admin-Key header matching ADMIN_KEY env var

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Auth
  const adminKey = (event.headers['x-admin-key'] || '').trim();
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const { getStore } = require('./blobs');

    // Count listings by plan
    const listingStore = getStore('provider-listings');
    const { blobs: listingBlobs } = await listingStore.list();

    let totalListings = 0;
    let paidCount = 0;
    let freeCount = 0;
    const planBreakdown = { free: 0, pro: 0, premium: 0, elite: 0, sponsor: 0 };
    const statusBreakdown = { pending: 0, active: 0, suspended: 0 };

    for (const blob of (listingBlobs || [])) {
      try {
        const data = await listingStore.get(blob.key, { type: 'json' });
        if (!data) continue;
        totalListings++;
        const plan = data.plan || 'free';
        if (planBreakdown[plan] !== undefined) planBreakdown[plan]++;
        if (plan === 'pro' || plan === 'premium' || plan === 'elite' || plan === 'sponsor') {
          paidCount++;
        } else {
          freeCount++;
        }
        const status = data.status || 'pending';
        if (statusBreakdown[status] !== undefined) statusBreakdown[status]++;
      } catch (e) {
        console.log(`Failed to read listing ${blob.key}:`, e.message);
      }
    }

    // Estimate total leads from provider-leads store
    let totalLeads = 0;
    try {
      const leadStore = getStore('provider-leads');
      const { blobs: leadBlobs } = await leadStore.list();
      totalLeads = (leadBlobs || []).length;
    } catch (e) {
      console.log('Lead count error:', e.message);
    }

    // Estimate from provider-index (city/category index counts)
    let indexedCities = 0;
    try {
      const indexStore = getStore('provider-index');
      const { blobs: indexBlobs } = await indexStore.list();
      indexedCities = (indexBlobs || []).length;
    } catch (e) {
      console.log('Index count error:', e.message);
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        totalListings,
        paidCount,
        freeCount,
        totalLeads,
        indexedCities,
        planBreakdown,
        statusBreakdown,
        generatedAt: new Date().toISOString()
      })
    };
  } catch (err) {
    console.error('admin-stats error:', err);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Server error' }) };
  }
};

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    'Cache-Control': 'private, no-cache'
  };
}
