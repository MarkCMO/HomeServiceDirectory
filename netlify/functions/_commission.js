// _commission.js - Commission engine for WETYR platform
// Rep tiers: standard 30% | senior 40% | elite 50%
// Manager override: 5-12% on each payment from their team
// Vesting: 90 days from subscription start
// Clawback window: 60 days from payment

const { db } = require('./_supabase');

const TIER_PCT = {
  standard: 30.00,
  senior:   40.00,
  elite:    50.00
};

const VESTING_DAYS  = 90;
const CLAWBACK_DAYS = 60;

// Calculate commission amount for a rep given gross payment in cents
function calcRepCommission(grossCents, commissionTier) {
  const pct    = TIER_PCT[commissionTier] || TIER_PCT.standard;
  const amount = Math.round(grossCents * pct / 100);
  return { pct, amount };
}

// Calculate manager override amount for a payment in cents
function calcManagerOverride(grossCents, overridePct) {
  const pct    = parseFloat(overridePct) || 5.00;
  const amount = Math.round(grossCents * pct / 100);
  return { pct, amount };
}

// Process a payment event: create commission + override records
// Called from stripe-webhook.js / square-webhook.js on each successful charge
async function processPaymentCommission({ tenantId, subscriptionId, eventId, grossCents, paymentDate }) {
  const now = new Date(paymentDate || Date.now());

  // Load subscription with rep info
  const { data: sub, error: subErr } = await db.subscriptions()
    .select('*, sales_reps(id, commission_tier, manager_id, status), managers(id, override_pct, status)')
    .eq('id', subscriptionId)
    .single();

  if (subErr || !sub) {
    console.warn('commission: subscription not found', subscriptionId);
    return { commissioned: false, reason: 'subscription not found' };
  }

  const rep = sub.sales_reps;
  if (!rep || rep.status !== 'active') {
    return { commissioned: false, reason: 'no active rep assigned' };
  }

  // Rep commission
  const { pct, amount } = calcRepCommission(grossCents, rep.commission_tier);
  const vestingDate    = new Date(sub.started_at);
  vestingDate.setDate(vestingDate.getDate() + VESTING_DAYS);
  const clawbackDeadline = new Date(now);
  clawbackDeadline.setDate(clawbackDeadline.getDate() + CLAWBACK_DAYS);

  const commissionStatus = vestingDate <= now ? 'earned' : 'vesting';

  const { data: commission, error: commErr } = await db.commissions().insert({
    tenant_id:             tenantId || sub.tenant_id,
    rep_id:                rep.id,
    subscription_id:       subscriptionId,
    subscription_event_id: eventId,
    gross_amount:          grossCents,
    commission_tier:       rep.commission_tier,
    commission_pct:        pct,
    commission_amount:     amount,
    status:                commissionStatus,
    vesting_date:          vestingDate.toISOString(),
    clawback_deadline:     clawbackDeadline.toISOString()
  }).select().single();

  if (commErr) console.error('commission insert error:', commErr.message);

  // Manager override
  let override = null;
  if (rep.manager_id) {
    // Load manager override pct
    const { data: mgr } = await db.managers()
      .select('id, override_pct, status')
      .eq('id', rep.manager_id)
      .single();

    if (mgr && mgr.status === 'active') {
      const { pct: oPct, amount: oAmount } = calcManagerOverride(grossCents, mgr.override_pct);
      const { data: ov, error: ovErr } = await db.manager_overrides().insert({
        tenant_id:             tenantId || sub.tenant_id,
        manager_id:            mgr.id,
        rep_id:                rep.id,
        subscription_id:       subscriptionId,
        subscription_event_id: eventId,
        gross_amount:          grossCents,
        override_pct:          oPct,
        override_amount:       oAmount,
        status:                'earned'
      }).select().single();
      if (ovErr) console.error('override insert error:', ovErr.message);
      override = ov;
    }
  }

  return {
    commissioned:      true,
    commission:        commission || null,
    override:          override,
    rep_tier:          rep.commission_tier,
    commission_pct:    pct,
    commission_amount: amount
  };
}

// Check and update vested commissions (run nightly via scheduled function)
async function processVesting() {
  const now = new Date().toISOString();
  const { data, error } = await db.commissions()
    .update({ status: 'earned' })
    .eq('status', 'vesting')
    .lte('vesting_date', now)
    .select('id');

  if (error) console.error('vesting update error:', error.message);
  return { vested: data?.length || 0 };
}

// Trigger clawback on subscription cancellation within window
async function processClawback({ subscriptionId, cancelledAt, reason }) {
  const cancelDate = new Date(cancelledAt || Date.now());

  // Find commissions still within clawback window
  const { data: commissions, error } = await db.commissions()
    .select('*')
    .eq('subscription_id', subscriptionId)
    .in('status', ['vesting', 'earned'])
    .gt('clawback_deadline', cancelDate.toISOString());

  if (error || !commissions?.length) return { clawed_back: 0 };

  const ids = commissions.map(c => c.id);
  const { error: updateErr } = await db.commissions()
    .update({
      status:           'clawed_back',
      clawed_back_at:   cancelDate.toISOString(),
      clawback_reason:  reason || 'subscription cancelled within clawback window'
    })
    .in('id', ids);

  if (updateErr) console.error('clawback update error:', updateErr.message);
  return { clawed_back: ids.length, commission_ids: ids };
}

module.exports = {
  TIER_PCT,
  VESTING_DAYS,
  CLAWBACK_DAYS,
  calcRepCommission,
  calcManagerOverride,
  processPaymentCommission,
  processVesting,
  processClawback
};
