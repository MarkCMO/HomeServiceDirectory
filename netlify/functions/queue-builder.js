// queue-builder.js - Netlify Scheduled Function
// Runs daily at 5pm UTC (12pm EST): builds daily call queues for all active reps
// Schedule: "0 17 * * *" (in netlify.toml)

const { db } = require('./_supabase');

const QUEUE_MAX = 50;

exports.handler = async (event) => {
  console.log('[queue-builder] Building daily queues at', new Date().toISOString());
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Get all active reps
    const { data: reps, error: repsErr } = await db.sales_reps()
      .select('id')
      .eq('status', 'active');

    if (repsErr) throw repsErr;
    if (!reps?.length) {
      console.log('[queue-builder] No active reps, skipping');
      return { statusCode: 200 };
    }

    const now              = Date.now();
    const priorityScore    = { hot: 0, high: 1, normal: 2, low: 3 };
    let built              = 0;

    for (const rep of reps) {
      try {
        // Clear incomplete queue items for today
        await db.daily_queues()
          .delete()
          .eq('rep_id', rep.id)
          .eq('queue_date', today)
          .eq('completed', false);

        // Get active POCs for this rep
        const { data: pocs } = await db.pocs()
          .select('id, priority, pipeline_stage, next_followup_at, updated_at')
          .eq('rep_id', rep.id)
          .not('pipeline_stage', 'in', '("won","lost")')
          .order('updated_at', { ascending: true });

        if (!pocs?.length) continue;

        // Score and sort
        const scored = pocs.map(p => {
          const pScore = priorityScore[p.priority] ?? 2;
          const overdue = p.next_followup_at && new Date(p.next_followup_at).getTime() <= now ? -1000 : 0;
          const age = now - new Date(p.updated_at).getTime();
          return { id: p.id, _score: pScore * 1000 + overdue + (age / 86400000) };
        });
        scored.sort((a, b) => a._score - b._score);

        const selected = scored.slice(0, QUEUE_MAX);
        if (!selected.length) continue;

        const rows = selected.map((p, i) => ({
          rep_id:     rep.id,
          poc_id:     p.id,
          queue_date: today,
          position:   i + 1
        }));

        await db.daily_queues().upsert(rows, { onConflict: 'rep_id,poc_id,queue_date' });
        built++;
      } catch (repErr) {
        console.error(`[queue-builder] Error for rep ${rep.id}:`, repErr.message);
      }
    }

    console.log(`[queue-builder] Built queues for ${built}/${reps.length} reps`);
    return { statusCode: 200 };
  } catch (err) {
    console.error('[queue-builder] Fatal error:', err.message);
    return { statusCode: 500 };
  }
};
