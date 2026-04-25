// rep-commissions.js - Rep views their commission history and earnings
// GET /api/rep-commissions?status=earned&limit=50

const { requireRep } = require('./_auth');
const { db }         = require('./_supabase');
const { TIER_PCT }   = require('./_commission');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  try {
    const auth = await requireRep(event);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };

    const repId  = auth.session.user_id;
    const params = event.queryStringParameters || {};
    const status = params.status;
    const limit  = Math.min(parseInt(params.limit || '50'), 200);
    const offset = parseInt(params.offset || '0');

    // Get rep tier info
    const { data: rep } = await db.sales_reps()
      .select('commission_tier, first_name, last_name')
      .eq('id', repId)
      .single();

    let query = db.commissions()
      .select('*, subscriptions(plan, monthly_amount, providers(name, city, state))', { count: 'exact' })
      .eq('rep_id', repId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data: commissions, count, error } = await query;
    if (error) throw error;

    // Aggregate totals by status
    const { data: all } = await db.commissions()
      .select('commission_amount, status')
      .eq('rep_id', repId);

    const totals = { pending: 0, vesting: 0, earned: 0, paid: 0, clawed_back: 0 };
    (all || []).forEach(c => {
      if (totals[c.status] !== undefined) totals[c.status] += c.commission_amount;
    });

    // Next tier threshold
    const { data: mrr } = await db.v_rep_mrr()
      .select('subscription_count, total_mrr_dollars')
      .eq('rep_id', repId)
      .maybeSingle();

    const tierThresholds = { standard: { next: 'senior', at_clients: 10 }, senior: { next: 'elite', at_clients: 25 }, elite: { next: null } };
    const tierInfo       = tierThresholds[rep?.commission_tier || 'standard'];

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        rep: {
          name:            `${rep?.first_name} ${rep?.last_name}`,
          commission_tier: rep?.commission_tier || 'standard',
          commission_pct:  TIER_PCT[rep?.commission_tier || 'standard'],
          active_clients:  mrr?.subscription_count  || 0,
          monthly_mrr:     mrr?.total_mrr_dollars   || 0
        },
        tier_progress: tierInfo,
        totals: {
          pending_cents:     totals.pending,
          vesting_cents:     totals.vesting,
          earned_cents:      totals.earned,
          paid_cents:        totals.paid,
          clawed_back_cents: totals.clawed_back,
          total_earned_dollars: ((totals.earned + totals.paid) / 100).toFixed(2)
        },
        commissions: (commissions || []).map(c => ({
          id:              c.id,
          provider_name:   c.subscriptions?.providers?.name,
          provider_city:   `${c.subscriptions?.providers?.city}, ${c.subscriptions?.providers?.state}`,
          plan:            c.subscriptions?.plan,
          gross_amount:    c.gross_amount,
          commission_pct:  c.commission_pct,
          commission_amount: c.commission_amount,
          commission_dollars: (c.commission_amount / 100).toFixed(2),
          status:          c.status,
          vesting_date:    c.vesting_date,
          clawback_deadline: c.clawback_deadline,
          paid_at:         c.paid_at,
          created_at:      c.created_at
        })),
        total: count || 0,
        limit,
        offset
      })
    };
  } catch (err) {
    console.error('rep-commissions error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
