// rep-dashboard.js - Sales rep dashboard data
// GET /api/rep-dashboard
// Returns: stats, today's queue, pipeline summary, recent commissions, MRR

const { requireRep } = require('./_auth');
const { db }         = require('./_supabase');

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
    const today  = new Date().toISOString().slice(0, 10);

    // Run all queries in parallel
    const [
      repResult,
      mrrResult,
      todayQueueResult,
      pipelineResult,
      commissionsResult,
      pocCountResult
    ] = await Promise.all([
      // Rep profile
      db.sales_reps()
        .select('id, first_name, last_name, email, commission_tier, status, onboarded_at, docs_signed_at, referral_code')
        .eq('id', repId)
        .single(),

      // MRR view
      db.v_rep_mrr()
        .select('*')
        .eq('rep_id', repId)
        .maybeSingle(),

      // Today's queue
      db.daily_queues()
        .select('*, pocs(id, business_name, contact_name, phone, email, city, state, pipeline_stage, priority, next_followup_at)')
        .eq('rep_id', repId)
        .eq('queue_date', today)
        .order('position', { ascending: true })
        .limit(50),

      // Pipeline stage counts
      db.pocs()
        .select('pipeline_stage')
        .eq('rep_id', repId)
        .neq('pipeline_stage', 'won')
        .neq('pipeline_stage', 'lost'),

      // Recent commissions
      db.commissions()
        .select('id, gross_amount, commission_pct, commission_amount, status, vesting_date, created_at')
        .eq('rep_id', repId)
        .order('created_at', { ascending: false })
        .limit(10),

      // Total POC count
      db.pocs()
        .select('id', { count: 'exact', head: true })
        .eq('rep_id', repId)
    ]);

    const rep         = repResult.data;
    const mrr         = mrrResult.data;
    const queue       = todayQueueResult.data || [];
    const allPocs     = pipelineResult.data  || [];
    const commissions = commissionsResult.data || [];

    // Build pipeline stage summary
    const pipelineStages = ['new', 'contacted', 'interested', 'demo', 'proposal'];
    const pipeline = {};
    pipelineStages.forEach(s => { pipeline[s] = 0; });
    allPocs.forEach(p => {
      if (pipeline[p.pipeline_stage] !== undefined) pipeline[p.pipeline_stage]++;
    });

    // Commission totals
    const commissionStats = {
      pending:    0,
      vesting:    0,
      earned:     0,
      paid:       0,
      total_cents: 0
    };
    commissions.forEach(c => {
      if (commissionStats[c.status] !== undefined) commissionStats[c.status] += c.commission_amount;
      commissionStats.total_cents += c.commission_amount;
    });

    // Queue progress
    const completed  = queue.filter(q => q.completed).length;
    const remaining  = queue.filter(q => !q.completed).length;

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        rep: {
          id:              rep.id,
          name:            `${rep.first_name} ${rep.last_name}`,
          email:           rep.email,
          commission_tier: rep.commission_tier,
          commission_pct:  rep.commission_tier === 'elite' ? 50 : rep.commission_tier === 'senior' ? 40 : 30,
          status:          rep.status,
          referral_code:   rep.referral_code,
          onboarded:       !!rep.onboarded_at,
          docs_signed:     !!rep.docs_signed_at
        },
        mrr: {
          active_clients:   mrr?.subscription_count  || 0,
          mrr_dollars:      mrr?.total_mrr_dollars   || 0,
          mrr_cents:        mrr?.total_mrr_cents      || 0
        },
        queue: {
          date:       today,
          total:      queue.length,
          completed,
          remaining,
          items:      queue.map(q => ({
            queue_id:  q.id,
            poc:       q.pocs,
            position:  q.position,
            completed: q.completed
          }))
        },
        pipeline,
        commissions: {
          recent: commissions,
          stats:  commissionStats,
          total_poc_count: pocCountResult.count || 0
        }
      })
    };
  } catch (err) {
    console.error('rep-dashboard error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
