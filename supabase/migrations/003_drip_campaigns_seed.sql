-- ============================================================
-- WETYR Drip Campaigns Seed - Migration 003
-- Seeds default drip campaign sequences
-- Run after 001_wetyr_schema.sql
-- ============================================================

DO $$
DECLARE
  v_tenant_id UUID;
  v_new_rep_id UUID;
  v_free_listing_id UUID;
  v_no_call_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM wetyr.tenants WHERE slug = 'homeservicedirectory' LIMIT 1;

  -- ── Campaign 1: New Rep Onboarding (trigger: new_rep) ──────────────
  INSERT INTO wetyr.drip_campaigns (tenant_id, name, trigger, status)
  VALUES (v_tenant_id, 'New Rep Onboarding', 'new_rep', 'active')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_new_rep_id;

  IF v_new_rep_id IS NOT NULL THEN
    -- Step 0: Immediate welcome
    INSERT INTO wetyr.drip_steps (campaign_id, step_index, delay_hours, subject, body_html)
    VALUES (v_new_rep_id, 0, 0,
      'Welcome to the WETYR Sales Team!',
      '<h2>Welcome aboard!</h2>
       <p>You''re now part of the WETYR HomeServiceDirectory sales team. Here''s how to get started:</p>
       <ol>
         <li><strong>Complete your onboarding documents</strong> - Sign all 10 required documents in your <a href="https://homeservicedirectory.com/rep-portal">Rep Portal</a></li>
         <li><strong>Review your commission schedule</strong> - You start at 30% (Standard tier) and can earn up to 50% (Elite tier)</li>
         <li><strong>Build your pipeline</strong> - Add your first prospects in the Pipeline tab</li>
         <li><strong>Check your daily queue</strong> - Your call queue refreshes every day at 12pm EST</li>
       </ol>
       <p>Your referral code is: <strong>{{referral_code}}</strong></p>
       <p><a href="https://homeservicedirectory.com/rep-portal" style="background:#DC3545;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Go to Rep Portal</a></p>')
    ON CONFLICT DO NOTHING;

    -- Step 1: Day 1 - Document reminder
    INSERT INTO wetyr.drip_steps (campaign_id, step_index, delay_hours, subject, body_html)
    VALUES (v_new_rep_id, 1, 24,
      'Action Required: Complete Your Rep Documents',
      '<h2>One more step before you can start earning</h2>
       <p>You still need to sign your onboarding documents before your account becomes fully active. This takes about 5 minutes.</p>
       <p><a href="https://homeservicedirectory.com/rep-portal#onboarding" style="background:#DC3545;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Sign Documents Now</a></p>
       <p style="color:#64748b;font-size:0.85em;">Required: NDA, Non-Compete, Rep Agreement, Commission Schedule, W-9, ACH Auth, Code of Conduct, IP Assignment, Arbitration, At-Will</p>')
    ON CONFLICT DO NOTHING;

    -- Step 2: Day 3 - First win tips
    INSERT INTO wetyr.drip_steps (campaign_id, step_index, delay_hours, subject, body_html)
    VALUES (v_new_rep_id, 2, 72,
      'Tips for landing your first client',
      '<h2>How to close your first HomeServiceDirectory listing</h2>
       <p>Here are the top 3 approaches that work best for new reps:</p>
       <ol>
         <li><strong>Target water damage & mold companies</strong> - These have the highest job values ($5K-$50K) and understand lead value</li>
         <li><strong>Lead with the free listing</strong> - Get them in the door, then upsell to Pro ($149/mo) once they see the traffic</li>
         <li><strong>Use the City Sponsor pitch</strong> - "Be the only [category] company listed for [their city]" is a powerful exclusive angle</li>
       </ol>
       <p><a href="https://homeservicedirectory.com/rep-portal" style="background:#DC3545;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Open Your Portal</a></p>')
    ON CONFLICT DO NOTHING;

    -- Step 3: Day 7 - Week 1 check-in
    INSERT INTO wetyr.drip_steps (campaign_id, step_index, delay_hours, subject, body_html)
    VALUES (v_new_rep_id, 3, 168,
      'How''s your first week going?',
      '<h2>Week 1 Check-In</h2>
       <p>You''ve had a full week to get started. Most successful reps have at least 20 prospects in their pipeline by end of week 1.</p>
       <p><strong>Quick wins checklist:</strong></p>
       <ul>
         <li>Documents signed? (Required for activation)</li>
         <li>At least 10 prospects added to pipeline?</li>
         <li>First outreach calls made?</li>
       </ul>
       <p>Reach out to your manager if you need support or training materials.</p>
       <p><a href="https://homeservicedirectory.com/rep-portal" style="background:#DC3545;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">View Your Pipeline</a></p>')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── Campaign 2: Free Listing Day 7 Upsell (trigger: free_listing_day7) ──
  INSERT INTO wetyr.drip_campaigns (tenant_id, name, trigger, status)
  VALUES (v_tenant_id, 'Free Listing Upsell', 'free_listing_day7', 'active')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_free_listing_id;

  IF v_free_listing_id IS NOT NULL THEN
    -- Step 0: Day 7 upgrade prompt
    INSERT INTO wetyr.drip_steps (campaign_id, step_index, delay_hours, subject, body_html)
    VALUES (v_free_listing_id, 0, 168,
      'Your HomeServiceDirectory listing is live - ready for leads?',
      '<h2>Your listing has been live for a week!</h2>
       <p>Great news - your free listing on HomeServiceDirectory is getting visibility. To start receiving actual customer leads, upgrade to Pro.</p>
       <table style="width:100%;border-collapse:collapse;margin:20px 0;">
         <tr>
           <th style="background:#f8fafc;padding:12px;text-align:left;">Plan</th>
           <th style="background:#f8fafc;padding:12px;text-align:left;">Price</th>
           <th style="background:#f8fafc;padding:12px;text-align:left;">Leads</th>
         </tr>
         <tr><td style="padding:12px;border-bottom:1px solid #e2e8f0;"><strong>Pro</strong></td><td style="padding:12px;border-bottom:1px solid #e2e8f0;">$149/mo</td><td style="padding:12px;border-bottom:1px solid #e2e8f0;">1 category</td></tr>
         <tr><td style="padding:12px;border-bottom:1px solid #e2e8f0;"><strong>Premium</strong></td><td style="padding:12px;border-bottom:1px solid #e2e8f0;">$299/mo</td><td style="padding:12px;border-bottom:1px solid #e2e8f0;">All categories</td></tr>
         <tr><td style="padding:12px;"><strong>Elite</strong></td><td style="padding:12px;">$499/mo</td><td style="padding:12px;">All + priority</td></tr>
       </table>
       <p><a href="https://homeservicedirectory.com/pricing" style="background:#DC3545;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Upgrade My Listing</a></p>')
    ON CONFLICT DO NOTHING;

    -- Step 1: Day 14 follow-up
    INSERT INTO wetyr.drip_steps (campaign_id, step_index, delay_hours, subject, body_html)
    VALUES (v_free_listing_id, 1, 336,
      'Still missing out on leads from your area',
      '<h2>Home service leads in {{city}}, {{state}} are going to your competitors</h2>
       <p>Every day you''re on the free plan, leads from your area get forwarded to Pro+ providers - not you. Upgrade today to start capturing those leads.</p>
       <p>The average home service job in your category is worth $2,000-$10,000. One lead pays for months of your subscription.</p>
       <p><a href="https://homeservicedirectory.com/my-listing" style="background:#DC3545;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Upgrade Now - Start at $149/mo</a></p>
       <p style="color:#64748b;font-size:0.85em;">Cancel anytime. No setup fees.</p>')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── Campaign 3: No Call 3 Days (trigger: no_call_3d) ──────────────
  INSERT INTO wetyr.drip_campaigns (tenant_id, name, trigger, status)
  VALUES (v_tenant_id, 'Inactive Rep 3-Day Nudge', 'no_call_3d', 'active')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_no_call_id;

  IF v_no_call_id IS NOT NULL THEN
    -- Step 0: Nudge after 3 days no activity
    INSERT INTO wetyr.drip_steps (campaign_id, step_index, delay_hours, subject, body_html)
    VALUES (v_no_call_id, 0, 0,
      'Your pipeline needs attention',
      '<h2>It''s been 3 days since your last call</h2>
       <p>Consistent daily outreach is the #1 driver of commission earnings. Your daily queue is ready - just 10-15 calls per day compounds into serious income.</p>
       <p>Top reps earn $3,000-$8,000/month in recurring commissions. The difference is daily consistency.</p>
       <p><a href="https://homeservicedirectory.com/rep-portal#queue" style="background:#DC3545;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">View Your Queue</a></p>')
    ON CONFLICT DO NOTHING;
  END IF;

END $$;

-- Verify seed
SELECT c.name, c.trigger, COUNT(s.id) as steps
FROM wetyr.drip_campaigns c
LEFT JOIN wetyr.drip_steps s ON s.campaign_id = c.id
GROUP BY c.id, c.name, c.trigger
ORDER BY c.created_at;
