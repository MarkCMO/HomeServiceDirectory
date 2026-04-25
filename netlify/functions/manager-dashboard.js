// manager-dashboard.js - Manager / GM dashboard
// GET /api/manager-dashboard
// Returns: team stats, override earnings, rep leaderboard, pipeline summary

const { requireManager } = require('./_auth');
const { db }             = require('./_supabase');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  try {
    const auth = await requireManager(event);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };

    const managerId = auth.session.user_id;

    const [
      managerResult,
      teamMrrResult,
      repsResult,
      overridesResult,
      leaderboardResult
    ] = await Promise.all([
      // Manager profile
      db.managers()
        .select('id, first_name, last_name, email, role, override_pct, status')
        .eq('id', managerId)
        .single(),

      // Team MRR view
      db.v_manager_team_mrr()
        .select('*')
        .eq('manager_id', managerId)
        .maybeSingle(),

      // Team reps
      db.sales_reps()
        .select('id, first_name, last_name, email, commission_tier, status, onboarded_at, docs_signed_at')
        .eq('manager_id', managerId)
        .order('created_at', { ascending: false }),

      // Override earnings
      db.manager_overrides()
        .select('override_amount, status')
        .eq('manager_id', managerId),

      // Full leaderboard (all active reps on this tenant, with manager filter)
      db.v_rep_leaderboard()
        .select('*')
        .eq('manager_id', managerId)  // Note: view may not have manager_id - adjusted per schema
        .limit(20)
    ]);

    const manager  = managerResult.data;
    const teamMrr  = teamMrrResult.data;
    const reps     = repsResult.data  || [];
    const overrides = overridesResult.data || [];

    // Override totals
    const overrideTotals = { pending: 0, earned: 0, paid: 0 };
    overrides.forEach(o => {
      if (overrideTotals[o.status] !== undefined) overrideTotals[o.status] += o.override_amount;
    });

    // Rep summary by status
    const repCounts = { pending: 0, active: 0, suspended: 0, terminated: 0 };
    reps.forEach(r => { if (repCounts[r.status] !== undefined) repCounts[r.status]++; });

    // Fetch recent won POCs from all team reps
    const repIds = reps.map(r => r.id);
    let recentWins = [];
    if (repIds.length) {
      const { data: wins } = await db.pocs()
        .select('business_name, city, state, won_at, rep_id')
        .in('rep_id', repIds)
        .eq('pipeline_stage', 'won')
        .order('won_at', { ascending: false })
        .limit(10);
      recentWins = wins || [];
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        manager: {
          id:           manager.id,
          name:         `${manager.first_name} ${manager.last_name}`,
          email:        manager.email,
          role:         manager.role,
          override_pct: manager.override_pct
        },
        team: {
          total_reps:         reps.length,
          rep_counts:         repCounts,
          team_mrr_dollars:   teamMrr?.team_mrr_dollars || 0,
          team_mrr_cents:     teamMrr?.team_mrr_cents   || 0,
          rep_count_active:   repCounts.active
        },
        override_earnings: {
          pct:             manager.override_pct,
          pending_cents:   overrideTotals.pending,
          earned_cents:    overrideTotals.earned,
          paid_cents:      overrideTotals.paid,
          total_earned_dollars: ((overrideTotals.earned + overrideTotals.paid) / 100).toFixed(2),
          estimated_monthly: teamMrr
            ? ((teamMrr.team_mrr_cents || 0) * (manager.override_pct / 100) / 100).toFixed(2)
            : '0.00'
        },
        reps: reps.map(r => ({
          id:              r.id,
          name:            `${r.first_name} ${r.last_name}`,
          email:           r.email,
          commission_tier: r.commission_tier,
          status:          r.status,
          onboarded:       !!r.onboarded_at,
          docs_signed:     !!r.docs_signed_at
        })),
        recent_wins:  recentWins,
        leaderboard:  leaderboardResult.data || []
      })
    };
  } catch (err) {
    console.error('manager-dashboard error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
