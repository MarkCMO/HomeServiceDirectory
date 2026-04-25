// rep-onboard.js - Sales rep self-registration / onboarding
// POST /api/rep-onboard
// Creates rep record (status=pending), sends welcome email, returns session token
// Rep must complete legal docs before status becomes 'active'

const { hashPassword, createSession, setCookieHeader } = require('./_auth');
const { db }    = require('./_supabase');
const { getTenant } = require('./_tenant');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const tenant = await getTenant(event);
    const data   = JSON.parse(event.body || '{}');

    // Validate required fields
    const { email, password, first_name, last_name, phone, referral_code } = data;
    if (!email || !password || !first_name || !last_name) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'email, password, first_name, and last_name are required' }) };
    }
    if (String(password).length < 8) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Password must be at least 8 characters' }) };
    }

    const normalEmail = String(email).trim().toLowerCase();

    // Check for duplicate email
    const { data: existing } = await db.sales_reps()
      .select('id')
      .eq('email', normalEmail)
      .maybeSingle();

    if (existing) {
      return { statusCode: 409, headers: cors(), body: JSON.stringify({ error: 'An account with that email already exists' }) };
    }

    // Resolve referral
    let referredById = null;
    if (referral_code) {
      const { data: referrer } = await db.sales_reps()
        .select('id')
        .eq('referral_code', String(referral_code).toUpperCase().trim())
        .maybeSingle();
      referredById = referrer?.id || null;
    }

    // Generate unique referral code for new rep
    const myReferralCode = `REP-${first_name.toUpperCase().slice(0,3)}${Math.random().toString(36).slice(2,6).toUpperCase()}`;

    const password_hash = await hashPassword(password);

    const { data: rep, error: repErr } = await db.sales_reps().insert({
      tenant_id:       tenant?.id || null,
      email:           normalEmail,
      password_hash,
      first_name:      String(first_name).trim().slice(0, 80),
      last_name:       String(last_name).trim().slice(0, 80),
      phone:           String(phone || '').trim().slice(0, 30),
      commission_tier: 'standard',        // 30% to start
      status:          'pending',         // active only after docs signed
      referral_code:   myReferralCode,
      referred_by:     referredById
    }).select().single();

    if (repErr) {
      console.error('rep-onboard insert error:', repErr);
      return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Failed to create account: ' + repErr.message }) };
    }

    // Create session
    const ip    = (event.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ua    = event.headers['user-agent'] || '';
    const token = await createSession(rep.id, 'rep', ip, ua);

    // Send welcome email
    if (process.env.RESEND_API_KEY) {
      try {
        const siteUrl = process.env.SITE_URL || 'https://homeservicedirectory.com';
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type':  'application/json'
          },
          body: JSON.stringify({
            from:    process.env.FROM_EMAIL || 'HomeServiceDirectory <hello@homeservicedirectory.com>',
            to:      normalEmail,
            subject: `Welcome to HomeServiceDirectory - Complete Your Onboarding`,
            html: `
              <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#1a1f36;padding:32px;text-align:center;">
                  <h1 style="color:white;margin:0;font-size:1.5rem;">Welcome, ${first_name}!</h1>
                  <p style="color:#9ca3af;margin:8px 0 0;">Your HomeServiceDirectory Rep Account</p>
                </div>
                <div style="padding:32px;background:white;border:1px solid #e5e7eb;">
                  <p>You're one step away from earning commissions on home service directory listings. Here's what happens next:</p>
                  <ol style="color:#374151;line-height:1.8;">
                    <li><strong>Sign your onboarding documents</strong> (NDA, Rep Agreement, Commission Schedule)</li>
                    <li><strong>Complete your W-9</strong> for commission payouts</li>
                    <li><strong>Set up your direct deposit</strong> (ACH authorization)</li>
                    <li><strong>Access your rep dashboard</strong> and start working your call queue</li>
                  </ol>
                  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:24px 0;">
                    <p style="margin:0;font-weight:600;color:#166534;">Your Commission Tier: Standard (30%)</p>
                    <p style="margin:4px 0 0;color:#166534;font-size:0.9rem;">
                      Earn $44.70-$449.70/month per client. Advance to Senior (40%) at 10+ active clients.
                    </p>
                  </div>
                  <p style="text-align:center;">
                    <a href="${siteUrl}/rep-portal" style="display:inline-block;padding:14px 32px;background:#DC3545;color:white;border-radius:6px;text-decoration:none;font-weight:700;">Open Rep Portal</a>
                  </p>
                  <p style="font-size:0.85rem;color:#6b7280;margin-top:24px;">
                    Your referral code: <strong>${myReferralCode}</strong><br>
                    Share it with other reps you recruit and earn override bonuses.
                  </p>
                </div>
              </div>`
          })
        });
      } catch (e) { console.log('welcome email failed:', e.message); }

      // Notify admin
      if (process.env.ADMIN_EMAIL) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from:    process.env.FROM_EMAIL || 'HomeServiceDirectory <hello@homeservicedirectory.com>',
              to:      (process.env.ADMIN_EMAIL || '').split(',').map(e => e.trim()),
              subject: `New Rep Signup: ${first_name} ${last_name}`,
              html:    `<p><strong>${first_name} ${last_name}</strong> (${normalEmail}) just signed up as a sales rep. Status: PENDING (docs not yet signed).</p>
                        <p>Referral Code: ${myReferralCode}${referredById ? '<br>Referred by: ' + referral_code : ''}</p>`
            })
          });
        } catch (e) {}
      }
    }

    return {
      statusCode: 201,
      headers: { ...cors(), 'Set-Cookie': setCookieHeader(token) },
      body: JSON.stringify({
        message:       'Account created! Complete your onboarding documents to activate.',
        token,
        rep_id:        rep.id,
        status:        rep.status,
        referral_code: myReferralCode,
        next:          '/rep-portal#onboarding'
      })
    };
  } catch (err) {
    console.error('rep-onboard error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error: ' + err.message }) };
  }
};
