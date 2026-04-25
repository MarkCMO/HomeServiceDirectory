// auth-session.js - Verify current session & return user info
// GET /api/auth-session
// Used by frontend to restore auth state on page load

const { requireAuth } = require('./_auth');
const { db }          = require('./_supabase');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  try {
    const auth = await requireAuth(event, ['admin', 'manager', 'rep', 'provider', 'superadmin']);
    if (auth.error) {
      return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };
    }

    const { session } = auth;
    let profile = null;

    // Fetch fresh profile
    if (session.user_type === 'rep') {
      const { data } = await db.sales_reps()
        .select('id, email, first_name, last_name, commission_tier, status, manager_id, onboarded_at, docs_signed_at')
        .eq('id', session.user_id)
        .single();
      profile = data;
    } else if (session.user_type === 'manager') {
      const { data } = await db.managers()
        .select('id, email, first_name, last_name, role, override_pct, status')
        .eq('id', session.user_id)
        .single();
      profile = data;
    } else if (session.user_type === 'admin') {
      const { data } = await db.admins()
        .select('id, email, first_name, last_name, role')
        .eq('id', session.user_id)
        .single();
      profile = data;
    } else if (session.user_type === 'provider') {
      const { data } = await db.providers()
        .select('id, email, name, slug, plan, status, city, state')
        .eq('id', session.user_id)
        .single();
      profile = data;
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        authenticated: true,
        user_type:     session.user_type,
        session_id:    session.id,
        profile:       profile || {}
      })
    };
  } catch (err) {
    console.error('auth-session error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
