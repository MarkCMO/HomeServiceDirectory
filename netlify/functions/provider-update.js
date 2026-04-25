// provider-update.js - Update provider listing fields
// POST /api/provider-update { slug, token, ...fields }
// Auth via accessToken on the provider listing

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const data = JSON.parse(event.body || '{}');
    const { slug, token } = data;

    if (!slug || !token) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'slug and token are required' }) };
    }

    const { getStore } = require('./blobs');
    const store = getStore('provider-listings');

    // Auth: verify accessToken
    const listing = await store.get(slug, { type: 'json' }).catch(() => null);
    if (!listing) {
      return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Listing not found' }) };
    }
    if (listing.accessToken !== token) {
      return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // Allowed fields that providers can update
    const allowedFields = [
      'name', 'phone', 'website', 'description',
      'address', 'city', 'state', 'zip',
      'categories', 'subcategories', 'serviceTypes',
      'serviceArea', 'hours', 'languages',
      'license', 'insurance', 'bonded',
      'yearEstablished', 'employees',
      'photos', 'logo',
      'socialFacebook', 'socialInstagram', 'socialTwitter', 'socialLinkedin',
      'tagline', 'highlights'
    ];

    // Protected fields that cannot be updated by the provider
    const protectedFields = [
      'slug', 'email', 'accessToken', 'passwordHash',
      'plan', 'status', 'rating', 'reviewCount',
      'stripeCustomerId', 'stripeSubscriptionId',
      'createdAt', 'viewCount', 'leadCount'
    ];

    let updatedCount = 0;
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        // Sanitize string fields
        if (typeof data[field] === 'string') {
          listing[field] = data[field].trim().slice(0, field === 'description' ? 5000 : 500);
        } else if (Array.isArray(data[field])) {
          // Limit array fields to 20 items, each string max 200 chars
          listing[field] = data[field]
            .slice(0, 20)
            .map(item => typeof item === 'string' ? item.trim().slice(0, 200) : item);
        } else if (typeof data[field] === 'boolean') {
          listing[field] = data[field];
        } else if (typeof data[field] === 'number') {
          listing[field] = data[field];
        }
        updatedCount++;
      }
    }

    // Warn if trying to update protected fields
    const attempted = Object.keys(data).filter(k => protectedFields.includes(k));
    if (attempted.length > 0) {
      console.log(`provider-update: blocked protected field updates for ${slug}: ${attempted.join(', ')}`);
    }

    if (updatedCount === 0 && attempted.length === 0) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'No valid fields to update' }) };
    }

    listing.updatedAt = new Date().toISOString();
    await store.setJSON(slug, listing);

    // Return safe copy
    const safe = { ...listing };
    delete safe.accessToken;
    delete safe.passwordHash;

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        message: `Listing updated (${updatedCount} field${updatedCount !== 1 ? 's' : ''})`,
        listing: safe,
        ...(attempted.length > 0 ? { warning: `Protected fields ignored: ${attempted.join(', ')}` } : {})
      })
    };
  } catch (err) {
    console.error('provider-update error:', err);
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
