// provider-dashboard.js - Authenticated provider dashboard data
// GET /api/provider-dashboard
// Auth: Bearer token (session) or ?token= query param or email+password
// Tries Supabase first, falls back to Blobs

const { getSession, getTokenFromEvent, verifyPassword } = require('./_auth');
const { db } = require('./_supabase');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  const params = event.queryStringParameters || {};
  const ip = event.headers['x-forwarded-for'] || '';
  const ua = event.headers['user-agent'] || '';

  try {
    let provider    = null;
    let providerId  = null;

    // ── Auth Path 1: Session token ───────────────────────────────────
    const token = getTokenFromEvent(event) || params.token;
    if (token) {
      try {
        // Try Supabase session
        const session = await getSession(token);
        if (session && session.user_type === 'provider') {
          const { data: prov } = await db.providers()
            .select('id, slug, name, email, phone, website, city, state, plan, status, rating, review_count, view_count, categories, service_types, description, is_24x7, subscription_status, created_at')
            .eq('id', session.user_id)
            .maybeSingle();
          if (prov) { provider = prov; providerId = prov.id; }
        }
      } catch (e) {}

      // Legacy blob accessToken fallback
      if (!provider && params.slug) {
        try {
          const { getStore } = require('./blobs');
          const listing = await getStore('provider-listings').get(params.slug, { type: 'json' }).catch(() => null);
          if (listing && listing.accessToken === token) provider = normalizeListing(listing, params.slug);
        } catch (e) {}
      }
    }

    // ── Auth Path 2: email + password ────────────────────────────────
    if (!provider && params.email && params.password) {
      const emailKey = params.email.trim().toLowerCase();
      try {
        const { data: prov } = await db.providers()
          .select('id, slug, name, email, phone, website, city, state, plan, status, password_hash, rating, review_count, view_count, categories, service_types, description, is_24x7, subscription_status, created_at')
          .eq('email', emailKey)
          .maybeSingle();
        if (prov && prov.password_hash) {
          const valid = await verifyPassword(params.password, prov.password_hash);
          if (valid) { provider = prov; providerId = prov.id; }
          else return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Incorrect password' }) };
        }
      } catch (e) {}

      // Blob fallback
      if (!provider) {
        const crypto = require('crypto');
        try {
          const { getStore } = require('./blobs');
          const indexStore = getStore('provider-index');
          const emailIndex = await indexStore.get('email-index', { type: 'json' }).catch(() => ({}));
          const entries    = emailIndex[emailKey];
          if (entries?.length) {
            const hash  = crypto.createHash('sha256').update(String(params.password).trim()).digest('hex');
            const match = entries.find(e => e.passwordHash === hash);
            if (match) {
              const listing = await getStore('provider-listings').get(match.slug, { type: 'json' }).catch(() => null);
              if (listing) provider = normalizeListing(listing, match.slug);
              else return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Incorrect password' }) };
            } else return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Incorrect password' }) };
          }
        } catch (e) {}
      }
    }

    // ── Auth Path 3: slug required ───────────────────────────────────
    if (!provider) {
      return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Authentication required' }) };
    }

    // ── Build dashboard data ─────────────────────────────────────────
    const slug = provider.slug;

    // Fetch leads
    let leads = [];
    try {
      if (providerId) {
        const { data: supaLeads } = await db.leads()
          .select('id, contact_name, email, phone, city, state, category, message, status, created_at')
          .eq('provider_id', providerId)
          .order('created_at', { ascending: false })
          .limit(50);
        leads = supaLeads || [];
      } else {
        const { getStore } = require('./blobs');
        const leadsStore = getStore('provider-leads');
        const leadsData  = await leadsStore.get(slug + '-leads', { type: 'json' }).catch(() => null);
        leads = Array.isArray(leadsData) ? leadsData : (leadsData?.leads || []);
      }
    } catch (e) {}

    // Lead stats
    const leadStats = {
      total:     leads.length,
      new:       leads.filter(l => l.status === 'new').length,
      contacted: leads.filter(l => l.status === 'contacted').length,
      won:       leads.filter(l => l.status === 'won').length
    };

    // Fetch photos
    let photos = [];
    try {
      if (providerId) {
        const { data: photoData } = await db.photos()
          .select('id, url, caption, is_primary, created_at')
          .eq('provider_id', providerId)
          .order('is_primary', { ascending: false })
          .limit(50);
        photos = photoData || [];
      } else {
        const { getStore } = require('./blobs');
        const photoStore = getStore('provider-photos');
        const photoData  = await photoStore.get(slug + '-photos', { type: 'json' }).catch(() => null);
        photos = Array.isArray(photoData) ? photoData : [];
      }
    } catch (e) {}

    // Fetch subscription info
    let subscription = null;
    try {
      if (providerId) {
        const { data: sub } = await db.subscriptions()
          .select('plan, status, monthly_amount, created_at, next_billing_date')
          .eq('provider_id', providerId)
          .maybeSingle();
        subscription = sub;
      }
    } catch (e) {}

    // Strip sensitive fields
    const safeProvider = { ...provider };
    delete safeProvider.password_hash;
    delete safeProvider.access_token;

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        provider:     safeProvider,
        leads:        leads.slice(0, 50),
        leadStats,
        photos,
        subscription,
        planLimits:   getPlanLimits(provider.plan)
      })
    };
  } catch (err) {
    console.error('provider-dashboard error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error: ' + err.message }) };
  }
};

function normalizeListing(listing, slug) {
  return {
    slug,
    name:        listing.name,
    email:       listing.email,
    phone:       listing.phone,
    website:     listing.website,
    city:        listing.city,
    state:       listing.state,
    plan:        listing.plan || 'free',
    status:      listing.status || 'active',
    categories:  listing.categories || [],
    description: listing.description,
    is_24x7:     listing.is24x7,
    rating:      listing.rating || 0,
    review_count: listing.reviewCount || 0,
    view_count:  listing.viewCount || 0,
    created_at:  listing.createdAt || listing.submittedAt
  };
}

function getPlanLimits(plan) {
  const limits = {
    free:    { photos: 0,  leads: false, categories: 0, badge: false },
    pro:     { photos: 5,  leads: true,  categories: 1, badge: false },
    premium: { photos: 15, leads: true,  categories: 12, badge: true },
    elite:   { photos: 50, leads: true,  categories: 12, badge: true, video: true, priority: true },
    sponsor: { photos: 50, leads: true,  categories: 12, badge: true, video: true, priority: true, exclusive: true }
  };
  return limits[plan] || limits.free;
}
