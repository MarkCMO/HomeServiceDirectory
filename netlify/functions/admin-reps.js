// admin-reps.js - Admin: manage sales reps
// GET  /api/admin-reps              - list all reps
// GET  /api/admin-reps?id=<rep_id>  - get single rep details
// PATCH /api/admin-reps             - update rep (status, tier, manager assignment)
// DELETE /api/admin-reps?id=<id>   - terminate rep

const { requireAdmin } = require('./_auth');
const { db }           = require('./_supabase');
const { hashPassword } = require('./_auth');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, PATCH, POST, DELETE, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  try {
    const auth = await requireAdmin(event);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };

    const params = event.queryStringParameters || {};

    // GET - list or single
    if (event.httpMethod === 'GET') {
      if (params.id) {
        // Single rep with full details
        const { data: rep, error } = await db.sales_reps()
          .select('*, managers(id, first_name, last_name, email)')
          .eq('id', params.id)
          .single();
        if (error || !rep) return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: 'Rep not found' }) };

        // Get rep's POC counts and commission totals
        const [pocCountResult, commResult, mrrResult] = await Promise.all([
          db.pocs().select('id, pipeline_stage', { count: 'exact' }).eq('rep_id', params.id),
          db.commissions().select('commission_amount, status').eq('rep_id', params.id),
          db.v_rep_mrr().select('*').eq('rep_id', params.id).maybeSingle()
        ]);

        const commTotals = {};
        (commResult.data || []).forEach(c => { commTotals[c.status] = (commTotals[c.status] || 0) + c.commission_amount; });

        return {
          statusCode: 200,
          headers: cors(),
          body: JSON.stringify({
            rep,
            poc_count:    pocCountResult.count || 0,
            commission_totals: commTotals,
            mrr:          mrrResult.data || null
          })
        };
      }

      // List all reps
      const limit  = Math.min(parseInt(params.limit  || '100'), 500);
      const offset = parseInt(params.offset || '0');
      const status = params.status;

      let query = db.sales_reps()
        .select('id, email, first_name, last_name, commission_tier, status, created_at, onboarded_at, manager_id', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);

      const { data: reps, count, error } = await query;
      if (error) throw error;

      return { statusCode: 200, headers: cors(), body: JSON.stringify({ reps: reps || [], total: count || 0, limit, offset }) };
    }

    // POST - create rep (admin-created)
    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      const { email, password, first_name, last_name, phone, commission_tier, manager_id } = data;

      if (!email || !password || !first_name || !last_name) {
        return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'email, password, first_name, last_name required' }) };
      }

      const password_hash = await hashPassword(password);
      const referral_code = `REP-${first_name.toUpperCase().slice(0,3)}${Math.random().toString(36).slice(2,6).toUpperCase()}`;

      const { data: rep, error: repErr } = await db.sales_reps().insert({
        email:           String(email).trim().toLowerCase(),
        password_hash,
        first_name:      String(first_name).trim(),
        last_name:       String(last_name).trim(),
        phone:           phone || null,
        commission_tier: ['standard','senior','elite'].includes(commission_tier) ? commission_tier : 'standard',
        manager_id:      manager_id || null,
        status:          'active',
        onboarded_at:    new Date().toISOString(),
        docs_signed_at:  new Date().toISOString(),
        referral_code
      }).select().single();

      if (repErr) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: repErr.message }) };
      return { statusCode: 201, headers: cors(), body: JSON.stringify({ message: 'Rep created', rep }) };
    }

    // PATCH - update rep
    if (event.httpMethod === 'PATCH') {
      const data = JSON.parse(event.body || '{}');
      const { rep_id, status, commission_tier, manager_id } = data;

      if (!rep_id) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'rep_id required' }) };

      const updates = {};
      if (status          && ['active','pending','suspended','terminated'].includes(status))           updates.status          = status;
      if (commission_tier && ['standard','senior','elite'].includes(commission_tier))                  updates.commission_tier = commission_tier;
      if (manager_id      !== undefined)                                                               updates.manager_id      = manager_id || null;

      if (!Object.keys(updates).length) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Nothing to update' }) };

      const { data: updated, error: updateErr } = await db.sales_reps().update(updates).eq('id', rep_id).select().single();
      if (updateErr) throw updateErr;

      return { statusCode: 200, headers: cors(), body: JSON.stringify({ message: 'Rep updated', rep: updated }) };
    }

    // DELETE - terminate
    if (event.httpMethod === 'DELETE') {
      const repId = params.id;
      if (!repId) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'id required' }) };

      await db.sales_reps().update({ status: 'terminated' }).eq('id', repId);
      // Delete sessions
      await db.sessions().delete().eq('user_id', repId).eq('user_type', 'rep');

      return { statusCode: 200, headers: cors(), body: JSON.stringify({ message: 'Rep terminated' }) };
    }

    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('admin-reps error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
