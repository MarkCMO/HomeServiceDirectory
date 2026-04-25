// admin-listings.js - List all provider listings (admin)
// GET /api/admin-listings?plan=pro&status=active&limit=100&q=search
// Auth: X-Admin-Key header OR session-based auth (for new WETYR admin portal)
// Reads from Supabase (primary) → Blobs fallback

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'GET')     return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };

  // Auth: accept either X-Admin-Key (legacy) or session token (WETYR)
  const adminKey = (event.headers['x-admin-key'] || '').trim();
  let authorized = adminKey && adminKey === process.env.ADMIN_KEY;

  if (!authorized) {
    try {
      const { requireAdmin } = require('./_auth');
      const auth = await requireAdmin(event);
      authorized = !auth.error;
    } catch (e) { /* Supabase not configured yet */ }
  }

  if (!authorized) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const params  = event.queryStringParameters || {};
  const limit   = Math.min(parseInt(params.limit || '100'), 500);
  const offset  = parseInt(params.offset || '0');
  const plan    = params.plan;
  const status  = params.status;
  const search  = params.q;

  try {
    // ── Supabase ────────────────────────────────────────────────────
    try {
      const { db } = require('./_supabase');

      let query = db.providers()
        .select('id, slug, name, email, city, state, plan, status, categories, rating, review_count, view_count, license_number, is_24x7, created_at, submitted_at, assigned_rep_id', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (plan)   query = query.eq('plan', plan);
      if (status) query = query.eq('status', status);
      if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,city.ilike.%${search}%`);

      const { data: listings, count, error } = await query;
      if (error) throw error;

      // Summary stats
      const { data: stats } = await db.providers()
        .select('plan')
        .eq('status', 'active');
      const byPlan = {};
      (stats || []).forEach(p => { byPlan[p.plan] = (byPlan[p.plan] || 0) + 1; });

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          total:    count || 0,
          listings: listings || [],
          by_plan:  byPlan,
          source:   'supabase',
          limit,
          offset
        })
      };
    } catch (dbErr) {
      console.log('Supabase failed, falling back to Blobs:', dbErr.message);
    }

    // ── Blobs fallback ───────────────────────────────────────────────
    const { getStore } = require('./blobs');
    const store = getStore('provider-listings');
    const { blobs } = await store.list();

    const listings = [];
    for (const blob of (blobs || [])) {
      try {
        const data = await store.get(blob.key, { type: 'json' });
        if (data) {
          if (plan   && data.plan   !== plan)   continue;
          if (status && data.status !== status) continue;
          if (search && !data.name?.toLowerCase().includes(search.toLowerCase()) &&
                        !data.email?.toLowerCase().includes(search.toLowerCase())) continue;
          listings.push({
            slug:       blob.key,
            name:       data.name       || '',
            city:       data.city       || '',
            state:      data.state      || '',
            plan:       data.plan       || 'free',
            status:     data.status     || 'pending',
            email:      data.email      || '',
            categories: data.categories || [],
            rating:     data.rating     || 0,
            created_at: data.createdAt  || null
          });
        }
      } catch (e) {}
    }

    listings.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const paginated = listings.slice(offset, offset + limit);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ total: listings.length, listings: paginated, source: 'blobs', limit, offset })
    };
  } catch (err) {
    console.error('admin-listings error:', err);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Server error' }) };
  }
};

function corsHeaders() {
  return {
    'Content-Type':                  'application/json',
    'Access-Control-Allow-Origin':   '*',
    'Access-Control-Allow-Headers':  'Content-Type, X-Admin-Key, Authorization',
    'Cache-Control':                 'private, no-cache'
  };
}
