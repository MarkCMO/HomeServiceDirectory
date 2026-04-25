// scraper-import.js - Bulk import scraped business data as POCs
// POST /api/scraper-import
// Body: { rep_id, businesses: [{business_name, phone, website, city, state, categories, google_maps_url, google_place_id}] }
// Auth: requires admin or rep session
// Used by the GitHub Actions scraper pipeline that pulls from Google Maps

const { requireAuth } = require('./_auth');
const { db }          = require('./_supabase');
const { getTenant }   = require('./_tenant');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-scraper-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };

  // Accept either scraper key (for GitHub Actions) or session auth
  const scraperKey  = event.headers['x-scraper-key'] || event.headers['X-Scraper-Key'] || '';
  const validKey    = scraperKey === (process.env.SCRAPER_KEY || '');
  let   repId       = null;
  let   tenantId    = null;

  if (!validKey) {
    const auth = await requireAuth(event, ['admin', 'rep', 'superadmin']);
    if (auth.error) return { statusCode: auth.statusCode, headers: cors(), body: JSON.stringify({ error: auth.error }) };
    repId = auth.session.user_type === 'rep' ? auth.session.user_id : null;
  }

  try {
    const body       = JSON.parse(event.body || '{}');
    const businesses = body.businesses;
    const assignedRepId = body.rep_id || repId;

    if (!Array.isArray(businesses) || !businesses.length) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'businesses array required' }) };
    }
    if (businesses.length > 500) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Maximum 500 businesses per import' }) };
    }
    if (!assignedRepId) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'rep_id required' }) };
    }

    // Verify rep exists
    const { data: rep } = await db.sales_reps()
      .select('id, status, tenant_id')
      .eq('id', assignedRepId)
      .single();

    if (!rep) return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: 'Rep not found' }) };
    tenantId = rep.tenant_id;

    const tenant = await getTenant(event).catch(() => null);
    if (!tenantId && tenant?.id) tenantId = tenant.id;

    // Build POC rows (skip if phone or place_id already exists for this rep)
    const rows    = [];
    const skipped = [];

    for (const biz of businesses) {
      if (!biz.business_name) continue;

      // Check for duplicate by google_place_id or phone
      if (biz.google_place_id || biz.phone) {
        let dupeQuery = db.pocs().select('id').eq('rep_id', assignedRepId);
        if (biz.google_place_id) dupeQuery = dupeQuery.eq('google_place_id', biz.google_place_id);
        else if (biz.phone) dupeQuery = dupeQuery.eq('phone', biz.phone);

        const { data: existing } = await dupeQuery.maybeSingle();
        if (existing) { skipped.push(biz.business_name); continue; }
      }

      rows.push({
        tenant_id:       tenantId,
        rep_id:          assignedRepId,
        business_name:   String(biz.business_name).trim().slice(0, 200),
        contact_name:    biz.contact_name   ? String(biz.contact_name).trim().slice(0, 100)   : null,
        email:           biz.email          ? String(biz.email).trim().toLowerCase().slice(0, 200) : null,
        phone:           biz.phone          ? String(biz.phone).trim().slice(0, 30)            : null,
        website:         biz.website        ? String(biz.website).trim().slice(0, 500)         : null,
        city:            biz.city           ? String(biz.city).trim().slice(0, 100)            : null,
        state:           biz.state          ? String(biz.state).trim().slice(0, 50)            : null,
        categories:      Array.isArray(biz.categories) ? biz.categories.slice(0, 12)          : [],
        source:          biz.source         || 'scraper',
        pipeline_stage:  'new',
        priority:        biz.priority       || 'normal',
        notes:           biz.notes          ? String(biz.notes).slice(0, 2000)                 : null,
        google_maps_url: biz.google_maps_url || null,
        google_place_id: biz.google_place_id || null,
        scraped_at:      biz.scraped_at     || new Date().toISOString()
      });
    }

    if (!rows.length) {
      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({ imported: 0, skipped: skipped.length, message: 'All businesses already in pipeline' })
      };
    }

    // Batch insert in chunks of 100
    let imported = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await db.pocs().insert(chunk);
      if (error) {
        console.error('POC batch insert error:', error.message);
      } else {
        imported += chunk.length;
      }
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        message:  `Imported ${imported} new POCs for rep`,
        imported,
        skipped:  skipped.length,
        rep_id:   assignedRepId,
        total_submitted: businesses.length
      })
    };
  } catch (err) {
    console.error('scraper-import error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error: ' + err.message }) };
  }
};
