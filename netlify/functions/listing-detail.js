// listing-detail.js - Public provider detail page data
// GET /api/listing-detail?slug=xxx
// Tries Supabase first, falls back to Netlify Blobs

const { db } = require('./_supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };

  const slug = (event.queryStringParameters || {}).slug;
  if (!slug) return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'slug required' }) };

  try {
    // ── Try Supabase ──────────────────────────────────────────────────
    let provider = null;
    try {
      const { data } = await db.providers()
        .select(`
          id, slug, name, email, phone, website, address, city, state, zip,
          categories, service_types, license_number, insurance_info,
          years_in_business, service_radius, is_24x7, description,
          plan, status, rating, review_count, view_count,
          state_slug, city_slug, submitted_at, created_at
        `)
        .eq('slug', slug)
        .eq('status', 'active')
        .maybeSingle();
      if (data) provider = data;
    } catch (supabaseErr) {
      console.warn('listing-detail Supabase error:', supabaseErr.message);
    }

    // Supabase: increment view_count
    if (provider) {
      db.providers()
        .update({ view_count: (provider.view_count || 0) + 1 })
        .eq('id', provider.id)
        .then(() => {})
        .catch(() => {});

      // Fetch reviews separately
      let reviews = [];
      try {
        const { data: revData } = await db.reviews()
          .select('id, reviewer_name, rating, comment, created_at')
          .eq('provider_id', provider.id)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(20);
        reviews = revData || [];
      } catch (e) {}

      // Fetch photos
      let photos = [];
      try {
        const { data: photoData } = await db.photos()
          .select('id, url, caption, is_primary')
          .eq('provider_id', provider.id)
          .order('is_primary', { ascending: false })
          .limit(50);
        photos = photoData || [];
      } catch (e) {}

      // Only show contact info for paid plans
      const isPaid = ['pro','premium','elite','sponsor'].includes(provider.plan);
      if (!isPaid) delete provider.email;

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ ...provider, reviews, photos, source: 'supabase' })
      };
    }

    // ── Fall back to Blobs ────────────────────────────────────────────
    const { getStore } = require('./blobs');
    const store   = getStore('provider-listings');
    const listing = await store.get(slug, { type: 'json' }).catch(() => null);

    if (!listing) return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ error: 'Listing not found' }) };

    // Increment view count
    listing.viewCount = (listing.viewCount || 0) + 1;
    await store.setJSON(slug, listing).catch(() => {});

    const safe = { ...listing };
    delete safe.accessToken;
    delete safe.passwordHash;
    delete safe.pendingUpgrade;

    const isPaid = ['pro','premium','elite','sponsor'].includes(safe.plan);
    if (!isPaid) delete safe.email;

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ ...safe, source: 'blobs' })
    };
  } catch (err) {
    console.error('listing-detail error:', err);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Server error' }) };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}
