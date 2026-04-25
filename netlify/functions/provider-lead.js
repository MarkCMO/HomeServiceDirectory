// provider-lead.js - Handle lead/inquiry submissions from homeowners to providers
// POST /api/provider-lead { slug, name, email, phone, serviceType, message }
//
// Lead routing by plan:
//   FREE:    Lead stored but NOT sent to provider. Sent to ADMIN with "NOT PAID" label.
//   PRO+:    Lead sent directly to provider and stored.
//
// Reads provider from Supabase (primary) → Blobs fallback
// Writes lead to Supabase (primary) → Blobs fallback

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const data = JSON.parse(event.body || '{}');
    if (!data.slug || !data.email || !data.name) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'slug, name, and email required' }) };
    }

    const leadId   = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const lead     = {
      id:           leadId,
      provider_slug: data.slug,
      name:         String(data.name).trim().slice(0, 100),
      email:        String(data.email).trim().toLowerCase().slice(0, 200),
      phone:        String(data.phone || '').trim().slice(0, 30),
      service_type: String(data.serviceType || '').slice(0, 50),
      urgency:      String(data.urgency || 'standard').slice(0, 20),
      message:      String(data.message || '').trim().slice(0, 1000),
      status:       'new',
      forwarded:    false
    };

    let provider   = null;
    let providerId = null;

    // ── Load provider: Supabase → Blobs ────────────────────────────
    try {
      const { db } = require('./_supabase');
      const { data: prov } = await db.providers()
        .select('id, slug, name, email, city, state, plan, is_24x7')
        .eq('slug', data.slug)
        .single();
      if (prov) {
        provider   = prov;
        providerId = prov.id;
        lead.provider_id = prov.id;
      }
    } catch (dbErr) { console.log('Supabase provider lookup failed:', dbErr.message); }

    if (!provider) {
      try {
        const { getStore } = require('./blobs');
        const listingStore  = getStore('provider-listings');
        provider = await listingStore.get(data.slug, { type: 'json' }).catch(() => null);
      } catch (blobErr) { console.log('Blobs provider lookup failed:', blobErr.message); }
    }

    // ── Save lead: Supabase → Blobs ─────────────────────────────────
    try {
      const { db } = require('./_supabase');
      const { getTenant } = require('./_tenant');
      const tenant = await getTenant(event).catch(() => null);
      await db.leads().insert({
        tenant_id:     tenant?.id || null,
        provider_id:   providerId || null,
        provider_slug: data.slug,
        name:          lead.name,
        email:         lead.email,
        phone:         lead.phone,
        service_type:  lead.service_type,
        urgency:       lead.urgency,
        message:       lead.message,
        status:        'new',
        forwarded:     false
      });
    } catch (dbErr) {
      console.log('Supabase lead save failed, using Blobs:', dbErr.message);
      try {
        const { getStore } = require('./blobs');
        const leadStore     = getStore('provider-leads');
        await leadStore.setJSON(data.slug + '_' + leadId, { ...lead, createdAt: new Date().toISOString() });
      } catch (blobErr) { console.log('Blobs lead save also failed:', blobErr.message); }
    }

    const plan     = provider ? (provider.plan || 'free') : 'free';
    const isPaid   = ['pro','premium','elite','sponsor'].includes(plan);
    const serviceLabel = data.serviceType
      ? data.serviceType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : 'home service';

    const leadDetailsHtml = `
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#5A6B7D;width:120px;">Name</td><td style="padding:8px 0;font-weight:600;">${lead.name}</td></tr>
        <tr><td style="padding:8px 0;color:#5A6B7D;">Email</td><td style="padding:8px 0;"><a href="mailto:${lead.email}">${lead.email}</a></td></tr>
        ${lead.phone ? `<tr><td style="padding:8px 0;color:#5A6B7D;">Phone</td><td style="padding:8px 0;"><a href="tel:${lead.phone}">${lead.phone}</a></td></tr>` : ''}
        <tr><td style="padding:8px 0;color:#5A6B7D;">Service</td><td style="padding:8px 0;">${serviceLabel}</td></tr>
        <tr><td style="padding:8px 0;color:#5A6B7D;">Urgency</td><td style="padding:8px 0;font-weight:600;color:${lead.urgency === 'emergency' ? '#DC3545' : '#5A6B7D'};">${lead.urgency.toUpperCase()}</td></tr>
        <tr><td style="padding:8px 0;color:#5A6B7D;">Provider</td><td style="padding:8px 0;">${provider ? provider.name : data.slug} (${provider ? provider.city + ', ' + provider.state : ''})</td></tr>
        <tr><td style="padding:8px 0;color:#5A6B7D;">Plan</td><td style="padding:8px 0;font-weight:700;color:${isPaid ? '#22c55e' : '#ef4444'};">${plan.toUpperCase()}</td></tr>
      </table>
      ${lead.message ? `<div style="margin-top:16px;padding:12px;background:#F4F7FA;border-radius:6px;"><p style="margin:0;color:#5A6B7D;font-size:0.85rem;">Message:</p><p style="margin:4px 0 0;">${lead.message}</p></div>` : ''}`;

    const siteUrl = process.env.SITE_URL || 'https://homeservicedirectory.com';

    if (process.env.RESEND_API_KEY) {
      const { emailWrap } = require('./email-template');

      // Paid members: forward lead to provider
      if (isPaid && provider && provider.email) {
        try {
          const ownerBody = `<p><strong>${lead.name}</strong> needs ${serviceLabel} help${provider ? ' at <strong>' + provider.name + '</strong>' : ''}.</p>
            ${leadDetailsHtml}
            <p style="margin:20px 0 0;font-size:0.82rem;color:#9BAFC4;">This lead was sent exclusively to your business. Respond within 1 hour for emergency requests.</p>
            <p style="margin:16px 0 0;text-align:center;"><a href="${siteUrl}/my-listing" style="display:inline-block;padding:10px 20px;background:#DC3545;color:white;border-radius:6px;text-decoration:none;font-weight:600;">View in Dashboard</a></p>`;
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from:    process.env.FROM_EMAIL || 'HomeServiceDirectory <hello@homeservicedirectory.com>',
              to:      provider.email,
              subject: `New ${serviceLabel} Lead: ${lead.name}${lead.urgency === 'emergency' ? ' [EMERGENCY]' : ''}`,
              html:    emailWrap('New Service Lead', ownerBody)
            })
          });

          // Mark as forwarded in DB
          try {
            const { db } = require('./_supabase');
            await db.leads().update({ forwarded: true, status: 'new' }).eq('provider_slug', data.slug).eq('email', lead.email).order('created_at', { ascending: false }).limit(1);
          } catch (e) {}
        } catch (e) { console.log('Owner lead email failed:', e.message); }
      }

      // Always notify admin
      if (process.env.ADMIN_EMAIL) {
        try {
          const adminTo    = (process.env.ADMIN_EMAIL || '').split(',').map(e => e.trim()).filter(Boolean);
          const paidLabel  = isPaid ? 'PAID MEMBER LEAD' : 'NOT PAID VENDOR';
          const labelColor = isPaid ? '#22c55e' : '#ef4444';

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from:    process.env.FROM_EMAIL || 'HomeServiceDirectory <hello@homeservicedirectory.com>',
              to:      adminTo,
              subject: `[${paidLabel}] Lead for ${provider ? provider.name : data.slug} - ${lead.name}`,
              html:    `<div style="font-family:system-ui,sans-serif;max-width:600px;">
                <div style="background:${labelColor};color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
                  <h2 style="margin:0;font-size:1.1rem;">${paidLabel}</h2>
                </div>
                <div style="background:white;padding:24px;border:1px solid #E8ECF1;border-radius:0 0 8px 8px;">
                  ${leadDetailsHtml}
                  ${!isPaid ? '<div style="margin-top:16px;padding:12px;background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;"><p style="margin:0;font-size:0.88rem;color:#991B1B;"><strong>FREE plan.</strong> Lead was NOT forwarded. Call to upsell Pro ($149/mo).</p></div>' : '<p style="margin-top:12px;font-size:0.85rem;color:#22c55e;">Lead forwarded to provider.</p>'}
                </div>
              </div>`
            })
          });
        } catch (e) { console.log('Admin lead email failed:', e.message); }
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ message: 'Your inquiry has been sent. The provider typically responds within 1-24 hours.' })
    };
  } catch (err) {
    console.error('provider-lead error:', err);
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Server error' }) };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
}
