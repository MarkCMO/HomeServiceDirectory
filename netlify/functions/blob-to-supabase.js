// blob-to-supabase.js - One-time migration: import Netlify Blobs listings → Supabase
// POST /api/blob-to-supabase
// Admin only. Reads all listings from Blobs, upserts into wetyr.providers
// Safe to run multiple times (upsert by slug)

const { requireAdmin } = require('./_auth');
const { db }           = require('./_supabase');
const { getTenant }    = require('./_tenant');

const cors = () => ({
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: 'Method not allowed' }) };

  // Allow admin key or session
  const adminKey = (event.headers['x-admin-key'] || '').trim();
  let authorized = adminKey && adminKey === process.env.ADMIN_KEY;

  if (!authorized) {
    try {
      const auth = await requireAdmin(event);
      authorized = !auth.error;
    } catch (e) {}
  }

  if (!authorized) {
    return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const { getStore } = require('./blobs');
    const tenant       = await getTenant(event).catch(() => null);
    const tenantId     = tenant?.id || null;

    const listingsStore = getStore('provider-listings');
    const { blobs }     = await listingsStore.list();

    if (!blobs?.length) {
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ message: 'No listings in Blobs to migrate', migrated: 0 }) };
    }

    let migrated = 0;
    let skipped  = 0;
    let errors   = 0;
    const errorList = [];

    for (const blob of blobs) {
      try {
        const data = await listingsStore.get(blob.key, { type: 'json' });
        if (!data || !data.name || !data.city || !data.state) { skipped++; continue; }

        const providerRow = {
          tenant_id:         tenantId,
          slug:              blob.key,
          name:              String(data.name  || '').trim().slice(0, 200),
          email:             String(data.email || '').trim().toLowerCase().slice(0, 200),
          password_hash:     data.passwordHash || null,
          phone:             data.phone        || null,
          website:           data.website      || null,
          address:           data.address      || null,
          city:              String(data.city  || '').trim().slice(0, 100),
          state:             String(data.state || '').trim().slice(0, 50),
          zip:               data.zip          || null,
          state_slug:        data.stateSlug    || String(data.state || '').toLowerCase().replace(/\s+/g, '-'),
          city_slug:         data.citySlug     || String(data.city  || '').toLowerCase().replace(/\s+/g, '-'),
          categories:        Array.isArray(data.categories)   ? data.categories   : [],
          service_types:     Array.isArray(data.serviceTypes) ? data.serviceTypes : [],
          license_number:    data.licenseNumber || null,
          insurance_info:    data.insuranceInfo || null,
          years_in_business: data.yearsInBusiness ? parseInt(data.yearsInBusiness) : null,
          service_radius:    data.serviceRadius   ? parseInt(data.serviceRadius)   : null,
          is_24x7:           !!data.is24x7,
          description:       data.description || null,
          plan:              data.plan   || 'free',
          status:            data.status || 'active',
          access_token:      data.accessToken || undefined,
          rating:            parseFloat(data.rating)      || 0,
          review_count:      parseInt(data.reviewCount)   || 0,
          view_count:        parseInt(data.viewCount)     || 0,
          source:            data.source || 'blob-migration',
          submitted_at:      data.submittedAt || data.createdAt || new Date().toISOString()
        };

        const { error: upsertErr } = await db.providers().upsert(providerRow, { onConflict: 'slug' });
        if (upsertErr) {
          errors++;
          errorList.push({ slug: blob.key, error: upsertErr.message });
          console.error('Migration upsert error:', blob.key, upsertErr.message);
        } else {
          migrated++;
        }
      } catch (err) {
        errors++;
        errorList.push({ slug: blob.key, error: err.message });
        console.error('Migration error for', blob.key, err.message);
      }
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        message:  `Migration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`,
        total:    blobs.length,
        migrated,
        skipped,
        errors,
        error_list: errorList.slice(0, 20)  // Return first 20 errors for review
      })
    };
  } catch (err) {
    console.error('blob-to-supabase error:', err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Server error: ' + err.message }) };
  }
};
