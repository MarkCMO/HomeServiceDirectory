// rep-daily-queue.js - Generate or refresh rep's daily call queue
// POST /api/rep-daily-queue  - build today's queue (12pm EST refresh)
// GET  /api/rep-daily-queue  - get today's queue
//
// Queue logic: up to 50 POCs ordered by:
//   1. Hot priority
//   2. Overdue next_followup_at
//   3. Longest since last contact (or never contacted)
//   4. New stage (lowest position)

const { requireRep } = require('./_auth');
const { db }         = require('./_supabase');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
});

const QUEUE_MAX = 50;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  try {
    const auth = await requireRep(event);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };

    const repId = auth.session.user_id;
    const today = new Date().toISOString().slice(0, 10);

    // GET: return existing queue for today
    if (event.httpMethod === 'GET') {
      const { data: queue } = await db.daily_queues()
        .select('*, pocs(id, business_name, contact_name, phone, email, city, state, pipeline_stage, priority, next_followup_at, notes)')
        .eq('rep_id', repId)
        .eq('queue_date', today)
        .order('position', { ascending: true });

      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({
          date:      today,
          queue:     queue || [],
          total:     (queue || []).length,
          completed: (queue || []).filter(q => q.completed).length
        })
      };
    }

    // POST: build / rebuild today's queue
    if (event.httpMethod === 'POST') {
      // Clear existing queue for today
      await db.daily_queues()
        .delete()
        .eq('rep_id', repId)
        .eq('queue_date', today)
        .eq('completed', false);

      // Fetch active POCs (not won/lost)
      const { data: pocs } = await db.pocs()
        .select('id, priority, pipeline_stage, next_followup_at, updated_at')
        .eq('rep_id', repId)
        .not('pipeline_stage', 'in', '("won","lost")')
        .order('updated_at', { ascending: true }); // oldest first for baseline

      if (!pocs || !pocs.length) {
        return {
          statusCode: 200,
          headers: cors(),
          body: JSON.stringify({ message: 'No active POCs. Add prospects to your pipeline.', queue: [], total: 0 })
        };
      }

      // Score each POC for queue priority
      const now        = Date.now();
      const priorityScore = { hot: 0, high: 1, normal: 2, low: 3 };

      const scored = pocs.map(p => {
        const pScore = priorityScore[p.priority] ?? 2;
        const overdue = p.next_followup_at && new Date(p.next_followup_at).getTime() <= now ? -1000 : 0;
        const age = now - new Date(p.updated_at).getTime();  // older = higher score
        return { ...p, _score: pScore * 1000 + overdue + (age / 86400000) };
      });

      // Sort: lowest score = highest priority
      scored.sort((a, b) => a._score - b._score);

      // Take top QUEUE_MAX
      const selected = scored.slice(0, QUEUE_MAX);

      // Insert queue rows
      const rows = selected.map((p, i) => ({
        rep_id:     repId,
        poc_id:     p.id,
        queue_date: today,
        position:   i + 1
      }));

      const { error: insertErr } = await db.daily_queues().upsert(rows, { onConflict: 'rep_id,poc_id,queue_date' });
      if (insertErr) throw insertErr;

      // Fetch built queue with poc details
      const { data: built } = await db.daily_queues()
        .select('*, pocs(id, business_name, contact_name, phone, email, city, state, pipeline_stage, priority, next_followup_at)')
        .eq('rep_id', repId)
        .eq('queue_date', today)
        .order('position', { ascending: true });

      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({
          message:  `Queue built: ${built.length} POCs for ${today}`,
          date:     today,
          queue:    built,
          total:    built.length
        })
      };
    }

    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('rep-daily-queue error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
