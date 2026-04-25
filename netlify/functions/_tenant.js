// _tenant.js - Multi-tenant resolution for WETYR Umbrella architecture
// Resolves tenant from the Host header. One codebase, many domains.
// Cache: 5-minute in-process (warmed per lambda instance)

const { db } = require('./_supabase');

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = {};

async function getTenant(event) {
  const raw  = event.headers['host']
             || event.headers['x-forwarded-host']
             || event.headers['Host']
             || '';
  const host = raw.toLowerCase().split(':')[0];

  // Cache hit
  if (cache[host] && cache[host].ts > Date.now() - CACHE_TTL_MS) {
    return cache[host].tenant;
  }

  const { data, error } = await db.tenants()
    .select('*')
    .eq('domain', host)
    .eq('status', 'active')
    .single();

  if (error || !data) {
    // Fall through: return a default tenant object so the function still works
    // during local dev (netlify dev) or unknown preview domains
    const fallback = {
      id:            null,
      slug:          'homeservicedirectory',
      domain:        host,
      name:          'HomeServiceDirectory',
      email_from:    process.env.FROM_EMAIL || 'HomeServiceDirectory <hello@homeservicedirectory.com>',
      category_slugs: [],
      pricing:       {},
      branding:      {}
    };
    cache[host] = { tenant: fallback, ts: Date.now() };
    return fallback;
  }

  cache[host] = { tenant: data, ts: Date.now() };
  return data;
}

// Invalidate cache for a domain (call after tenant update)
function invalidateTenant(domain) {
  delete cache[domain.toLowerCase()];
}

module.exports = { getTenant, invalidateTenant };
