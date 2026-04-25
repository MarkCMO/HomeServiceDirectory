// contact-form.js - Handle contact form submissions
// POST /api/contact-form { name, email, subject, message }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'POST only' }) };

  try {
    const data = JSON.parse(event.body || '{}');
    if (!data.name || !data.email || !data.message) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Name, email, and message required' }) };
    }

    if (process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
      const adminTo = (process.env.ADMIN_EMAIL || '').split(',').map(e => e.trim()).filter(Boolean);
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.FROM_EMAIL || 'HomeServiceDirectory <hello@homeservicedirectory.com>',
          to: adminTo,
          subject: `[Contact] ${data.subject || 'General'} - ${data.name}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:600px;">
            <h2>Contact Form Submission</h2>
            <p><strong>Name:</strong> ${data.name}</p>
            <p><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
            <p><strong>Subject:</strong> ${data.subject || 'General'}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
            <p>${data.message.replace(/\n/g, '<br>')}</p>
          </div>`
        })
      });
    }

    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ message: 'Message sent successfully.' }) };
  } catch (err) {
    console.error('contact-form error:', err);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Server error' }) };
  }
};

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
}
