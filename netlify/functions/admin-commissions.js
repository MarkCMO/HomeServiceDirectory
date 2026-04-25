// admin-commissions.js - Admin: view and manage all commissions
// GET  /api/admin-commissions?status=earned&rep_id=...
// PATCH /api/admin-commissions { commission_id, action: 'mark_paid' | 'clawback' }

const { requireAdmin }  = require('./_auth');
const { db }            = require('./_supabase');
const { processVesting } = require('./_commission');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, PATCH, POST, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  try {
    const auth = await requireAdmin(event);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };

    const params = event.queryStringParameters || {};

    if (event.httpMethod === 'GET') {
      if (params.action === 'process_vesting') {
        const result = await processVesting();
        return { statusCode: 200, headers: cors(), body: JSON.stringify(result) };
      }

      if (params.action === 'summary') {
        // Platform-wide commission summary
        const { data: all } = await db.commissions().select('commission_amount, status');
        const totals = { pending: 0, vesting: 0, earned: 0, paid: 0, clawed_back: 0 };
        (all || []).forEach(c => { if (totals[c.status] !== undefined) totals[c.status] += c.commission_amount; });

        const { data: overrides } = await db.manager_overrides().select('override_amount, status');
        const overrideTotals = { pending: 0, earned: 0, paid: 0 };
        (overrides || []).forEach(o => { if (overrideTotals[o.status] !== undefined) overrideTotals[o.status] += o.override_amount; });

        return {
          statusCode: 200,
          headers: cors(),
          body: JSON.stringify({
            commissions:       totals,
            manager_overrides: overrideTotals,
            total_owed_dollars: (((totals.earned + totals.vesting) + (overrideTotals.earned)) / 100).toFixed(2)
          })
        };
      }

      // List commissions
      const limit  = Math.min(parseInt(params.limit  || '100'), 500);
      const offset = parseInt(params.offset || '0');

      let query = db.commissions()
        .select(`
          id, gross_amount, commission_tier, commission_pct, commission_amount,
          status, vesting_date, clawback_deadline, paid_at, created_at,
          sales_reps(id, first_name, last_name, email),
          subscriptions(plan, providers(name, city, state))
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (params.status)  query = query.eq('status', params.status);
      if (params.rep_id)  query = query.eq('rep_id', params.rep_id);

      const { data: commissions, count, error } = await query;
      if (error) throw error;

      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({
          commissions: commissions || [],
          total: count || 0,
          limit,
          offset
        })
      };
    }

    // PATCH: mark paid or clawback
    if (event.httpMethod === 'PATCH' || event.httpMethod === 'POST') {
      const data   = JSON.parse(event.body || '{}');
      const { commission_id, action, payout_method, clawback_reason, override_id } = data;

      // Handle manager override update
      if (override_id) {
        if (action === 'mark_paid') {
          const { data: updated, error } = await db.manager_overrides()
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', override_id)
            .select().single();
          if (error) throw error;
          return { statusCode: 200, headers: cors(), body: JSON.stringify({ message: 'Override marked paid', override: updated }) };
        }
      }

      if (!commission_id) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'commission_id required' }) };

      if (action === 'mark_paid') {
        const { data: updated, error } = await db.commissions()
          .update({
            status:         'paid',
            paid_at:        new Date().toISOString(),
            payout_method:  payout_method || 'ach'
          })
          .eq('id', commission_id)
          .in('status', ['earned'])
          .select().single();

        if (error || !updated) {
          return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Commission not found or not in earned status' }) };
        }
        return { statusCode: 200, headers: cors(), body: JSON.stringify({ message: 'Commission marked paid', commission: updated }) };
      }

      if (action === 'clawback') {
        const { data: updated, error } = await db.commissions()
          .update({
            status:          'clawed_back',
            clawed_back_at:  new Date().toISOString(),
            clawback_reason: clawback_reason || 'Admin manual clawback'
          })
          .eq('id', commission_id)
          .in('status', ['pending','vesting','earned'])
          .select().single();

        if (error || !updated) {
          return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Commission not found or already paid/clawed back' }) };
        }
        return { statusCode: 200, headers: cors(), body: JSON.stringify({ message: 'Commission clawed back', commission: updated }) };
      }

      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'action must be mark_paid or clawback' }) };
    }

    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('admin-commissions error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
