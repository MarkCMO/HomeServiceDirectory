// manager-rep-update.js - Manager updates rep status / commission tier
// PATCH /api/manager-rep-update { rep_id, status?, commission_tier? }

const { requireManager } = require('./_auth');
const { db }             = require('./_supabase');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'PATCH, POST, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (!['PATCH','POST'].includes(event.httpMethod)) return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const auth = await requireManager(event);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };

    const managerId = auth.session.user_id;
    const data      = JSON.parse(event.body || '{}');
    const { rep_id, status, commission_tier, override_pct } = data;

    if (!rep_id) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'rep_id required' }) };

    // Verify rep belongs to this manager
    const { data: rep } = await db.sales_reps()
      .select('id, manager_id, first_name, last_name, status, commission_tier')
      .eq('id', rep_id)
      .single();

    if (!rep) return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: 'Rep not found' }) };
    if (rep.manager_id !== managerId) return { statusCode: 403, headers: cors(), body: JSON.stringify({ error: 'Rep is not on your team' }) };

    const updates = {};

    if (status) {
      const validStatuses = ['active', 'suspended', 'terminated'];
      if (!validStatuses.includes(status)) {
        return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Invalid status. Valid: ' + validStatuses.join(', ') }) };
      }
      updates.status = status;
    }

    if (commission_tier) {
      const validTiers = ['standard', 'senior', 'elite'];
      if (!validTiers.includes(commission_tier)) {
        return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Invalid tier. Valid: ' + validTiers.join(', ') }) };
      }
      updates.commission_tier = commission_tier;
    }

    if (!Object.keys(updates).length) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'No valid fields to update (status, commission_tier)' }) };
    }

    const { data: updated, error: updateErr } = await db.sales_reps()
      .update(updates)
      .eq('id', rep_id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Notify rep of tier change
    if (commission_tier && commission_tier !== rep.commission_tier && process.env.RESEND_API_KEY) {
      try {
        const tierPct = { standard: 30, senior: 40, elite: 50 };
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    process.env.FROM_EMAIL || 'HomeServiceDirectory <hello@homeservicedirectory.com>',
            to:      rep.email || updated.email,
            subject: `Congratulations! Your commission tier has been upgraded to ${commission_tier.toUpperCase()}`,
            html:    `<h2>Commission Tier Upgrade!</h2>
                      <p>Hi ${rep.first_name},</p>
                      <p>Your manager has upgraded your commission tier to <strong>${commission_tier.toUpperCase()}</strong> (${tierPct[commission_tier]}% commission).</p>
                      <p>This applies to all future subscription payments from your active clients.</p>`
          })
        });
      } catch (e) {}
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        message:  'Rep updated',
        rep_id,
        updates,
        rep:      updated
      })
    };
  } catch (err) {
    console.error('manager-rep-update error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
