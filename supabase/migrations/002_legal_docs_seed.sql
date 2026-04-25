-- ============================================================
-- WETYR Legal Documents Seed - Migration 002
-- Seeds the 10 required rep onboarding document templates
-- Run after 001_wetyr_schema.sql
-- ============================================================

-- Get the default tenant ID
DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM wetyr.tenants WHERE slug = 'homeservicedirectory' LIMIT 1;

  -- 1. NDA
  INSERT INTO wetyr.legal_docs (tenant_id, doc_type, title, template_html, version)
  VALUES (v_tenant_id, 'nda', 'Non-Disclosure Agreement', '<p>This Non-Disclosure Agreement (NDA) governs confidential information shared between WETYR Corporation and the Representative. Representative agrees to maintain strict confidentiality of all proprietary information, client data, pricing structures, and business processes for the duration of engagement and for two (2) years thereafter.</p>', '1.0')
  ON CONFLICT DO NOTHING;

  -- 2. Non-Compete
  INSERT INTO wetyr.legal_docs (tenant_id, doc_type, title, template_html, version)
  VALUES (v_tenant_id, 'non_compete', 'Non-Compete Agreement', '<p>Representative agrees not to engage in direct or indirect competition with HomeServiceDirectory within the United States for twelve (12) months following termination. Non-solicitation of clients and employees applies for the same period.</p>', '1.0')
  ON CONFLICT DO NOTHING;

  -- 3. Rep Agreement
  INSERT INTO wetyr.legal_docs (tenant_id, doc_type, title, template_html, version)
  VALUES (v_tenant_id, 'rep_agreement', 'Independent Sales Representative Agreement', '<p>This agreement establishes the independent contractor relationship between WETYR Corporation and the Representative. Representative is not an employee and is responsible for all self-employment taxes. Representative will solicit paid listings from home service businesses across assigned territories using Company-provided tools and training.</p>', '1.0')
  ON CONFLICT DO NOTHING;

  -- 4. Commission Schedule
  INSERT INTO wetyr.legal_docs (tenant_id, doc_type, title, template_html, version)
  VALUES (v_tenant_id, 'commission_schedule', 'Commission Schedule & Vesting Policy', '<p>Standard Tier: 30% of monthly subscription revenue. Senior Tier (10+ active clients): 40%. Elite Tier (25+ active clients): 50%. All commissions vest 90 days from the client subscription start date. A 60-day clawback window applies from each payment date. Commissions are paid monthly via ACH for fully vested earnings.</p>', '1.0')
  ON CONFLICT DO NOTHING;

  -- 5. W-9 Info
  INSERT INTO wetyr.legal_docs (tenant_id, doc_type, title, template_html, version)
  VALUES (v_tenant_id, 'w9_info', 'W-9 Tax Information Authorization', '<p>Representative acknowledges they must provide a complete IRS Form W-9 before receiving any commission payments. WETYR Corporation will issue 1099-NEC forms for all payments exceeding $600 per calendar year. Representative is responsible for all applicable federal, state, and local tax obligations.</p>', '1.0')
  ON CONFLICT DO NOTHING;

  -- 6. ACH Authorization
  INSERT INTO wetyr.legal_docs (tenant_id, doc_type, title, template_html, version)
  VALUES (v_tenant_id, 'ach_auth', 'ACH Direct Deposit Authorization', '<p>Representative authorizes WETYR Corporation to initiate ACH credit entries to the designated bank account for commission payments. Representative must provide valid routing and account numbers. WETYR will process commissions within 5 business days of the monthly payout date (15th of each month for prior month earned commissions).</p>', '1.0')
  ON CONFLICT DO NOTHING;

  -- 7. Code of Conduct
  INSERT INTO wetyr.legal_docs (tenant_id, doc_type, title, template_html, version)
  VALUES (v_tenant_id, 'conduct_policy', 'Code of Conduct & Ethics Policy', '<p>Representative agrees to conduct all sales activities professionally and honestly. Misrepresentation of pricing, features, or commitments to prospects is grounds for immediate termination. Representative will not engage in deceptive practices, create fake reviews, or use prohibited solicitation methods. Representative will comply with all applicable telemarketing laws (TCPA, GDPR where applicable, and state do-not-call regulations).</p>', '1.0')
  ON CONFLICT DO NOTHING;

  -- 8. IP Assignment
  INSERT INTO wetyr.legal_docs (tenant_id, doc_type, title, template_html, version)
  VALUES (v_tenant_id, 'ip_assignment', 'Intellectual Property Assignment', '<p>Any materials, tools, scripts, or processes created by Representative in the course of their engagement that relate to Company business are work-for-hire and remain the exclusive property of WETYR Corporation. Representative assigns all rights, title, and interest in such materials to Company.</p>', '1.0')
  ON CONFLICT DO NOTHING;

  -- 9. Arbitration Agreement
  INSERT INTO wetyr.legal_docs (tenant_id, doc_type, title, template_html, version)
  VALUES (v_tenant_id, 'arbitration', 'Dispute Resolution & Arbitration Agreement', '<p>All disputes arising from this engagement will be resolved through binding arbitration under AAA Commercial Arbitration Rules in the state of Florida. Representative waives the right to participate in class action lawsuits related to this engagement. Arbitration shall be conducted by a single neutral arbitrator. The prevailing party may recover reasonable attorneys fees as determined by the arbitrator.</p>', '1.0')
  ON CONFLICT DO NOTHING;

  -- 10. At-Will
  INSERT INTO wetyr.legal_docs (tenant_id, doc_type, title, template_html, version)
  VALUES (v_tenant_id, 'at_will', 'At-Will Engagement & Termination Policy', '<p>This independent contractor engagement is at-will and may be terminated by either party at any time with or without cause and with or without notice. Upon termination, all access to Company systems will be immediately revoked. Earned commissions (fully vested, past clawback window) will be paid within 30 days of termination date. Vesting-period commissions may be subject to clawback per the commission schedule terms.</p>', '1.0')
  ON CONFLICT DO NOTHING;

END $$;

-- Verify seed
SELECT doc_type, title, version FROM wetyr.legal_docs ORDER BY created_at;
