// rep-poc-update.js - Update POC stage, notes, next followup, priority
// PATCH /api/rep-poc-update { poc_id, ...fields }

const { requireRep } = require('./_auth');
const { db }         = require('./_supabase');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'PATCH, POST, OPTIONS',
  'Content-Type': 'application/json'
});

const VALID_STAGES = ['new', 'contacted', 'interested', 'demo', 'proposal', 'won', 'lost'];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (!['PATCH','POST'].includes(event.httpMethod)) return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const auth = await requireRep(event);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };

    const repId  = auth.session.user_id;
    const data   = JSON.parse(event.body || '{}');
    const pocId  = data.poc_id;

    if (!pocId) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'poc_id required' }) };

    // Verify ownership
    const { data: existing, error: fetchErr } = await db.pocs()
      .select('id, rep_id, pipeline_stage')
      .eq('id', pocId)
      .single();

    if (fetchErr || !existing) return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: 'POC not found' }) };
    if (existing.rep_id !== repId) return { statusCode: 403, headers: cors(), body: JSON.stringify({ error: 'Not your POC' }) };

    const updates = {};

    if (data.pipeline_stage !== undefined) {
      if (!VALID_STAGES.includes(data.pipeline_stage)) {
        return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Invalid stage. Valid: ' + VALID_STAGES.join(', ') }) };
      }
      updates.pipeline_stage = data.pipeline_stage;
      if (data.pipeline_stage === 'won')  updates.won_at   = new Date().toISOString();
      if (data.pipeline_stage === 'lost') {
        updates.lost_at = new Date().toISOString();
        if (data.lost_reason) updates.lost_reason = String(data.lost_reason).slice(0, 200);
      }
    }

    if (data.priority !== undefined && ['low','normal','high','hot'].includes(data.priority)) {
      updates.priority = data.priority;
    }
    if (data.notes           !== undefined) updates.notes           = String(data.notes).slice(0, 2000);
    if (data.contact_name    !== undefined) updates.contact_name    = String(data.contact_name).slice(0, 100);
    if (data.email           !== undefined) updates.email           = String(data.email).toLowerCase().slice(0, 200);
    if (data.phone           !== undefined) updates.phone           = String(data.phone).slice(0, 30);
    if (data.next_followup_at !== undefined) updates.next_followup_at = data.next_followup_at || null;

    if (!Object.keys(updates).length) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'No valid fields to update' }) };
    }

    const { data: updated, error: updateErr } = await db.pocs()
      .update(updates)
      .eq('id', pocId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({ message: 'POC updated', poc: updated })
    };
  } catch (err) {
    console.error('rep-poc-update error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
