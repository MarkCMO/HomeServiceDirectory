-- ============================================================
-- WETYR Corporation Platform - Supabase Schema v1.0
-- Migration: 001_wetyr_schema.sql
-- Run this in your Supabase project SQL editor
-- ============================================================

CREATE SCHEMA IF NOT EXISTS wetyr;

-- ============================================================
-- 1. TENANTS (Umbrella multi-tenant: one codebase, many domains)
-- ============================================================
CREATE TABLE wetyr.tenants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT UNIQUE NOT NULL,           -- e.g. "homeservicedirectory"
  domain           TEXT UNIQUE NOT NULL,           -- e.g. "homeservicedirectory.com"
  name             TEXT NOT NULL,
  category_slugs   TEXT[]  DEFAULT '{}',           -- which of the 12 cats this tenant uses
  pricing          JSONB   DEFAULT '{}',           -- override pricing per tenant
  branding         JSONB   DEFAULT '{}',           -- colors, logo, site name
  email_from       TEXT,                           -- "HSD <hello@homeservicedirectory.com>"
  resend_api_key   TEXT,                           -- per-tenant Resend key (optional override)
  square_app_id    TEXT,
  square_access_token TEXT,
  status           TEXT    DEFAULT 'active',       -- active | suspended
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default tenant
INSERT INTO wetyr.tenants (slug, domain, name, email_from, status)
VALUES (
  'homeservicedirectory',
  'homeservicedirectory.com',
  'HomeServiceDirectory',
  'HomeServiceDirectory <hello@homeservicedirectory.com>',
  'active'
) ON CONFLICT DO NOTHING;

