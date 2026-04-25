// email-send.js - Single choke-point for all outbound emails
// POST /api/email-send (internal use only - requires INTERNAL_KEY header)
// All other functions should call sendEmail() helper, not Resend directly
//
// Features:
// - Unsubscribe check before sending
// - Bounce suppression
// - RFC 8058 List-Unsubscribe header
// - Audit log to wetyr.email_sends
// - Resend API with retry

const { db } = require('./_supabase');

const INTERNAL_KEY = process.env.INTERNAL_EMAIL_KEY || process.env.ADMIN_SECRET_KEY || 'dev-only-key';

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-internal-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
});

// Exported helper for internal use by other functions
async function sendEmail({ to, subject, html, from, template, campaign_id, tenant_id, reply_to }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[email-send] RESEND_API_KEY not set, skipping email to:', to);
    return { skipped: true, reason: 'RESEND_API_KEY not set' };
  }

  const recipient = String(to).trim().toLowerCase();

  // 1. Check unsubscribe list
  const { data: unsub } = await db.email_unsubscribes()
    .select('id')
    .eq('email', recipient)
    .maybeSingle();
  if (unsub) return { skipped: true, reason: 'unsubscribed' };

  // 2. Check hard bounce
  const { data: bounce } = await db.email_bounces()
    .select('bounce_type')
    .eq('email', recipient)
    .eq('bounce_type', 'hard')
    .maybeSingle();
  if (bounce) return { skipped: true, reason: 'hard_bounce' };

  // 3. Build unsubscribe URL
  const siteUrl    = process.env.SITE_URL || 'https://homeservicedirectory.com';
  const unsubToken = Buffer.from(recipient).toString('base64url');
  const unsubUrl   = `${siteUrl}/api/email-unsubscribe?token=${unsubToken}`;

  // 4. Send via Resend
  let resendId = null;
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        from:         from || process.env.FROM_EMAIL || 'HomeServiceDirectory <hello@homeservicedirectory.com>',
        to:           recipient,
        subject,
        html,
        reply_to:     reply_to || undefined,
        headers: {
          'List-Unsubscribe':       `<${unsubUrl}>, <mailto:unsubscribe@homeservicedirectory.com?subject=unsubscribe>`,
          'List-Unsubscribe-Post':  'List-Unsubscribe=One-Click'
        }
      })
    });

    const result = await resp.json();
    resendId = result.id || null;
    if (!resp.ok) throw new Error(result.message || 'Resend API error');
  } catch (err) {
    console.error('[email-send] Resend error:', err.message);
    await logEmail({ tenant_id, recipient, template, subject, resendId: null, status: 'failed', campaign_id });
    return { sent: false, error: err.message };
  }

  // 5. Audit log
  await logEmail({ tenant_id, recipient, template, subject, resendId, status: 'sent', campaign_id });

  return { sent: true, resend_id: resendId };
}

async function logEmail({ tenant_id, recipient, template, subject, resendId, status, campaign_id }) {
  try {
    await db.email_sends().insert({
      tenant_id:       tenant_id || null,
      recipient_email: recipient,
      template:        template  || null,
      subject:         subject   || null,
      resend_id:       resendId  || null,
      status,
      campaign_id:     campaign_id || null
    });
  } catch (e) { console.log('[email-send] audit log failed:', e.message); }
}

// HTTP handler (for internal function-to-function calls)
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };

  // Internal auth
  const key = event.headers['x-internal-key'] || event.headers['X-Internal-Key'] || '';
  if (key !== INTERNAL_KEY) {
    return { statusCode: 403, headers: cors(), body: JSON.stringify({ error: 'Forbidden' }) };
  }

  try {
    const body   = JSON.parse(event.body || '{}');
    const result = await sendEmail(body);
    return { statusCode: 200, headers: cors(), body: JSON.stringify(result) };
  } catch (err) {
    console.error('email-send error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};

// Export for use by other functions
exports.sendEmail = sendEmail;
