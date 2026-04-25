// admin-managers.js - Admin: manage managers/GMs
// GET  /api/admin-managers           - list all managers
// POST /api/admin-managers           - create manager
// PATCH /api/admin-managers          - update manager (override_pct, role, status)

const { requireAdmin, hashPassword } = require('./_auth');
const { db }                         = require('./_supabase');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  try {
    const auth = await requireAdmin(event);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };

    const params = event.queryStringParameters || {};

    if (event.httpMethod === 'GET') {
      const limit  = Math.min(parseInt(params.limit || '100'), 500);
      const offset = parseInt(params.offset || '0');

      const { data: managers, count, error } = await db.managers()
        .select('id, email, first_name, last_name, role, override_pct, status, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Enrich with team size + team MRR
      const enriched = await Promise.all((managers || []).map(async (m) => {
        const [teamResult, mrrResult] = await Promise.all([
          db.sales_reps().select('id', { count: 'exact', head: true }).eq('manager_id', m.id).eq('status', 'active'),
          db.v_manager_team_mrr().select('team_mrr_dollars').eq('manager_id', m.id).maybeSingle()
        ]);
        return { ...m, active_reps: teamResult.count || 0, team_mrr_dollars: mrrResult.data?.team_mrr_dollars || 0 };
      }));

      return { statusCode: 200, headers: cors(), body: JSON.stringify({ managers: enriched, total: count || 0 }) };
    }

    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      const { email, password, first_name, last_name, phone, role, override_pct } = data;

      if (!email || !password || !first_name || !last_name) {
        return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'email, password, first_name, last_name required' }) };
      }

      const password_hash = await hashPassword(password);
      const pct = Math.min(Math.max(parseFloat(override_pct || 5), 5), 12);

      const { data: mgr, error: mgrErr } = await db.managers().insert({
        email:        String(email).trim().toLowerCase(),
        password_hash,
        first_name:   String(first_name).trim(),
        last_name:    String(last_name).trim(),
        phone:        phone || null,
        role:         ['manager','gm','director'].includes(role) ? role : 'manager',
        override_pct: pct,
        status:       'active'
      }).select().single();

      if (mgrErr) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: mgrErr.message }) };
      return { statusCode: 201, headers: cors(), body: JSON.stringify({ message: 'Manager created', manager: mgr }) };
    }

    if (event.httpMethod === 'PATCH') {
      const data = JSON.parse(event.body || '{}');
      const { manager_id, status, role, override_pct } = data;

      if (!manager_id) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'manager_id required' }) };

      const updates = {};
      if (status      && ['active','suspended'].includes(status))                         updates.status      = status;
      if (role        && ['manager','gm','director'].includes(role))                      updates.role        = role;
      if (override_pct !== undefined) {
        const pct = Math.min(Math.max(parseFloat(override_pct), 5), 12);
        updates.override_pct = pct;
      }

      if (!Object.keys(updates).length) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Nothing to update' }) };

      const { data: updated, error: updateErr } = await db.managers().update(updates).eq('id', manager_id).select().single();
      if (updateErr) throw updateErr;

      return { statusCode: 200, headers: cors(), body: JSON.stringify({ message: 'Manager updated', manager: updated }) };
    }

    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('admin-managers error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
