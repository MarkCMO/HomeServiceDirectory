// provider-lookup.js - Email + password login for provider dashboard
// POST /api/provider-lookup { email, password }
// Returns: { slug, token, provider } on success
// Tries Supabase first (bcrypt), falls back to Blobs (SHA-256)

const { verifyPassword, createSession, setCookieHeader } = require('./_auth');
const { db }   = require('./_supabase');
const { getTenant } = require('./_tenant');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'POST only' }) };

  try {
    const { email, password } = JSON.parse(event.body || '{}');
    if (!email || !password) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Email and password required' }) };
    }

    const emailKey = email.trim().toLowerCase();
    const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || '';
    const ua = event.headers['user-agent'] || '';

    // ── Try Supabase first ───────────────────────────────────────────
    try {
      const { data: provider } = await db.providers()
        .select('id, slug, name, email, password_hash, plan, status, city, state, access_token')
        .eq('email', emailKey)
        .eq('status', 'active')
        .maybeSingle();

      if (provider && provider.password_hash) {
        const valid = await verifyPassword(password, provider.password_hash);
        if (!valid) {
          return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Incorrect password' }) };
        }

        // Create session
        const token = await createSession(provider.id, 'provider', ip, ua);
        const setCookie = setCookieHeader(token);

        return {
          statusCode: 200,
          headers: { ...cors(), 'Set-Cookie': setCookie },
          body: JSON.stringify({
            success: true,
            token,
            slug:    provider.slug,
            provider: {
              id:    provider.id,
              name:  provider.name,
              email: provider.email,
              plan:  provider.plan,
              city:  provider.city,
              state: provider.state
            }
          })
        };
      }
    } catch (supabaseErr) {
      console.warn('provider-lookup Supabase error, falling back to Blobs:', supabaseErr.message);
    }

    // ── Fall back to Blobs (legacy SHA-256) ─────────────────────────
    const crypto = require('crypto');
    const { getStore } = require('./blobs');
    const indexStore   = getStore('provider-index');
    const emailIndex   = await indexStore.get('email-index', { type: 'json' }).catch(() => ({}));
    const entries      = emailIndex[emailKey];

    if (!entries || !entries.length) {
      return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: 'No listing found for this email' }) };
    }

    const hash  = crypto.createHash('sha256').update(String(password).trim()).digest('hex');
    const match = entries.find(e => e.passwordHash === hash);
    if (!match) {
      return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Incorrect password' }) };
    }

    const listingStore = getStore('provider-listings');
    const listing      = await listingStore.get(match.slug, { type: 'json' }).catch(() => null);
    if (!listing) {
      return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: 'Listing data not found' }) };
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        success:     true,
        token:       listing.accessToken || match.accessToken || '',
        slug:        match.slug,
        provider: {
          name:  listing.name,
          email: listing.email,
          plan:  listing.plan || 'free',
          city:  listing.city,
          state: listing.state
        }
      })
    };
  } catch (err) {
    console.error('provider-lookup error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error: ' + err.message }) };
  }
};
