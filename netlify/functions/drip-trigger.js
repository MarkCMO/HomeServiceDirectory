// drip-trigger.js - Trigger drip campaign enrollments and process due sends
// POST /api/drip-trigger { trigger, recipient_email, recipient_type, recipient_id }
// GET  /api/drip-trigger?action=process  - process all due drip emails (cron)

const { db }       = require('./_supabase');
const { sendEmail } = require('./email-send');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
});

// Built-in drip templates
const TEMPLATES = {
  new_rep_welcome: (data) => ({
    subject: `Welcome to the team - your first steps`,
    html: `<p>Hi ${data.first_name || 'there'},</p>
      <p>You're one step from earning commissions on home service listings. Here's your onboarding checklist:</p>
      <ol><li>Sign your onboarding documents</li><li>Complete your W-9</li><li>Set up direct deposit</li></ol>
      <p><a href="${process.env.SITE_URL || 'https://homeservicedirectory.com'}/rep-portal">Open Rep Portal →</a></p>`
  }),
  new_rep_day3: (data) => ({
    subject: `Your first POC target list is ready`,
    html: `<p>Hi ${data.first_name || 'there'},</p>
      <p>It's been 3 days since you joined. Time to build your pipeline!</p>
      <p>Your daily queue is auto-generated at 12pm EST with your highest-priority POCs.</p>
      <p><a href="${process.env.SITE_URL || 'https://homeservicedirectory.com'}/rep-portal#queue">View Your Queue →</a></p>`
  }),
  free_listing_day7: () => ({
    subject: `Your listing is missing out on leads`,
    html: `<p>Your HomeServiceDirectory listing is live - but on the Free plan, leads aren't being forwarded to you.</p>
      <p>Upgrade to Pro ($149/mo) and start receiving exclusive leads from homeowners searching in your area.</p>
      <p><a href="${process.env.SITE_URL || 'https://homeservicedirectory.com'}/pricing">See Upgrade Options →</a></p>`
  }),
  no_call_3d: (data) => ({
    subject: `You have ${data.queue_count || 'multiple'} POCs waiting in your queue`,
    html: `<p>Hi ${data.first_name || 'there'},</p>
      <p>You haven't logged any calls in 3 days. Your pipeline may be going stale.</p>
      <p><a href="${process.env.SITE_URL || 'https://homeservicedirectory.com'}/rep-portal#queue">Resume Your Queue →</a></p>`
  })
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };

  try {
    // Cron action: process all due drip emails
    if (event.httpMethod === 'GET' && (event.queryStringParameters || {}).action === 'process') {
      const secret = event.headers['x-cron-secret'] || event.headers['X-Cron-Secret'] || '';
      if (secret !== (process.env.CRON_SECRET || 'dev-cron')) {
        return { statusCode: 403, headers: cors(), body: JSON.stringify({ error: 'Forbidden' }) };
      }

      const now = new Date().toISOString();

      // Find due enrollments
      const { data: due } = await db.drip_enrollments()
        .select('*, drip_campaigns(name, steps)')
        .is('completed_at', null)
        .is('unsubscribed_at', null)
        .lte('next_send_at', now)
        .limit(100);

      let sent = 0;
      let advanced = 0;

      for (const enrollment of (due || [])) {
        const campaign = enrollment.drip_campaigns;
        if (!campaign) continue;

        const steps     = campaign.steps || [];
        const stepIndex = enrollment.step_index;
        const step      = steps[stepIndex];

        if (!step) {
          // Campaign complete
          await db.drip_enrollments().update({ completed_at: now }).eq('id', enrollment.id);
          continue;
        }

        // Build email from template
        const templateFn = TEMPLATES[step.template_key];
        const emailData  = templateFn ? templateFn(enrollment.recipient_data || {}) : { subject: step.subject || 'Update', html: step.html || '' };

        const result = await sendEmail({
          to:          enrollment.recipient_email,
          subject:     emailData.subject,
          html:        emailData.html,
          template:    step.template_key,
          campaign_id: enrollment.campaign_id
        });

        if (!result.skipped) sent++;

        // Advance to next step
        const nextStep = steps[stepIndex + 1];
        if (nextStep) {
          const nextSendAt = new Date(Date.now() + (nextStep.delay_hours || 24) * 3600000).toISOString();
          await db.drip_enrollments()
            .update({ step_index: stepIndex + 1, next_send_at: nextSendAt })
            .eq('id', enrollment.id);
          advanced++;
        } else {
          await db.drip_enrollments().update({ completed_at: now }).eq('id', enrollment.id);
        }
      }

      return { statusCode: 200, headers: cors(), body: JSON.stringify({ processed: due?.length || 0, sent, advanced }) };
    }

    // POST: enroll recipient in a campaign
    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body || '{}');
      const { trigger, recipient_email, recipient_type, recipient_id, recipient_data } = data;

      if (!trigger || !recipient_email) {
        return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'trigger and recipient_email required' }) };
      }

      // Find active campaign for this trigger
      const { data: campaign } = await db.drip_campaigns()
        .select('id, steps')
        .eq('trigger', trigger)
        .eq('active', true)
        .maybeSingle();

      if (!campaign) {
        return { statusCode: 200, headers: cors(), body: JSON.stringify({ enrolled: false, reason: 'No active campaign for trigger: ' + trigger }) };
      }

      const steps      = campaign.steps || [];
      const firstStep  = steps[0];
      const next_send_at = firstStep
        ? new Date(Date.now() + (firstStep.delay_hours || 0) * 3600000).toISOString()
        : null;

      // Upsert enrollment (don't re-enroll if already active)
      const { data: enrollment, error: enrollErr } = await db.drip_enrollments().upsert({
        campaign_id:     campaign.id,
        recipient_email: String(recipient_email).trim().toLowerCase(),
        recipient_type:  recipient_type || null,
        recipient_id:    recipient_id   || null,
        step_index:      0,
        next_send_at,
        recipient_data:  recipient_data || null
      }, { onConflict: 'campaign_id,recipient_email', ignoreDuplicates: true }).select().single();

      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({
          enrolled:    !!enrollment,
          campaign_id: campaign.id,
          trigger,
          next_send_at
        })
      };
    }

    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('drip-trigger error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error' }) };
  }
};
