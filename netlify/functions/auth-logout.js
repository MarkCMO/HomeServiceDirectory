// auth-logout.js - Destroy session cookie
// POST /api/auth-logout

const { getTokenFromEvent, deleteSession, clearCookieHeader } = require('./_auth');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  try {
    const token = getTokenFromEvent(event);
    if (token) await deleteSession(token);

    return {
      statusCode: 200,
      headers: { ...cors(), 'Set-Cookie': clearCookieHeader() },
      body: JSON.stringify({ message: 'Logged out successfully' })
    };
  } catch (err) {
    console.error('auth-logout error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
