// provider-submit.js - Handle provider listing submissions
// POST /api/provider-submit
// AUTO-APPROVES: listing goes live instantly, no admin review needed
// Writes to Supabase (primary) with Netlify Blobs fallback

const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const data = JSON.parse(event.body || '{}');

    const required = ['name', 'email', 'city', 'state'];
    const missing  = required.filter(f => !data[f]);
    if (missing.length) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }) };
    }

    // Hash password - bcrypt if available, SHA-256 fallback
    let password_hash = null;
    if (data.password) {
      try {
        const bcrypt = require('bcryptjs');
        password_hash = await bcrypt.hash(String(data.password).trim(), 12);
      } catch (e) {
        password_hash = crypto.createHash('sha256').update(String(data.password).trim()).digest('hex');
      }
    }

    const stateSlug = String(data.state).trim().toLowerCase().replace(/\s+/g, '-');
    const citySlug  = String(data.city).trim().toLowerCase().replace(/\s+/g, '-');
    const nameSlug  = String(data.name).trim().toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);
    const slug = nameSlug + '-' + citySlug + '-' + stateSlug;

    const listing = {
      slug,
      name:             String(data.name).trim().slice(0, 200),
      email:            String(data.email).trim().toLowerCase().slice(0, 200),
      password_hash,
      phone:            String(data.phone            || '').trim().slice(0, 30),
      website:          String(data.website          || '').trim().slice(0, 500),
      address:          String(data.address          || '').trim().slice(0, 500),
      city:             String(data.city).trim().slice(0, 100),
      state:            String(data.state).trim().slice(0, 50),
      zip:              String(data.zip              || '').trim().slice(0, 10),
      state_slug:       stateSlug,
      city_slug:        citySlug,
      categories:       Array.isArray(data.categories)    ? data.categories.slice(0, 12)    : [],
      service_types:    Array.isArray(data.serviceTypes)  ? data.serviceTypes.slice(0, 10)  : [],
      license_number:   String(data.licenseNumber    || '').trim().slice(0, 100),
      insurance_info:   String(data.insuranceInfo    || '').trim().slice(0, 200),
      years_in_business: data.yearsInBusiness ? Math.min(parseInt(data.yearsInBusiness), 100) : null,
      service_radius:   data.serviceRadius    ? Math.min(parseInt(data.serviceRadius), 200)   : null,
      is_24x7:          !!data.is24x7,
      description:      String(data.description      || '').trim().slice(0, 2000),
      plan:             'free',
      status:           'active',
      access_token:     crypto.randomUUID(),
      rating:           0,
      review_count:     0,
      view_count:       0,
      source:           'owner-submission'
    };

    // ── PRIMARY: Write to Supabase ──────────────────────────────────────
    let savedToSupabase = false;
    let providerId = null;
    try {
      const { db } = require('./_supabase');
      const { getTenant } = require('./_tenant');
      const tenant = await getTenant(event).catch(() => null);

      // Check for duplicate slug
      const { data: existing } = await db.providers()
        .select('id, slug')
        .eq('slug', slug)
        .maybeSingle();

      const insertData = {
        ...listing,
        tenant_id:    tenant?.id || null,
        submitted_at: new Date().toISOString()
      };

      let result;
      if (existing) {
        // Append city to slug to avoid collision
        insertData.slug = slug + '-' + Date.now().toString(36);
        listing.slug    = insertData.slug;
      }

      const { data: saved, error: saveErr } = await db.providers().insert(insertData).select('id').single();
      if (saveErr) throw saveErr;
      providerId     = saved.id;
      savedToSupabase = true;
    } catch (dbErr) {
      console.log('Supabase write failed, falling back to Blobs:', dbErr.message);
    }

    // ── FALLBACK: Write to Netlify Blobs ───────────────────────────────
    if (!savedToSupabase) {
      try {
        const { getStore } = require('./blobs');
        const listingsStore = getStore('provider-listings');
        // Build blob-compatible object (legacy field names)
        const blobListing = {
          ...listing,
          stateSlug:     stateSlug,
          citySlug:      citySlug,
          reviewCount:   0,
          viewCount:     0,
          is24x7:        listing.is_24x7,
          licenseNumber: listing.license_number,
          insuranceInfo: listing.insurance_info,
          yearsInBusiness: listing.years_in_business,
          serviceRadius:   listing.service_radius,
          serviceTypes:    listing.service_types,
          createdAt:       new Date().toISOString()
        };
        await listingsStore.setJSON(listing.slug, blobListing);

        // Update email index
        const indexStore = getStore('provider-index');
        const emailIndex = await indexStore.get('email-index', { type: 'json' }).catch(() => ({}));
        const emailKey   = listing.email;
        if (!emailIndex[emailKey]) emailIndex[emailKey] = [];
        emailIndex[emailKey].push({ slug: listing.slug, name: listing.name, city: listing.city, state: listing.state, plan: 'free', passwordHash: password_hash });
        await indexStore.setJSON('email-index', emailIndex);
      } catch (blobErr) {
        console.error('Both Supabase and Blobs write failed:', blobErr.message);
        return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Failed to save listing. Please try again.' }) };
      }
    }

    const siteUrl      = process.env.SITE_URL || 'https://homeservicedirectory.com';
    const dashboardUrl = `${siteUrl}/my-listing?token=${listing.access_token}&slug=${listing.slug}`;
    const listingUrl   = `${siteUrl}/listing/${listing.slug}`;

    // ── Emails ─────────────────────────────────────────────────────────
    if (process.env.RESEND_API_KEY) {
      const { emailWrap } = require('./email-template');

      // Owner confirmation
      try {
        const body = `
          <p style="font-size:1.05rem;"><strong>${listing.name}</strong> is now live on HomeServiceDirectory and visible to homeowners searching for services in ${listing.city}, ${listing.state}.</p>
          <p><a href="${listingUrl}" style="color:#4A90D9;">View your live listing &rarr;</a></p>
          <hr style="border:none;border-top:1px solid #E8ECF1;margin:20px 0;">
          <h3 style="font-size:1rem;font-weight:700;margin-bottom:8px;">Upgrade to Get Leads</h3>
          <p style="color:#5A6B7D;">You're on the <strong>Free plan</strong> - your listing is visible but leads aren't forwarded. Upgrade to Pro ($149/mo) to receive exclusive leads directly.</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;background:#DC3545;color:white;border-radius:6px;text-decoration:none;font-weight:700;font-size:1rem;">Open Your Dashboard</a>
          </p>`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    process.env.FROM_EMAIL || 'HomeServiceDirectory <hello@homeservicedirectory.com>',
            to:      listing.email,
            subject: `Your listing is live: ${listing.name} | HomeServiceDirectory`,
            html:    emailWrap('Your Listing is Live!', body)
          })
        });
      } catch (e) { console.log('Owner email failed:', e.message); }

      // Admin notification
      if (process.env.ADMIN_EMAIL) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from:    process.env.FROM_EMAIL || 'HomeServiceDirectory <hello@homeservicedirectory.com>',
              to:      (process.env.ADMIN_EMAIL || '').split(',').map(e => e.trim()).filter(Boolean),
              subject: `New Provider Listed: ${listing.name}`,
              html:    `<h2>New Provider Listed (Auto-Approved)</h2>
                <p><strong>Name:</strong> ${listing.name}</p>
                <p><strong>Location:</strong> ${listing.city}, ${listing.state} ${listing.zip}</p>
                <p><strong>Email:</strong> ${listing.email}</p>
                <p><strong>Categories:</strong> ${listing.categories.join(', ')}</p>
                <p><strong>24/7:</strong> ${listing.is_24x7 ? 'Yes' : 'No'}</p>
                <p><strong>License:</strong> ${listing.license_number || 'Not provided'}</p>
                <p><strong>Source:</strong> ${savedToSupabase ? 'Supabase' : 'Blobs fallback'}</p>`
            })
          });
        } catch (e) { console.log('Admin email failed:', e.message); }
      }

      // Enroll in drip campaign (7-day free upgrade nudge)
      try {
        const { handler: dripHandler } = require('./drip-trigger');
        await fetch(`${siteUrl}/api/drip-trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trigger:         'free_listing_day7',
            recipient_email: listing.email,
            recipient_type:  'provider',
            recipient_data:  { name: listing.name, slug: listing.slug }
          })
        });
      } catch (e) {}
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        message:      'Your listing is now live on HomeServiceDirectory!',
        slug:         listing.slug,
        provider_id:  providerId,
        accessToken:  listing.access_token,
        dashboardUrl: '/my-listing?token=' + listing.access_token + '&slug=' + listing.slug,
        listingUrl:   '/listing/' + listing.slug
      })
    };
  } catch (err) {
    console.error('provider-submit error:', err);
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
