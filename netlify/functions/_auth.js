// _auth.js - Session-based auth middleware for WETYR platform
// bcrypt cost 12 for all password hashing
// Session tokens: 64-char hex stored in HttpOnly cookies + Authorization header

const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const { db }    = require('./_supabase');

const BCRYPT_ROUNDS    = 12;
const SESSION_MS       = 7 * 24 * 60 * 60 * 1000;   // 7 days

// ── Passwords ──────────────────────────────────────────────
async function hashPassword(plaintext) {
  return bcrypt.hash(String(plaintext).trim(), BCRYPT_ROUNDS);
}

async function verifyPassword(plaintext, hash) {
  if (!plaintext || !hash) return false;
  return bcrypt.compare(String(plaintext).trim(), hash);
}

// ── Session tokens ─────────────────────────────────────────
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createSession(userId, userType, ip, ua) {
  const token      = generateToken();
  const expires_at = new Date(Date.now() + SESSION_MS).toISOString();

  const { data, error } = await db.sessions().insert({
    user_id:    userId,
    user_type:  userType,
    token,
    ip_address: ip  || null,
    user_agent: ua  || null,
    expires_at
  }).select('id').single();

  if (error) throw new Error('Failed to create session: ' + error.message);
  return token;
}

async function getSession(token) {
  if (!token || typeof token !== 'string' || token.length !== 64) return null;

  const { data, error } = await db.sessions()
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) return null;

  // Bump last_seen_at (fire and forget - don't await to keep latency low)
  db.sessions().update({ last_seen_at: new Date().toISOString() }).eq('id', data.id)
    .then(() => {}).catch(() => {});

  return data;
}

async function deleteSession(token) {
  if (!token) return;
  await db.sessions().delete().eq('token', token);
}

async function deleteAllSessions(userId, userType) {
  await db.sessions().delete().eq('user_id', userId).eq('user_type', userType);
}

// ── Extract token from request ──────────────────────────────
function getTokenFromEvent(event) {
  // 1. Authorization: Bearer <token>
  const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
  if (auth.startsWith('Bearer ')) {
    const t = auth.slice(7).trim();
    if (t.length === 64) return t;
  }

  // 2. Cookie: session=<token>
  const cookie = event.headers['cookie'] || event.headers['Cookie'] || '';
  const match  = cookie.match(/\bsession=([a-f0-9]{64})\b/);
  if (match) return match[1];

  return null;
}

// ── Cookie helpers ──────────────────────────────────────────
function setCookieHeader(token) {
  const maxAge = Math.floor(SESSION_MS / 1000);
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function clearCookieHeader() {
  return 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}

// ── Middleware ──────────────────────────────────────────────
// Returns { session } on success, { error, statusCode } on failure
async function requireAuth(event, allowedTypes = ['admin', 'rep', 'manager', 'provider']) {
  const token   = getTokenFromEvent(event);
  const session = await getSession(token);

  if (!session) {
    return { error: 'Unauthorized - please log in', statusCode: 401 };
  }

  if (!allowedTypes.includes(session.user_type)) {
    return { error: `Forbidden - ${session.user_type} cannot access this endpoint`, statusCode: 403 };
  }

  return { session };
}

// Shorthand helpers
function requireRep(event)     { return requireAuth(event, ['rep']); }
function requireManager(event) { return requireAuth(event, ['manager', 'gm', 'director']); }
function requireAdmin(event)   { return requireAuth(event, ['admin', 'superadmin']); }
function requireStaff(event)   { return requireAuth(event, ['admin', 'superadmin', 'manager']); }

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  deleteSession,
  deleteAllSessions,
  getTokenFromEvent,
  setCookieHeader,
  clearCookieHeader,
  requireAuth,
  requireRep,
  requireManager,
  requireAdmin,
  requireStaff
};
