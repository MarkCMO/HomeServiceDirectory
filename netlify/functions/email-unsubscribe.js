// email-unsubscribe.js - RFC 8058 one-click unsubscribe + link unsubscribe
// GET  /api/email-unsubscribe?token=<base64url-email>   - link click
// POST /api/email-unsubscribe                            - RFC 8058 one-click (List-Unsubscribe-Post)
// Both record to wetyr.email_unsubscribes

const { db } = require('./_supabase');

exports.handler = async (event) => {
  try {
    let email  = null;
    let method = 'link';

    if (event.httpMethod === 'GET') {
      const token = (event.queryStringParameters || {}).token;
      if (!token) return { statusCode: 400, body: 'Missing token' };
      try { email = Buffer.from(token, 'base64url').toString('utf8').trim().toLowerCase(); }
      catch (e) { return { statusCode: 400, body: 'Invalid token' }; }
      method = 'link';
    } else if (event.httpMethod === 'POST') {
      // RFC 8058: body is "List-Unsubscribe=One-Click"
      const body = event.body || '';
      const match = body.match(/List-Unsubscribe=One-Click/i);
      if (!match) {
        // Try JSON body with email
        try {
          const data = JSON.parse(body);
          email = String(data.email || '').trim().toLowerCase();
        } catch (e) { return { statusCode: 400, body: 'Invalid request' }; }
      }

      // For RFC 8058, extract email from query param
      if (!email) {
        const token = (event.queryStringParameters || {}).token;
        if (token) {
          try { email = Buffer.from(token, 'base64url').toString('utf8').trim().toLowerCase(); }
          catch (e) {}
        }
      }
      method = 'rfc8058';
    }

    if (!email || !email.includes('@')) {
      return { statusCode: 400, body: 'Invalid email' };
    }

    // Upsert to unsubscribes (ignore duplicate)
    await db.email_unsubscribes().upsert(
      { email, method },
      { onConflict: 'email' }
    );

    // Also cancel any active drip enrollments
    await db.drip_enrollments()
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('recipient_email', email)
      .is('unsubscribed_at', null);

    if (event.httpMethod === 'GET') {
      // Show friendly confirmation page
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Unsubscribed</title>
          <style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:20px;text-align:center;}
          h1{color:#1a1f36;}p{color:#6b7280;}a{color:#DC3545;}</style></head>
          <body><h1>You've been unsubscribed</h1>
          <p>You will no longer receive emails at <strong>${email}</strong>.</p>
          <p>This may take up to 24 hours to take effect.</p>
          <p><a href="/">HomeServiceDirectory</a></p></body></html>`
      };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unsubscribed: true, email }) };
  } catch (err) {
    console.error('email-unsubscribe error:', err);
    return { statusCode: 500, body: 'Server error' };
  }
};
