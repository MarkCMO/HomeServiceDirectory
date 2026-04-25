// email-collect.js - Newsletter email subscription
// POST /api/email-collect { email }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'POST only' }) };

  try {
    const { email } = JSON.parse(event.body || '{}');
    if (!email || !email.includes('@')) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Valid email required' }) };
    }

    const { getStore } = require('./blobs');
    const store = getStore('email-subscribers');
    const key = email.trim().toLowerCase().replace(/[^a-z0-9@._-]/g, '');

    await store.setJSON(key, {
      email: email.trim().toLowerCase(),
      subscribedAt: new Date().toISOString(),
      source: 'website'
    });

    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ message: 'Subscribed successfully.' }) };
  } catch (err) {
    console.error('email-collect error:', err);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Server error' }) };
  }
};

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
}
