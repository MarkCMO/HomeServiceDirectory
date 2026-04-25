// drip-processor.js - Netlify Scheduled Function
// Runs every hour: processes all due drip email sends
// Schedule: "0 * * * *" (in netlify.toml)

const { db }        = require('./_supabase');
const { sendEmail } = require('./email-send');

exports.handler = async (event) => {
  console.log('[drip-processor] Starting drip processing run at', new Date().toISOString());

  const now = new Date().toISOString();

  // Find all enrollments due for next step
  const { data: due, error } = await db.drip_enrollments()
    .select('*, drip_campaigns(name, steps)')
    .is('completed_at', null)
    .is('unsubscribed_at', null)
    .lte('next_send_at', now)
    .limit(200);

  if (error) {
    console.error('[drip-processor] Query error:', error.message);
    return { statusCode: 500 };
  }

  let sent = 0;
  let completed = 0;
  let skipped = 0;

  for (const enrollment of (due || [])) {
    try {
      const campaign = enrollment.drip_campaigns;
      if (!campaign) continue;

      const steps     = campaign.steps || [];
      const stepIndex = enrollment.step_index;
      const step      = steps[stepIndex];

      if (!step) {
        await db.drip_enrollments().update({ completed_at: now }).eq('id', enrollment.id);
        completed++;
        continue;
      }

      const result = await sendEmail({
        to:          enrollment.recipient_email,
        subject:     step.subject || campaign.name,
        html:        step.html || `<p>${step.subject}</p>`,
        template:    step.template_key || null,
        campaign_id: enrollment.campaign_id
      });

      if (result.skipped) { skipped++; }
      else { sent++; }

      // Advance step
      const nextStep = steps[stepIndex + 1];
      if (nextStep) {
        const nextSendAt = new Date(Date.now() + (nextStep.delay_hours || 24) * 3600000).toISOString();
        await db.drip_enrollments()
          .update({ step_index: stepIndex + 1, next_send_at: nextSendAt })
          .eq('id', enrollment.id);
      } else {
        await db.drip_enrollments().update({ completed_at: now }).eq('id', enrollment.id);
        completed++;
      }
    } catch (err) {
      console.error('[drip-processor] Error processing enrollment', enrollment.id, err.message);
    }
  }

  console.log(`[drip-processor] Done. sent=${sent} skipped=${skipped} completed=${completed}`);
  return { statusCode: 200 };
};
