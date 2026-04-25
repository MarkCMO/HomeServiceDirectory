// rep-poc-submit.js - Rep submits a new POC (Point of Contact / CRM prospect)
// POST /api/rep-poc-submit
// Adds to rep's pipeline at 'new' stage

const { requireRep } = require('./_auth');
const { db }         = require('./_supabase');
const { getTenant }  = require('./_tenant');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const auth = await requireRep(event);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };

    const tenant = await getTenant(event);
    const repId  = auth.session.user_id;
    const data   = JSON.parse(event.body || '{}');

    const { business_name, contact_name, email, phone, website, city, state, categories, source, notes, priority, next_followup_at, google_maps_url, google_place_id } = data;

    if (!business_name) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'business_name is required' }) };
    }

    // Check for duplicate (same business + rep)
    if (phone || email) {
      const { data: existing } = await db.pocs()
        .select('id, business_name, pipeline_stage')
        .eq('rep_id', repId)
        .or(phone ? `phone.eq.${phone}` : '', email ? `email.eq.${email}` : '')
        .maybeSingle();

      if (existing) {
        return {
          statusCode: 409,
          headers: cors(),
          body: JSON.stringify({
            error:    'This POC already exists in your pipeline',
            existing: { id: existing.id, name: existing.business_name, stage: existing.pipeline_stage }
          })
        };
      }
    }

    const { data: poc, error: pocErr } = await db.pocs().insert({
      tenant_id:       tenant?.id || null,
      rep_id:          repId,
      business_name:   String(business_name).trim().slice(0, 200),
      contact_name:    contact_name   ? String(contact_name).trim().slice(0, 100)  : null,
      email:           email          ? String(email).trim().toLowerCase().slice(0, 200) : null,
      phone:           phone          ? String(phone).trim().slice(0, 30)           : null,
      website:         website        ? String(website).trim().slice(0, 500)        : null,
      city:            city           ? String(city).trim().slice(0, 100)           : null,
      state:           state          ? String(state).trim().slice(0, 50)           : null,
      categories:      Array.isArray(categories) ? categories.slice(0, 12)          : [],
      source:          source         ? String(source).slice(0, 50)                 : 'manual',
      pipeline_stage:  'new',
      priority:        ['low','normal','high','hot'].includes(priority) ? priority : 'normal',
      notes:           notes          ? String(notes).trim().slice(0, 2000)         : null,
      next_followup_at: next_followup_at || null,
      google_maps_url: google_maps_url || null,
      google_place_id: google_place_id || null
    }).select().single();

    if (pocErr) {
      console.error('poc insert error:', pocErr);
      return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Failed to add POC: ' + pocErr.message }) };
    }

    return {
      statusCode: 201,
      headers: cors(),
      body: JSON.stringify({
        message: 'POC added to your pipeline',
        poc_id:  poc.id,
        poc
      })
    };
  } catch (err) {
    console.error('rep-poc-submit error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
