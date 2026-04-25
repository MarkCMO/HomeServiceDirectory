-- ============================================================
-- WETYR Drip Steps Table - Migration 004
-- Adds drip_steps table missing from initial schema
-- Run after 001_wetyr_schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS wetyr.drip_steps (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID    NOT NULL REFERENCES wetyr.drip_campaigns(id) ON DELETE CASCADE,
  step_index   INT     NOT NULL DEFAULT 0,           -- 0-based order
  delay_hours  INT     NOT NULL DEFAULT 0,           -- hours after enrollment (or previous step)
  subject      TEXT    NOT NULL,
  body_html    TEXT    NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, step_index)
);

-- Add step tracking to enrollments if not present
ALTER TABLE wetyr.drip_enrollments
  ADD COLUMN IF NOT EXISTS step_index INT NOT NULL DEFAULT 0;

-- Index for fast step lookup
CREATE INDEX IF NOT EXISTS idx_drip_steps_campaign ON wetyr.drip_steps(campaign_id, step_index);

-- ============================================================
-- Also patch drip_enrollments: add next_send_at default
-- ============================================================
ALTER TABLE wetyr.drip_enrollments
  ALTER COLUMN next_send_at SET DEFAULT NOW();

-- Verify
SELECT 'drip_steps table ready' AS status;
