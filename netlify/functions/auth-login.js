// auth-login.js - Unified login for rep | manager | admin | provider
// POST /api/auth-login { email, password, role }
// Returns session cookie + user object

const { verifyPassword, createSession, setCookieHeader } = require('./_auth');
const { db } = require('./_supabase');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { email, password, role } = JSON.parse(event.body || '{}');

    if (!email || !password) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Email and password required' }) };
    }

    const normalEmail = String(email).trim().toLowerCase();
    const validRoles  = ['rep', 'manager', 'admin', 'provider'];
    const loginRole   = validRoles.includes(role) ? role : null;

    // Try each table based on role hint (or all if no hint)
    const attempts = loginRole
      ? [loginRole]
      : ['admin', 'manager', 'rep', 'provider'];

    let user     = null;
    let userType = null;

    for (const type of attempts) {
      const table = {
        admin:    db.admins,
        manager:  db.managers,
        rep:      db.sales_reps,
        provider: db.providers
      }[type];

      if (!table) continue;

      const { data } = await table()
        .select('id, email, password_hash, status, first_name, last_name')
        .eq('email', normalEmail)
        .maybeSingle();

      if (!data) continue;

      // Providers use 'name' not first_name/last_name
      if (type === 'provider') {
        const { data: prov } = await db.providers()
          .select('id, email, password_hash, status, name, plan, slug')
          .eq('email', normalEmail)
          .maybeSingle();
        if (!prov) continue;

        const ok = await verifyPassword(password, prov.password_hash);
        if (!ok) continue;
        if (prov.status === 'suspended') {
          return { statusCode: 403, headers: cors(), body: JSON.stringify({ error: 'Account suspended. Contact support.' }) };
        }
        user     = prov;
        userType = 'provider';
        break;
      }

      // Staff (admin, manager, rep)
      const ok = await verifyPassword(password, data.password_hash);
      if (!ok) continue;

      if (data.status && data.status !== 'active') {
        return {
          statusCode: 403,
          headers: cors(),
          body: JSON.stringify({ error: `Account is ${data.status}. Contact your administrator.` })
        };
      }

      user     = data;
      userType = type;
      break;
    }

    if (!user || !userType) {
      // Constant-time delay to prevent timing attacks
      await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
      return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Invalid email or password' }) };
    }

    const ip    = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || event.headers['client-ip'] || '';
    const ua    = event.headers['user-agent'] || '';
    const token = await createSession(user.id, userType, ip, ua);

    const safe  = {
      id:         user.id,
      email:      user.email,
      role:       userType,
      name:       user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      plan:       user.plan || null,
      slug:       user.slug || null,
      commission_tier: user.commission_tier || null,
      manager_id: user.manager_id || null
    };

    return {
      statusCode: 200,
      headers: {
        ...cors(),
        'Set-Cookie': setCookieHeader(token)
      },
      body: JSON.stringify({
        message: 'Login successful',
        token,
        user: safe
      })
    };
  } catch (err) {
    console.error('auth-login error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
