// rep-call-log.js - Log a call against a POC
// POST /api/rep-call-log { poc_id, outcome, duration_seconds, notes, next_action, next_action_at, call_type }

const { requireRep } = require('./_auth');
const { db }         = require('./_supabase');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
});

const VALID_OUTCOMES = ['answered', 'voicemail', 'no-answer', 'callback-scheduled', 'not-interested', 'converted'];
const AUTO_STAGE_ADVANCE = {
  answered:   'contacted',
  converted:  'won'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const auth = await requireRep(event);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };

    const repId = auth.session.user_id;
    const data  = JSON.parse(event.body || '{}');
    const { poc_id, outcome, duration_seconds, notes, next_action, next_action_at, call_type } = data;

    if (!poc_id || !outcome) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'poc_id and outcome are required' }) };
    }
    if (!VALID_OUTCOMES.includes(outcome)) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Invalid outcome. Valid: ' + VALID_OUTCOMES.join(', ') }) };
    }

    // Verify ownership
    const { data: poc } = await db.pocs()
      .select('id, rep_id, pipeline_stage')
      .eq('id', poc_id)
      .single();

    if (!poc || poc.rep_id !== repId) {
      return { statusCode: 403, headers: cors(), body: JSON.stringify({ error: 'POC not found or not yours' }) };
    }

    // Insert call log
    const { data: call, error: callErr } = await db.poc_calls().insert({
      poc_id,
      rep_id:            repId,
      call_type:         call_type || 'outbound',
      duration_seconds:  duration_seconds ? parseInt(duration_seconds) : null,
      outcome,
      notes:             notes       ? String(notes).slice(0, 2000)       : null,
      next_action:       next_action ? String(next_action).slice(0, 500)  : null,
      next_action_at:    next_action_at || null
    }).select().single();

    if (callErr) throw callErr;

    // Auto-advance pipeline stage based on outcome
    const autoStage = AUTO_STAGE_ADVANCE[outcome];
    const stageUpdates = {};
    if (autoStage && poc.pipeline_stage === 'new' && outcome === 'answered') {
      stageUpdates.pipeline_stage = autoStage;
    }
    if (outcome === 'converted') {
      stageUpdates.pipeline_stage = 'won';
      stageUpdates.won_at = new Date().toISOString();
    }
    if (next_action_at) {
      stageUpdates.next_followup_at = next_action_at;
    }
    if (Object.keys(stageUpdates).length) {
      await db.pocs().update(stageUpdates).eq('id', poc_id);
    }

    // Mark queue item as completed if queue_id provided
    if (data.queue_id) {
      await db.daily_queues()
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', data.queue_id)
        .eq('rep_id', repId);
    }

    return {
      statusCode: 201,
      headers: cors(),
      body: JSON.stringify({
        message:       'Call logged',
        call_id:       call.id,
        stage_updated: Object.keys(stageUpdates).length > 0 ? stageUpdates : null
      })
    };
  } catch (err) {
    console.error('rep-call-log error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
