// admin-platform.js - Platform-wide admin stats and health
// GET /api/admin-platform?view=dashboard|health|leaderboard|mrr

const { requireAdmin }  = require('./_auth');
const { db }            = require('./_supabase');
const { processVesting } = require('./_commission');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  try {
    const auth = await requireAdmin(event);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };

    const view = (event.queryStringParameters || {}).view || 'dashboard';

    if (view === 'health') {
      // System health check
      const [zombieSessions, pendingCommissions, failedEmails] = await Promise.all([
        db.v_health_zombies().select('id', { count: 'exact', head: true }),
        db.commissions().select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        db.email_sends().select('id', { count: 'exact', head: true }).eq('status', 'failed')
      ]);

      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({
          health: {
            zombie_sessions:    zombieSessions.count  || 0,
            pending_commissions: pendingCommissions.count || 0,
            failed_emails:      failedEmails.count    || 0,
            status:             zombieSessions.count > 100 ? 'warn' : 'ok',
            checked_at:         new Date().toISOString()
          }
        })
      };
    }

    if (view === 'leaderboard') {
      const { data: leaderboard } = await db.v_rep_leaderboard().select('*').limit(50);
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ leaderboard: leaderboard || [] }) };
    }

    if (view === 'mrr') {
      // Platform-wide MRR breakdown
      const { data: subs } = await db.subscriptions()
        .select('plan, monthly_amount, status')
        .eq('status', 'active');

      const byPlan = {};
      let totalMrr = 0;
      (subs || []).forEach(s => {
        byPlan[s.plan] = (byPlan[s.plan] || { count: 0, mrr: 0 });
        byPlan[s.plan].count++;
        byPlan[s.plan].mrr += s.monthly_amount;
        totalMrr += s.monthly_amount;
      });

      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({
          total_mrr_dollars: (totalMrr / 100).toFixed(2),
          total_subscribers: (subs || []).length,
          by_plan: byPlan
        })
      };
    }

    if (view === 'vesting' && event.httpMethod === 'POST') {
      const result = await processVesting();
      return { statusCode: 200, headers: cors(), body: JSON.stringify(result) };
    }

    // Default: dashboard overview
    const [
      providersResult,
      repsResult,
      managersResult,
      subsResult,
      leadsResult,
      commResult
    ] = await Promise.all([
      db.providers().select('plan, status', { count: 'exact' }),
      db.sales_reps().select('status', { count: 'exact' }),
      db.managers().select('id', { count: 'exact', head: true }),
      db.subscriptions().select('status, monthly_amount'),
      db.leads().select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 30*86400000).toISOString()),
      db.commissions().select('commission_amount, status')
    ]);

    // Provider counts by plan
    const provByPlan = {};
    (providersResult.data || []).forEach(p => { provByPlan[p.plan] = (provByPlan[p.plan] || 0) + 1; });

    // Rep counts by status
    const repByStatus = {};
    (repsResult.data || []).forEach(r => { repByStatus[r.status] = (repByStatus[r.status] || 0) + 1; });

    // MRR
    let totalMrr = 0;
    (subsResult.data || []).forEach(s => { if (s.status === 'active') totalMrr += s.monthly_amount; });

    // Commission owed
    let commissionOwed = 0;
    (commResult.data || []).forEach(c => { if (['vesting','earned'].includes(c.status)) commissionOwed += c.commission_amount; });

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        providers: {
          total:    providersResult.count || 0,
          by_plan:  provByPlan
        },
        reps: {
          total:    repsResult.count || 0,
          by_status: repByStatus
        },
        managers:   managersResult.count || 0,
        revenue: {
          mrr_dollars:             (totalMrr / 100).toFixed(2),
          commission_owed_dollars: (commissionOwed / 100).toFixed(2),
          net_mrr_dollars:         ((totalMrr - commissionOwed) / 100).toFixed(2)
        },
        leads_30d:  leadsResult.count || 0,
        generated_at: new Date().toISOString()
      })
    };
  } catch (err) {
    console.error('admin-platform error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
