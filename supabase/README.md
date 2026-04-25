# WETYR Supabase Setup Guide

## Step 1: Create Supabase Project

1. Go to https://supabase.com
2. Create a new project (or use existing)
3. Choose a strong database password
4. Region: US East (or closest to Netlify region)

## Step 2: Run the Schema Migration

1. Open Supabase Dashboard → SQL Editor
2. Open `migrations/001_wetyr_schema.sql`
3. Copy the entire contents and paste into SQL Editor
4. Click "Run" (or press Ctrl+Enter)
5. Verify all tables were created: go to Table Editor → you should see ~25 tables

## Step 3: Get Your API Keys

In Supabase Dashboard → Settings → API:
- **Project URL**: e.g. `https://abcdefghijk.supabase.co`
- **Service Role Key**: (under Secret) — use this for Netlify Functions

> ⚠️ NEVER expose the service role key to the browser. It bypasses RLS.

## Step 4: Set Netlify Environment Variables

In Netlify Dashboard → Site Settings → Environment Variables, add:

```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=eyJ...your-service-role-key...
ADMIN_SETUP_KEY=your-one-time-setup-key-delete-after
RESEND_API_KEY=re_...
FROM_EMAIL=HomeServiceDirectory <hello@homeservicedirectory.com>
ADMIN_EMAIL=info@wetyr.com
SITE_URL=https://hsd-markgabrieli-2026.netlify.app
SQUARE_WEBHOOK_SIGNATURE_KEY=...
INTERNAL_EMAIL_KEY=...long-random-string...
CRON_SECRET=...another-random-string...
```

## Step 5: Create First Admin Account

After deployment:

```bash
curl -X POST https://your-site.netlify.app/api/admin-setup \
  -H "Content-Type: application/json" \
  -d '{"setup_key":"your-one-time-setup-key-delete-after","email":"info@wetyr.com","password":"YourStrongPassword123!","first_name":"Mark","last_name":"Gabrielli"}'
```

Then **immediately remove** `ADMIN_SETUP_KEY` from Netlify environment variables.

## Step 6: Verify

1. Visit `/api/admin-platform?view=dashboard` with Authorization header
2. Visit `/rep-portal` and create a test rep account via `/api/rep-onboard`
3. Visit `/manager-portal`

## Database Tables Created

| Table | Purpose |
|-------|---------|
| `wetyr.tenants` | Multi-tenant domain routing |
| `wetyr.providers` | Business listings (migrated from Blobs) |
| `wetyr.leads` | Homeowner lead inquiries |
| `wetyr.admins` | Admin accounts |
| `wetyr.managers` | Manager/GM accounts |
| `wetyr.sales_reps` | Sales rep accounts |
| `wetyr.sessions` | Auth sessions (all user types) |
| `wetyr.subscriptions` | Square subscription tracking |
| `wetyr.subscription_events` | Square webhook events (idempotent) |
| `wetyr.commissions` | Rep commission records |
| `wetyr.manager_overrides` | Manager override earnings |
| `wetyr.pocs` | CRM prospects (Points of Contact) |
| `wetyr.poc_calls` | Call logs per POC |
| `wetyr.daily_queues` | Rep daily call queues |
| `wetyr.legal_docs` | Legal document templates |
| `wetyr.rep_legal_docs` | Rep document signatures |
| `wetyr.pdf_packets` | Generated PDF records |
| `wetyr.email_sends` | Email audit log |
| `wetyr.drip_campaigns` | Drip campaign definitions |
| `wetyr.drip_enrollments` | Per-recipient drip tracking |
| `wetyr.email_bounces` | Email bounce suppression |
| `wetyr.email_unsubscribes` | Unsubscribe records |
| `wetyr.reviews` | Provider reviews |
| `wetyr.photos` | Provider photos |
| `wetyr.health_log` | System health log |

## Views

| View | Purpose |
|------|---------|
| `wetyr.v_rep_mrr` | Current MRR per rep |
| `wetyr.v_manager_team_mrr` | Team MRR per manager |
| `wetyr.v_rep_leaderboard` | Rep leaderboard with commissions |
| `wetyr.v_system_health_zombies` | Idle sessions > 24h |

## Commission Structure

| Tier | Active Clients | Commission Rate |
|------|---------------|----------------|
| Standard | 0-9 | 30% |
| Senior | 10-24 | 40% |
| Elite | 25+ | 50% |

Manager Override: 5-12% on all team subscription payments
Vesting: 90 days from subscription start
Clawback window: 60 days from each payment

## Scheduled Functions (Cron)

| Function | Schedule | Purpose |
|----------|----------|---------|
| `drip-processor` | Every hour | Process due drip emails |
| `commission-vester` | Daily 6am UTC | Mark vested commissions as earned |
| `queue-builder` | Daily 5pm UTC (12pm EST) | Build rep daily call queues |
