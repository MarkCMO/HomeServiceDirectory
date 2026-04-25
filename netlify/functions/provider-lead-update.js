// provider-lead-update.js - Update lead status/notes
// POST /api/provider-lead-update { slug, leadId, status, notes, token }
// Auth via accessToken on the provider listing

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const data = JSON.parse(event.body || '{}');
    const { slug, leadId, status, notes, token } = data;

    if (!slug || !leadId || !token) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'slug, leadId, and token are required' }) };
    }

    // Validate status
    const validStatuses = ['new', 'contacted', 'converted', 'closed'];
    if (status && !validStatuses.includes(status)) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }) };
    }

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

    // Get and update the lead
    const leadStore = getStore('provider-leads');
    const leadKey = `${slug}_${leadId}`;
    const lead = await leadStore.get(leadKey, { type: 'json' }).catch(() => null);
    if (!lead) {
      return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Lead not found' }) };
    }

    // Apply updates
    if (status) lead.status = status;
    if (notes !== undefined) lead.notes = String(notes).trim().slice(0, 2000);
    lead.updatedAt = new Date().toISOString();

    await leadStore.setJSON(leadKey, lead);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ message: 'Lead updated', lead })
    };
  } catch (err) {
    console.error('provider-lead-update error:', err);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Server error' }) };
  }
};

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'private, no-cache'
  };
}
