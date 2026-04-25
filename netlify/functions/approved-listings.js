// approved-listings.js - Return provider listings filtered by category, state, city
// GET /api/approved-listings?category=plumbing&state=florida&city=miami&limit=24&offset=0
// Reads from Supabase (primary) with Netlify Blobs fallback

const PLAN_ORDER = { sponsor: 0, elite: 1, premium: 2, pro: 3, free: 4 };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };

  const params   = event.queryStringParameters || {};
  const category = params.category || '';
  const state    = (params.state || '').toLowerCase().replace(/\s+/g, '-');
  const city     = (params.city  || '').toLowerCase().replace(/\s+/g, '-');
  const limit    = Math.min(parseInt(params.limit)  || 24, 100);
  const offset   = parseInt(params.offset) || 0;
  const sort     = params.sort    || 'featured';
  const is24x7   = params.emergency === 'true';

  try {
    // ── PRIMARY: Supabase ────────────────────────────────────────────
    try {
      const { db } = require('./_supabase');

      let query = db.providers()
        .select('id, slug, name, email, phone, website, city, state, state_slug, city_slug, categories, service_types, license_number, is_24x7, description, plan, status, rating, review_count, view_count, years_in_business, is_24x7')
        .eq('status', 'active');

      if (category) query = query.contains('categories', [category]);
      if (state)    query = query.eq('state_slug', state);
      if (city)     query = query.eq('city_slug', city);
      if (is24x7)   query = query.eq('is_24x7', true);

      // Sort by plan tier first
      if (sort === 'rating') {
        query = query.order('rating', { ascending: false });
      } else if (sort === 'reviews') {
        query = query.order('review_count', { ascending: false });
      } else if (sort === 'name') {
        query = query.order('name', { ascending: true });
      } else {
        // Featured: raw fetch, sort in JS by plan order + rating
        query = query.order('rating', { ascending: false });
      }

      // Fetch enough to paginate after plan sort
      const { data: all, count, error } = await query
        .range(sort === 'featured' ? 0 : offset, sort === 'featured' ? 499 : offset + limit - 1);

      if (error) throw error;

      let listings = (all || []).map(normalizeSupabase);

      if (sort === 'featured') {
        listings.sort((a, b) =>
          (PLAN_ORDER[a.plan] ?? 4) - (PLAN_ORDER[b.plan] ?? 4) ||
          (b.rating - a.rating)
        );
      }

      const total     = listings.length;
      const paginated = listings.slice(offset, offset + limit);

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ listings: paginated, total, limit, offset, hasMore: (offset + limit) < total, source: 'supabase' })
      };
    } catch (dbErr) {
      console.log('Supabase query failed, falling back to Blobs:', dbErr.message);
    }

    // ── FALLBACK: Netlify Blobs index ────────────────────────────────
    const { getStore } = require('./blobs');
    const indexStore   = getStore('provider-index');

    let indexKey;
    if (category && state)  indexKey = 'catstate:' + category + ':' + state;
    else if (category)      indexKey = 'cat:' + category;
    else if (state)         indexKey = 'state:' + state;
    else                    indexKey = 'all';

    let listings = await indexStore.get(indexKey, { type: 'json' }).catch(() => null);
    if (!listings) listings = [];

    // City fuzzy match
    if (city) {
      const nycSlugs = ['new-york-city','manhattan','brooklyn','queens','bronx','staten-island','long-island-city'];
      const isNYC    = nycSlugs.includes(city);
      listings = listings.filter(l => {
        if (l.citySlug === city) return true;
        if (isNYC && nycSlugs.includes(l.citySlug)) return true;
        if (l.citySlug && (l.citySlug.includes(city) || city.includes(l.citySlug))) return true;
        return false;
      });
    }

    if (is24x7) listings = listings.filter(l => l.is24x7 || l.is_24x7);

    if (sort === 'featured') {
      listings.sort((a, b) =>
        (PLAN_ORDER[a.plan] ?? 4) - (PLAN_ORDER[b.plan] ?? 4) ||
        ((b.rating || 0) - (a.rating || 0))
      );
    } else if (sort === 'rating')   listings.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else if (sort === 'name')       listings.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sort === 'reviews')    listings.sort((a, b) => (b.reviewCount || b.review_count || 0) - (a.reviewCount || a.review_count || 0));

    const total     = listings.length;
    const paginated = listings.slice(offset, offset + limit);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ listings: paginated, total, limit, offset, hasMore: (offset + limit) < total, source: 'blobs' })
    };
  } catch (err) {
    console.error('approved-listings error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Server error', message: err.message })
    };
  }
};

// Normalize Supabase snake_case to camelCase for backward compat
function normalizeSupabase(p) {
  return {
    id:              p.id,
    slug:            p.slug,
    name:            p.name,
    email:           p.email,
    phone:           p.phone,
    website:         p.website,
    city:            p.city,
    state:           p.state,
    citySlug:        p.city_slug,
    stateSlug:       p.state_slug,
    categories:      p.categories   || [],
    serviceTypes:    p.service_types || [],
    licenseNumber:   p.license_number,
    is24x7:          p.is_24x7,
    description:     p.description,
    plan:            p.plan         || 'free',
    status:          p.status,
    rating:          p.rating       || 0,
    reviewCount:     p.review_count || 0,
    viewCount:       p.view_count   || 0,
    yearsInBusiness: p.years_in_business
  };
}

function corsHeaders() {
  return {
    'Content-Type':                  'application/json',
    'Access-Control-Allow-Origin':   '*',
    'Access-Control-Allow-Headers':  'Content-Type',
    'Cache-Control':                 'public, max-age=60'
  };
}