-- Also handle Netlify preview domain
INSERT INTO wetyr.tenants (slug, domain, name, email_from, status)
VALUES (
  'homeservicedirectory',
  'hsd-markgabrieli-2026.netlify.app',
  'HomeServiceDirectory',
  'HomeServiceDirectory <hello@homeservicedirectory.com>',
  'active'
) ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. PROVIDERS (migrated from Netlify Blobs)
-- ============================================================
CREATE TABLE wetyr.providers (
  id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID    REFERENCES wetyr.tenants(id),
  slug                   TEXT    UNIQUE NOT NULL,
  name                   TEXT    NOT NULL,
  email                  TEXT    NOT NULL,
  password_hash          TEXT,                     -- bcrypt cost 12
  phone                  TEXT,
  website                TEXT,
  address                TEXT,
  city                   TEXT    NOT NULL,
  state                  TEXT    NOT NULL,
  zip                    TEXT,
  state_slug             TEXT,
  city_slug              TEXT,
  categories             TEXT[]  DEFAULT '{}',
  service_types          TEXT[]  DEFAULT '{}',
  license_number         TEXT,
  insurance_info         TEXT,
  years_in_business      INT,
  service_radius         INT,
  is_24x7                BOOLEAN DEFAULT FALSE,
  description            TEXT,
  plan                   TEXT    DEFAULT 'free',   -- free | pro | premium | elite | sponsor
  status                 TEXT    DEFAULT 'active', -- active | suspended | deleted
  access_token           UUID    DEFAULT gen_random_uuid(),
  rating                 NUMERIC(3,2) DEFAULT 0,
  review_count           INT     DEFAULT 0,
  view_count             INT     DEFAULT 0,
  source                 TEXT    DEFAULT 'owner-submission',
  -- Square
  square_customer_id     TEXT,
  square_subscription_id TEXT,
  subscription_status    TEXT,
  -- Assigned rep (for commission tracking)
  assigned_rep_id        UUID,                     -- FK added after sales_reps table
  submitted_at           TIMESTAMPTZ DEFAULT NOW(),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_providers_tenant      ON wetyr.providers(tenant_id);
CREATE INDEX idx_providers_state       ON wetyr.providers(state_slug);
CREATE INDEX idx_providers_city        ON wetyr.providers(state_slug, city_slug);
CREATE INDEX idx_providers_categories  ON wetyr.providers USING GIN(categories);
CREATE INDEX idx_providers_plan        ON wetyr.providers(plan);
CREATE INDEX idx_providers_email       ON wetyr.providers(email);

-- ============================================================
-- 3. LEADS
-- ============================================================
CREATE TABLE wetyr.leads (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID    REFERENCES wetyr.tenants(id),
  provider_id    UUID    REFERENCES wetyr.providers(id),
  provider_slug  TEXT    NOT NULL,
  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL,
  phone          TEXT,
  service_type   TEXT,
  urgency        TEXT    DEFAULT 'standard',       -- standard | emergency
  message        TEXT,
  status         TEXT    DEFAULT 'new',            -- new | viewed | responded | closed
  forwarded      BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_provider  ON wetyr.leads(provider_id);
CREATE INDEX idx_leads_created   ON wetyr.leads(created_at DESC);
CREATE INDEX idx_leads_tenant    ON wetyr.leads(tenant_id);

-- ============================================================
-- 4. ADMINS
-- ============================================================
CREATE TABLE wetyr.admins (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID  REFERENCES wetyr.tenants(id),
  email         TEXT  UNIQUE NOT NULL,
  password_hash TEXT  NOT NULL,                    -- bcrypt cost 12
  first_name    TEXT,
  last_name     TEXT,
  role          TEXT  DEFAULT 'admin',             -- admin | superadmin
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. MANAGERS / GMs
-- ============================================================
CREATE TABLE wetyr.managers (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID    REFERENCES wetyr.tenants(id),
  email          TEXT    UNIQUE NOT NULL,
  password_hash  TEXT    NOT NULL,                 -- bcrypt cost 12
  first_name     TEXT    NOT NULL,
  last_name      TEXT    NOT NULL,
  phone          TEXT,
  role           TEXT    DEFAULT 'manager',        -- manager | gm | director
  override_pct   NUMERIC(5,2) DEFAULT 5.00,        -- 5-12% override on team MRR payments
  status         TEXT    DEFAULT 'active',         -- active | suspended | terminated
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. SALES REPS
-- ============================================================
CREATE TABLE wetyr.sales_reps (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID    REFERENCES wetyr.tenants(id),
  manager_id       UUID    REFERENCES wetyr.managers(id),
  email            TEXT    UNIQUE NOT NULL,
  password_hash    TEXT    NOT NULL,               -- bcrypt cost 12
  first_name       TEXT    NOT NULL,
  last_name        TEXT    NOT NULL,
  phone            TEXT,
  commission_tier  TEXT    DEFAULT 'standard',     -- standard(30%) | senior(40%) | elite(50%)
  status           TEXT    DEFAULT 'pending',      -- pending | active | suspended | terminated
  onboarded_at     TIMESTAMPTZ,
  docs_signed_at   TIMESTAMPTZ,
  w9_on_file       BOOLEAN DEFAULT FALSE,
  ach_on_file      BOOLEAN DEFAULT FALSE,
  referral_code    TEXT    UNIQUE,
  referred_by      UUID    REFERENCES wetyr.sales_reps(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reps_manager  ON wetyr.sales_reps(manager_id);
CREATE INDEX idx_reps_status   ON wetyr.sales_reps(status);

-- Now add FK from providers to reps
ALTER TABLE wetyr.providers
  ADD CONSTRAINT fk_providers_rep
  FOREIGN KEY (assigned_rep_id) REFERENCES wetyr.sales_reps(id);

-- ============================================================
-- 7. SESSIONS (unified: admin | rep | manager | provider)
-- ============================================================
CREATE TABLE wetyr.sessions (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID  NOT NULL,
  user_type   TEXT  NOT NULL,                      -- rep | manager | admin | provider
  token       TEXT  UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_token  ON wetyr.sessions(token);
CREATE INDEX idx_sessions_user   ON wetyr.sessions(user_id, user_type);
CREATE INDEX idx_sessions_expiry ON wetyr.sessions(expires_at);

-- ============================================================
-- 8. SUBSCRIPTIONS (Square)
-- ============================================================
CREATE TABLE wetyr.subscriptions (
  id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID    REFERENCES wetyr.tenants(id),
  provider_id            UUID    REFERENCES wetyr.providers(id),
  square_subscription_id TEXT    UNIQUE,
  square_customer_id     TEXT,
  plan                   TEXT    NOT NULL,         -- pro | premium | elite | sponsor
  monthly_amount         INT     NOT NULL,         -- cents: 14900 | 29900 | 49900 | 79900+
  status                 TEXT    DEFAULT 'active', -- active | cancelled | paused | past_due
  assigned_rep_id        UUID    REFERENCES wetyr.sales_reps(id),
  started_at             TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at           TIMESTAMPTZ,
  next_billing_date      DATE,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subs_provider  ON wetyr.subscriptions(provider_id);
CREATE INDEX idx_subs_rep       ON wetyr.subscriptions(assigned_rep_id);
CREATE INDEX idx_subs_status    ON wetyr.subscriptions(status);

-- ============================================================
-- 9. SUBSCRIPTION EVENTS (Square webhooks - idempotent by event_id)
-- ============================================================
CREATE TABLE wetyr.subscription_events (
  id               UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         TEXT  UNIQUE NOT NULL,          -- Square event_id (idempotency key)
  event_type       TEXT  NOT NULL,                 -- subscription.updated | payment.completed | etc
  subscription_id  UUID  REFERENCES wetyr.subscriptions(id),
  payload          JSONB,
  processed_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. COMMISSIONS (30-50% tiered, 90-day vesting, 60-day clawback)
-- ============================================================
CREATE TABLE wetyr.commissions (
  id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID    REFERENCES wetyr.tenants(id),
  rep_id                 UUID    REFERENCES wetyr.sales_reps(id),
  subscription_id        UUID    REFERENCES wetyr.subscriptions(id),
  subscription_event_id  UUID    REFERENCES wetyr.subscription_events(id),
  gross_amount           INT     NOT NULL,         -- cents (monthly payment amount)
  commission_tier        TEXT    NOT NULL,         -- standard | senior | elite
  commission_pct         NUMERIC(5,2) NOT NULL,    -- 30.00 | 40.00 | 50.00
  commission_amount      INT     NOT NULL,         -- cents
  status                 TEXT    DEFAULT 'pending', -- pending | vesting | earned | paid | clawed_back
  vesting_date           TIMESTAMPTZ,             -- subscription.started_at + 90 days
  clawback_deadline      TIMESTAMPTZ,             -- payment_date + 60 days
  paid_at                TIMESTAMPTZ,
  payout_method          TEXT,                    -- ach | check | paypal
  clawed_back_at         TIMESTAMPTZ,
  clawback_reason        TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commissions_rep     ON wetyr.commissions(rep_id);
CREATE INDEX idx_commissions_status  ON wetyr.commissions(status);
CREATE INDEX idx_commissions_vesting ON wetyr.commissions(vesting_date) WHERE status = 'vesting';

-- ============================================================
-- 11. MANAGER OVERRIDES (5-12% on team MRR payments)
-- ============================================================
CREATE TABLE wetyr.manager_overrides (
  id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID    REFERENCES wetyr.tenants(id),
  manager_id             UUID    REFERENCES wetyr.managers(id),
  rep_id                 UUID    REFERENCES wetyr.sales_reps(id),
  subscription_id        UUID    REFERENCES wetyr.subscriptions(id),
  subscription_event_id  UUID    REFERENCES wetyr.subscription_events(id),
  gross_amount           INT     NOT NULL,
  override_pct           NUMERIC(5,2) NOT NULL,
  override_amount        INT     NOT NULL,
  status                 TEXT    DEFAULT 'pending', -- pending | earned | paid
  paid_at                TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_overrides_manager  ON wetyr.manager_overrides(manager_id);
CREATE INDEX idx_overrides_rep      ON wetyr.manager_overrides(rep_id);

-- ============================================================
-- 12. POCs (Points of Contact / CRM prospects)
-- ============================================================
CREATE TABLE wetyr.pocs (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID    REFERENCES wetyr.tenants(id),
  rep_id           UUID    REFERENCES wetyr.sales_reps(id),
  business_name    TEXT    NOT NULL,
  contact_name     TEXT,
  email            TEXT,
  phone            TEXT,
  website          TEXT,
  city             TEXT,
  state            TEXT,
  categories       TEXT[]  DEFAULT '{}',
  source           TEXT    DEFAULT 'manual',       -- manual | scraper | import | referral
  pipeline_stage   TEXT    DEFAULT 'new',          -- new | contacted | interested | demo | proposal | won | lost
  priority         TEXT    DEFAULT 'normal',       -- low | normal | high | hot
  won_at           TIMESTAMPTZ,
  lost_at          TIMESTAMPTZ,
  lost_reason      TEXT,
  provider_id      UUID    REFERENCES wetyr.providers(id),  -- set when converted
  notes            TEXT,
  next_followup_at TIMESTAMPTZ,
  google_maps_url  TEXT,
  google_place_id  TEXT,
  scraped_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pocs_rep    ON wetyr.pocs(rep_id);
CREATE INDEX idx_pocs_stage  ON wetyr.pocs(pipeline_stage);
CREATE INDEX idx_pocs_tenant ON wetyr.pocs(tenant_id);

-- ============================================================
-- 13. POC CALL LOGS
-- ============================================================
CREATE TABLE wetyr.poc_calls (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  poc_id            UUID    REFERENCES wetyr.pocs(id) ON DELETE CASCADE,
  rep_id            UUID    REFERENCES wetyr.sales_reps(id),
  call_type         TEXT    DEFAULT 'outbound',    -- outbound | inbound | voicemail
  duration_seconds  INT,
  outcome           TEXT,   -- answered | voicemail | no-answer | callback-scheduled | not-interested | converted
  notes             TEXT,
  next_action       TEXT,
  next_action_at    TIMESTAMPTZ,
  called_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_poc_calls_poc  ON wetyr.poc_calls(poc_id);
CREATE INDEX idx_poc_calls_rep  ON wetyr.poc_calls(rep_id);

-- ============================================================
-- 14. DAILY QUEUES (refreshed 12pm EST, max 50 POCs/rep/day)
-- ============================================================
CREATE TABLE wetyr.daily_queues (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id       UUID    REFERENCES wetyr.sales_reps(id),
  poc_id       UUID    REFERENCES wetyr.pocs(id),
  queue_date   DATE    NOT NULL,
  position     INT,
  completed    BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rep_id, poc_id, queue_date)
);

CREATE INDEX idx_daily_queues_rep_date  ON wetyr.daily_queues(rep_id, queue_date);

-- ============================================================
-- 15. LEGAL DOCS (templates for rep onboarding packet)
-- ============================================================
CREATE TABLE wetyr.legal_docs (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID    REFERENCES wetyr.tenants(id),
  doc_type      TEXT    NOT NULL,  -- nda | non_compete | rep_agreement | w9_info | ach_auth | conduct_policy | commission_schedule | ip_assignment | arbitration | at_will
  title         TEXT    NOT NULL,
  template_html TEXT    NOT NULL,
  version       TEXT    DEFAULT '1.0',
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 16. REP LEGAL DOC SIGNATURES
-- ============================================================
CREATE TABLE wetyr.rep_legal_docs (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id        UUID    REFERENCES wetyr.sales_reps(id),
  legal_doc_id  UUID    REFERENCES wetyr.legal_docs(id),
  doc_type      TEXT    NOT NULL,
  signed_at     TIMESTAMPTZ DEFAULT NOW(),
  ip_address    TEXT,
  user_agent    TEXT,
  pdf_url       TEXT,                              -- Blob URL of signed PDF
  UNIQUE(rep_id, doc_type)
);

-- ============================================================
-- 17. PDF PACKETS (generated legal doc bundles)
-- ============================================================
CREATE TABLE wetyr.pdf_packets (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type  TEXT    NOT NULL,                -- rep | manager
  recipient_id    UUID    NOT NULL,
  doc_types       TEXT[]  NOT NULL,
  pdf_url         TEXT,
  generated_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

-- ============================================================
-- 18. EMAIL SENDS (audit log - all emails go through email-send.js)
-- ============================================================
CREATE TABLE wetyr.email_sends (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID    REFERENCES wetyr.tenants(id),
  recipient_email  TEXT    NOT NULL,
  template         TEXT,
  subject          TEXT,
  resend_id        TEXT,
  status           TEXT    DEFAULT 'sent',         -- sent | bounced | failed | unsubscribed
  campaign_id      UUID,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_sends_recipient  ON wetyr.email_sends(recipient_email);
CREATE INDEX idx_email_sends_created    ON wetyr.email_sends(created_at DESC);

-- ============================================================
-- 19. DRIP CAMPAIGNS
-- ============================================================
CREATE TABLE wetyr.drip_campaigns (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID    REFERENCES wetyr.tenants(id),
  name       TEXT    NOT NULL,
  trigger    TEXT    NOT NULL,   -- new_rep | new_provider | no_call_3d | free_listing_7d | upgrade_nudge
  steps      JSONB   DEFAULT '[]',  -- [{delay_hours, subject, template_key}]
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 20. DRIP ENROLLMENTS
-- ============================================================
CREATE TABLE wetyr.drip_enrollments (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID    REFERENCES wetyr.drip_campaigns(id),
  recipient_email  TEXT    NOT NULL,
  recipient_type   TEXT,                           -- rep | provider | manager
  recipient_id     UUID,
  step_index       INT     DEFAULT 0,
  enrolled_at      TIMESTAMPTZ DEFAULT NOW(),
  next_send_at     TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  unsubscribed_at  TIMESTAMPTZ,
  UNIQUE(campaign_id, recipient_email)
);

CREATE INDEX idx_drip_next_send  ON wetyr.drip_enrollments(next_send_at) WHERE completed_at IS NULL AND unsubscribed_at IS NULL;

-- ============================================================
-- 21. EMAIL BOUNCES + UNSUBSCRIBES
-- ============================================================
CREATE TABLE wetyr.email_bounces (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT  NOT NULL,
  bounce_type  TEXT,                               -- hard | soft
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE wetyr.email_unsubscribes (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT  UNIQUE NOT NULL,
  method      TEXT  DEFAULT 'link',                -- link | rfc8058 | admin
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 22. REVIEWS
-- ============================================================
CREATE TABLE wetyr.reviews (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID    REFERENCES wetyr.providers(id),
  tenant_id       UUID    REFERENCES wetyr.tenants(id),
  reviewer_name   TEXT    NOT NULL,
  reviewer_email  TEXT    NOT NULL,
  rating          INT     CHECK (rating BETWEEN 1 AND 5),
  title           TEXT,
  body            TEXT,
  status          TEXT    DEFAULT 'pending',       -- pending | approved | rejected
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_provider  ON wetyr.reviews(provider_id);
CREATE INDEX idx_reviews_status    ON wetyr.reviews(status);

-- ============================================================
-- 23. PHOTOS
-- ============================================================
CREATE TABLE wetyr.photos (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID    REFERENCES wetyr.providers(id),
  url          TEXT    NOT NULL,
  caption      TEXT,
  position     INT     DEFAULT 0,
  uploaded_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 24. HEALTH LOG
-- ============================================================
CREATE TABLE wetyr.health_log (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name  TEXT  NOT NULL,
  status      TEXT  NOT NULL,                      -- ok | warn | error
  details     JSONB,
  checked_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VIEWS
-- ============================================================

-- Zombie sessions: authenticated but idle > 24h
CREATE OR REPLACE VIEW wetyr.v_system_health_zombies AS
SELECT
  s.id,
  s.user_type,
  s.user_id,
  s.created_at,
  s.last_seen_at,
  NOW() - s.last_seen_at AS idle_duration,
  s.expires_at
FROM wetyr.sessions s
WHERE s.expires_at > NOW()
  AND s.last_seen_at < NOW() - INTERVAL '24 hours';

-- Rep MRR view
CREATE OR REPLACE VIEW wetyr.v_rep_mrr AS
SELECT
  sub.assigned_rep_id                             AS rep_id,
  COUNT(*)                                        AS subscription_count,
  SUM(sub.monthly_amount)                         AS total_mrr_cents,
  ROUND(SUM(sub.monthly_amount) / 100.0, 2)       AS total_mrr_dollars
FROM wetyr.subscriptions sub
WHERE sub.status = 'active'
  AND sub.assigned_rep_id IS NOT NULL
GROUP BY sub.assigned_rep_id;

-- Manager team MRR view
CREATE OR REPLACE VIEW wetyr.v_manager_team_mrr AS
SELECT
  sr.manager_id,
  COUNT(DISTINCT sr.id)                           AS rep_count,
  SUM(sub.monthly_amount)                         AS team_mrr_cents,
  ROUND(SUM(sub.monthly_amount) / 100.0, 2)       AS team_mrr_dollars
FROM wetyr.sales_reps sr
JOIN wetyr.subscriptions sub
  ON sub.assigned_rep_id = sr.id AND sub.status = 'active'
WHERE sr.manager_id IS NOT NULL
GROUP BY sr.manager_id;

-- Rep leaderboard
CREATE OR REPLACE VIEW wetyr.v_rep_leaderboard AS
SELECT
  sr.id,
  sr.first_name || ' ' || sr.last_name           AS rep_name,
  sr.commission_tier,
  m.first_name || ' ' || m.last_name             AS manager_name,
  COALESCE(mrr.subscription_count, 0)            AS active_clients,
  COALESCE(mrr.total_mrr_dollars, 0)             AS mrr_dollars,
  COALESCE(
    ROUND(mrr.total_mrr_cents * (
      CASE sr.commission_tier
        WHEN 'elite'    THEN 0.50
        WHEN 'senior'   THEN 0.40
        ELSE                 0.30
      END
    ) / 100.0, 2),
    0
  )                                               AS monthly_commission_dollars
FROM wetyr.sales_reps sr
LEFT JOIN wetyr.managers m ON m.id = sr.manager_id
LEFT JOIN wetyr.v_rep_mrr mrr ON mrr.rep_id = sr.id
WHERE sr.status = 'active'
ORDER BY mrr_dollars DESC NULLS LAST;

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION wetyr.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_providers_updated_at   BEFORE UPDATE ON wetyr.providers    FOR EACH ROW EXECUTE FUNCTION wetyr.set_updated_at();
CREATE TRIGGER trg_reps_updated_at        BEFORE UPDATE ON wetyr.sales_reps   FOR EACH ROW EXECUTE FUNCTION wetyr.set_updated_at();
CREATE TRIGGER trg_managers_updated_at    BEFORE UPDATE ON wetyr.managers      FOR EACH ROW EXECUTE FUNCTION wetyr.set_updated_at();
CREATE TRIGGER trg_pocs_updated_at        BEFORE UPDATE ON wetyr.pocs          FOR EACH ROW EXECUTE FUNCTION wetyr.set_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON wetyr.subscriptions FOR EACH ROW EXECUTE FUNCTION wetyr.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (enable but allow service role full access)
-- ============================================================
ALTER TABLE wetyr.providers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE wetyr.leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE wetyr.sales_reps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wetyr.managers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE wetyr.sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE wetyr.subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wetyr.commissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wetyr.pocs              ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (Netlify Functions use SUPABASE_SERVICE_KEY)
-- All policies use service_role which bypasses RLS automatically in Supabase.
-- No additional policies needed for backend - only needed if you add anon key access.
