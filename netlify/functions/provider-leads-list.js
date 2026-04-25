// provider-leads-list.js - List leads for a provider
// GET /api/provider-leads-list?slug=xxx&token=xxx
// Auth via accessToken on the provider listing

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const params = event.queryStringParameters || {};
  const { slug, token } = params;

  if (!slug || !token) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'slug and token are required' }) };
  }

  try {
    const { getStore } = require('./blobs');

    // Auth: verify accessToken
    const listingStore = getStore('provider-listings');
    const listing = await listingStore.get(slug, { type: 'json' }).catch(() => null);
    if (!listing) {
      return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Listing not found' }) };
    }
    if (listing.accessToken !== token) {
      return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // Fetch all leads for this provider
    const leadStore = getStore('provider-leads');
    const { blobs } = await leadStore.list({ prefix: `${slug}_` });

    const leads = [];
    for (const blob of (blobs || []).slice(0, 500)) {
      try {
        const lead = await leadStore.get(blob.key, { type: 'json' });
        if (lead) leads.push(lead);
      } catch (e) {
        console.log(`Failed to read lead ${blob.key}:`, e.message);
      }
    }

    // Sort by createdAt descending (newest first)
    leads.sort((a, b) => {
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Summary stats
    const stats = {
      total: leads.length,
      new: leads.filter(l => l.status === 'new').length,
      contacted: leads.filter(l => l.status === 'contacted').length,
      converted: leads.filter(l => l.status === 'converted').length,
      closed: leads.filter(l => l.status === 'closed').length
    };

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ leads, stats })
    };
  } catch (err) {
    console.error('provider-leads-list error:', err);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Server error' }) };
  }
};

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'private, no-cache'
  };
}
