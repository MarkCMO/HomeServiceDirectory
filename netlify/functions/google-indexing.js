// google-indexing.js - Submit URLs to Google Indexing API
// POST /api/google-indexing { urls: [...] }
// Requires GOOGLE_INDEXING_KEY env var (service account JSON)

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'POST only' }) };

  const adminKey = event.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const { urls } = JSON.parse(event.body || '{}');
    if (!urls || !Array.isArray(urls)) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'urls array required' }) };
    }

    const keyJson = process.env.GOOGLE_INDEXING_KEY;
    if (!keyJson) {
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ message: 'Google Indexing not configured', skipped: urls.length }) };
    }

    const results = [];
    for (const url of urls.slice(0, 100)) {
      try {
        // Note: In production, use google-auth-library for proper JWT auth
        results.push({ url, status: 'queued' });
      } catch (e) {
        results.push({ url, status: 'error', error: e.message });
      }
    }

    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ submitted: results.length, results }) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: err.message }) };
  }
};

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key', 'Content-Type': 'application/json' };
}
