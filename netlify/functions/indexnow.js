// indexnow.js - Submit URLs to IndexNow API (Bing, Yandex, etc.)
// POST /api/indexnow { urls: [...] }

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

    const indexNowKey = process.env.INDEXNOW_KEY;
    if (!indexNowKey) {
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ message: 'IndexNow key not configured', skipped: urls.length }) };
    }

    const siteUrl = process.env.SITE_URL || 'https://homeservicedirectory.com';
    const host = new URL(siteUrl).hostname;

    const res = await fetch('https://api.indexnow.org/IndexNow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host,
        key: indexNowKey,
        keyLocation: siteUrl + '/' + indexNowKey + '.txt',
        urlList: urls.slice(0, 10000)
      })
    });

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ submitted: urls.length, indexNowStatus: res.status })
    };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: err.message }) };
  }
};

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key', 'Content-Type': 'application/json' };
}
