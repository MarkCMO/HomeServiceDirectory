// rep-poc-list.js - List rep's POCs with filtering
// GET /api/rep-poc-list?stage=contacted&priority=hot&limit=50&offset=0

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
    const params = event.queryStringParameters || {};
    const stage  = params.stage;
    const priority = params.priority;
    const limit  = Math.min(parseInt(params.limit  || '50'), 200);
    const offset = parseInt(params.offset || '0');
    const search = params.q;

    let query = db.pocs()
      .select('*', { count: 'exact' })
      .eq('rep_id', repId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (stage)    query = query.eq('pipeline_stage', stage);
    if (priority) query = query.eq('priority', priority);
    if (search)   query = query.ilike('business_name', `%${search}%`);

    const { data: pocs, count, error } = await query;
    if (error) throw error;

    // Get call count per POC
    const pocIds = (pocs || []).map(p => p.id);
    let callCounts = {};
    if (pocIds.length) {
      const { data: calls } = await db.poc_calls()
        .select('poc_id')
        .in('poc_id', pocIds);
      (calls || []).forEach(c => {
        callCounts[c.poc_id] = (callCounts[c.poc_id] || 0) + 1;
      });
    }

    const enriched = (pocs || []).map(p => ({
      ...p,
      call_count: callCounts[p.id] || 0
    }));

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        pocs:   enriched,
        total:  count || 0,
        limit,
        offset
      })
    };
  } catch (err) {
    console.error('rep-poc-list error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
