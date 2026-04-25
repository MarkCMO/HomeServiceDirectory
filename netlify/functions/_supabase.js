// _supabase.js - Supabase client singleton for WETYR platform
// Uses SUPABASE_SERVICE_KEY which bypasses RLS (backend only)
// Never expose this key to the browser

const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getSupabase() {
  if (_client) return _client;

  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY env vars must be set');
  }

  _client = createClient(url, key, {
    auth:   { persistSession: false },
    global: { headers: { 'x-application-name': 'wetyr-hsd' } }
  });

  return _client;
}

// Typed table accessors — all use the 'wetyr' schema
const db = {
  providers:           () => getSupabase().schema('wetyr').from('providers'),
  leads:               () => getSupabase().schema('wetyr').from('leads'),
  admins:              () => getSupabase().schema('wetyr').from('admins'),
  managers:            () => getSupabase().schema('wetyr').from('managers'),
  sales_reps:          () => getSupabase().schema('wetyr').from('sales_reps'),
  sessions:            () => getSupabase().schema('wetyr').from('sessions'),
  subscriptions:       () => getSupabase().schema('wetyr').from('subscriptions'),
  subscription_events: () => getSupabase().schema('wetyr').from('subscription_events'),
  commissions:         () => getSupabase().schema('wetyr').from('commissions'),
  manager_overrides:   () => getSupabase().schema('wetyr').from('manager_overrides'),
  pocs:                () => getSupabase().schema('wetyr').from('pocs'),
  poc_calls:           () => getSupabase().schema('wetyr').from('poc_calls'),
  daily_queues:        () => getSupabase().schema('wetyr').from('daily_queues'),
  legal_docs:          () => getSupabase().schema('wetyr').from('legal_docs'),
  rep_legal_docs:      () => getSupabase().schema('wetyr').from('rep_legal_docs'),
  pdf_packets:         () => getSupabase().schema('wetyr').from('pdf_packets'),
  email_sends:         () => getSupabase().schema('wetyr').from('email_sends'),
  drip_campaigns:      () => getSupabase().schema('wetyr').from('drip_campaigns'),
  drip_enrollments:    () => getSupabase().schema('wetyr').from('drip_enrollments'),
  email_bounces:       () => getSupabase().schema('wetyr').from('email_bounces'),
  email_unsubscribes:  () => getSupabase().schema('wetyr').from('email_unsubscribes'),
  reviews:             () => getSupabase().schema('wetyr').from('reviews'),
  photos:              () => getSupabase().schema('wetyr').from('photos'),
  tenants:             () => getSupabase().schema('wetyr').from('tenants'),
  health_log:          () => getSupabase().schema('wetyr').from('health_log'),
  // Views
  v_rep_mrr:           () => getSupabase().schema('wetyr').from('v_rep_mrr'),
  v_manager_team_mrr:  () => getSupabase().schema('wetyr').from('v_manager_team_mrr'),
  v_rep_leaderboard:   () => getSupabase().schema('wetyr').from('v_rep_leaderboard'),
  v_health_zombies:    () => getSupabase().schema('wetyr').from('v_system_health_zombies'),
};

// Raw SQL via RPC (for complex queries)
async function rpc(fn, params = {}) {
  const { data, error } = await getSupabase().rpc(fn, params);
  if (error) throw error;
  return data;
}

module.exports = { getSupabase, db, rpc };
