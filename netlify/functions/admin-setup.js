// admin-setup.js - One-time admin account setup
// POST /api/admin-setup { setup_key, email, password, first_name, last_name }
// Protected by ADMIN_SETUP_KEY env var (delete or disable after use)
// Only creates admin if no admins exist yet

const { hashPassword }  = require('./_auth');
const { db }            = require('./_supabase');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };

  const setupKey = process.env.ADMIN_SETUP_KEY;
  if (!setupKey) {
    return { statusCode: 403, headers: cors(), body: JSON.stringify({ error: 'Setup not enabled. Set ADMIN_SETUP_KEY env var.' }) };
  }

  try {
    const data = JSON.parse(event.body || '{}');
    const { setup_key, email, password, first_name, last_name } = data;

    if (setup_key !== setupKey) {
      return { statusCode: 403, headers: cors(), body: JSON.stringify({ error: 'Invalid setup key' }) };
    }

    if (!email || !password || !first_name || !last_name) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'email, password, first_name, last_name required' }) };
    }
    if (String(password).length < 12) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Admin password must be at least 12 characters' }) };
    }

    // Check if any admin already exists
    const { count } = await db.admins().select('id', { count: 'exact', head: true });
    if (count > 0) {
      return { statusCode: 409, headers: cors(), body: JSON.stringify({ error: 'Admin already exists. Use admin panel to add more.' }) };
    }

    const password_hash = await hashPassword(password);

    // Get default tenant
    const { data: tenant } = await db.tenants()
      .select('id')
      .eq('slug', 'homeservicedirectory')
      .maybeSingle();

    const { data: admin, error: adminErr } = await db.admins().insert({
      tenant_id:  tenant?.id || null,
      email:      String(email).trim().toLowerCase(),
      password_hash,
      first_name: String(first_name).trim(),
      last_name:  String(last_name).trim(),
      role:       'superadmin'
    }).select('id, email, role').single();

    if (adminErr) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: adminErr.message }) };
    }

    return {
      statusCode: 201,
      headers: cors(),
      body: JSON.stringify({
        message: 'Admin account created successfully. Remove ADMIN_SETUP_KEY env var now.',
        admin: { id: admin.id, email: admin.email, role: admin.role }
      })
    };
  } catch (err) {
    console.error('admin-setup error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
