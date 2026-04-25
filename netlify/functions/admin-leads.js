// admin-leads.js - Admin lead management
// GET /api/admin-leads?status=&category=&limit=&offset=
// Auth: admin session or X-Admin-Key header

const { requireAdmin } = require('./_auth');
const { db }           = require('./_supabase');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  // Auth: admin key or session
  const adminKey  = (event.headers['x-admin-key'] || '').trim();
  let authorized  = adminKey && adminKey === process.env.ADMIN_KEY;
  if (!authorized) {
    try {
      const auth = await requireAdmin(event);
      authorized = !auth.error;
    } catch (e) {}
  }
  if (!authorized) return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Unauthorized' }) };

  const params = event.queryStringParameters || {};

  // ── GET: list leads ─────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const limit    = Math.min(parseInt(params.limit)  || 100, 500);
      const offset   = parseInt(params.offset) || 0;

      let query = db.leads()
        .select(`
          id, category, contact_name, email, phone, city, state, status,
          message, created_at,
          provider_id,
          providers:provider_id ( name )
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (params.status)   query = query.eq('status', params.status);
      if (params.category) query = query.eq('category', params.category);
      if (params.provider_id) query = query.eq('provider_id', params.provider_id);

      const { data: leads, error, count } = await query;
      if (error) throw error;

      // Flatten provider name
      const rows = (leads || []).map(l => ({
        ...l,
        provider_name: l.providers?.name || null,
        providers: undefined
      }));

      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({ leads: rows, total: count || rows.length, offset, limit })
      };
    } catch (err) {
      console.error('admin-leads GET error:', err);
      return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── PATCH: update lead status ────────────────────────────────────────
  if (event.httpMethod === 'PATCH') {
    try {
      const body     = JSON.parse(event.body || '{}');
      const leadId   = body.lead_id;
      const status   = body.status;
      if (!leadId)  return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'lead_id required' }) };

      const updates = {};
      if (status) updates.status = status;
      if (body.notes !== undefined) updates.notes = body.notes;

      const { data, error } = await db.leads().update(updates).eq('id', leadId).select().single();
      if (error) throw error;
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ lead: data }) };
    } catch (err) {
      console.error('admin-leads PATCH error:', err);
      return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };
};
