#!/usr/bin/env node
// scripts/scraper.js - Google Maps business scraper for HomeServiceDirectory
// Called by .github/workflows/scraper.yml
// Env: SCRAPER_KEY, GOOGLE_MAPS_KEY, HSD_API_URL, REP_ID, CATEGORY, STATE, MAX_CITIES

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const SCRAPER_KEY = process.env.SCRAPER_KEY || '';
const API_URL     = (process.env.HSD_API_URL || 'https://homeservicedirectory.com').replace(/\/$/, '');
const REP_ID      = process.env.REP_ID || '';
const FILTER_CAT  = process.env.CATEGORY || '';
const FILTER_STATE= process.env.STATE || '';
const MAX_CITIES  = parseInt(process.env.MAX_CITIES || '20');

if (!REP_ID) { console.error('ERROR: REP_ID env var required'); process.exit(1); }
if (!SCRAPER_KEY) { console.error('ERROR: SCRAPER_KEY env var required'); process.exit(1); }

const OUTPUT_DIR = path.join(__dirname, 'scraper-output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Category → Google Maps search keywords ────────────────────────────────
const CATEGORY_KEYWORDS = {
  'plumbing':           ['plumber', 'plumbing company', 'emergency plumber'],
  'water-damage':       ['water damage restoration', 'flood cleanup', 'water mitigation'],
  'mold-remediation':   ['mold remediation', 'mold removal company', 'mold inspector'],
  'hvac':               ['HVAC company', 'air conditioning repair', 'heating cooling'],
  'electrical':         ['electrician', 'electrical contractor', 'licensed electrician'],
  'roofing':            ['roofing contractor', 'roofer', 'roof repair company'],
  'foundation-repair':  ['foundation repair', 'foundation contractor', 'basement waterproofing'],
  'fire-damage':        ['fire damage restoration', 'fire remediation', 'smoke damage cleanup'],
  'sewage-cleanup':     ['sewage cleanup', 'biohazard cleanup', 'sewage backup company'],
  'storm-damage':       ['storm damage restoration', 'storm contractor', 'hurricane damage repair'],
  'asbestos-abatement': ['asbestos removal', 'asbestos abatement contractor', 'asbestos inspector'],
  'locksmith':          ['locksmith', 'emergency locksmith', '24 hour locksmith']
};

// Target cities by state (top 3 per state for scraping)
const CITY_TARGETS = {
  'FL': ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale'],
  'TX': ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth'],
  'CA': ['Los Angeles', 'San Diego', 'San Francisco', 'Sacramento', 'San Jose'],
  'NY': ['New York City', 'Buffalo', 'Rochester', 'Albany', 'Syracuse'],
  'GA': ['Atlanta', 'Savannah', 'Augusta', 'Columbus', 'Macon'],
  'NC': ['Charlotte', 'Raleigh', 'Durham', 'Greensboro', 'Winston-Salem'],
  'OH': ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron'],
  'IL': ['Chicago', 'Aurora', 'Rockford', 'Joliet', 'Naperville'],
  'PA': ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading'],
  'AZ': ['Phoenix', 'Tucson', 'Mesa', 'Scottsdale', 'Chandler'],
  'WA': ['Seattle', 'Spokane', 'Tacoma', 'Bellevue', 'Olympia'],
  'CO': ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Lakewood'],
  'TN': ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga', 'Clarksville'],
  'VA': ['Virginia Beach', 'Norfolk', 'Richmond', 'Newport News', 'Arlington'],
  'MI': ['Detroit', 'Grand Rapids', 'Warren', 'Sterling Heights', 'Lansing'],
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function scrapeGoogleMaps(browser, keyword, city, state) {
  const businesses = [];
  const page = await browser.newPage();

  try {
    const query = encodeURIComponent(`${keyword} in ${city} ${state}`);
    await page.goto(`https://www.google.com/maps/search/${query}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    await sleep(2000);

    // Scroll to load more results
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('PageDown');
      await sleep(1000);
    }

    // Extract business listings
    const results = await page.evaluate(() => {
      const items = document.querySelectorAll('[role="article"]');
      const bizList = [];
      items.forEach(item => {
        const nameEl  = item.querySelector('a[aria-label]');
        const name    = nameEl ? nameEl.getAttribute('aria-label') : null;
        const url     = nameEl ? nameEl.href : null;
        const phoneEl = item.querySelector('[data-tooltip*="phone"], [aria-label*="phone"], [aria-label*="Phone"]');
        const phone   = phoneEl ? phoneEl.textContent?.trim() : null;
        const websiteEl = item.querySelector('a[data-value="Website"]');
        const website = websiteEl ? websiteEl.href : null;
        const ratingEl = item.querySelector('[role="img"][aria-label*="stars"]');
        const ratingMatch = ratingEl ? (ratingEl.getAttribute('aria-label') || '').match(/[\d.]+/) : null;
        const rating  = ratingMatch ? parseFloat(ratingMatch[0]) : null;
        const addrEl  = item.querySelector('span[class*="address"]') || item.querySelector('[data-tooltip*="Address"]');
        const address = addrEl ? addrEl.textContent?.trim() : null;
        const placeIdMatch = url ? url.match(/place\/([^\/]+)/) : null;
        const placeId = placeIdMatch ? placeIdMatch[1] : null;

        if (name) {
          bizList.push({ name, url, phone, website, address, rating, placeId });
        }
      });
      return bizList;
    });

    for (const biz of results) {
      if (!biz.name) continue;
      businesses.push({
        business_name:   biz.name,
        phone:           biz.phone || null,
        website:         biz.website || null,
        city,
        state,
        google_maps_url: biz.url || null,
        google_place_id: biz.placeId || null,
        rating:          biz.rating,
        source:          'google-maps-scraper',
        scraped_at:      new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn(`  Scrape failed for "${keyword}" in ${city}, ${state}: ${err.message}`);
  } finally {
    await page.close();
  }

  return businesses;
}

async function importBatch(businesses, category) {
  if (!businesses.length) return { imported: 0, skipped: 0 };

  try {
    const res = await fetch(`${API_URL}/api/scraper-import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-scraper-key': SCRAPER_KEY
      },
      body: JSON.stringify({
        rep_id:     REP_ID,
        businesses: businesses.map(b => ({ ...b, categories: [category] }))
      })
    });
    return await res.json();
  } catch (err) {
    console.error('  API import failed:', err.message);
    return { imported: 0, skipped: 0, error: err.message };
  }
}

async function main() {
  console.log('HomeServiceDirectory Google Maps Scraper');
  console.log('=========================================');
  console.log(`API URL:    ${API_URL}`);
  console.log(`Rep ID:     ${REP_ID}`);
  console.log(`Category:   ${FILTER_CAT || 'all'}`);
  console.log(`State:      ${FILTER_STATE || 'all'}`);
  console.log(`Max Cities: ${MAX_CITIES}`);
  console.log('');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const categories = FILTER_CAT
    ? [FILTER_CAT].filter(c => CATEGORY_KEYWORDS[c])
    : Object.keys(CATEGORY_KEYWORDS);

  const statesMap = FILTER_STATE
    ? { [FILTER_STATE.toUpperCase()]: CITY_TARGETS[FILTER_STATE.toUpperCase()] || ['major city'] }
    : CITY_TARGETS;

  let totalImported = 0;
  let totalSkipped  = 0;
  let citiesScraped = 0;
  const log = [];

  outerLoop:
  for (const [stateAbbr, cities] of Object.entries(statesMap)) {
    for (const city of cities) {
      if (citiesScraped >= MAX_CITIES) break outerLoop;

      for (const category of categories) {
        const keywords = CATEGORY_KEYWORDS[category];
        const keyword  = keywords[Math.floor(Math.random() * keywords.length)];

        console.log(`Scraping: ${keyword} in ${city}, ${stateAbbr}...`);
        const businesses = await scrapeGoogleMaps(browser, keyword, city, stateAbbr);
        console.log(`  Found ${businesses.length} businesses`);

        if (businesses.length) {
          const result = await importBatch(businesses, category);
          console.log(`  Imported: ${result.imported || 0}, Skipped: ${result.skipped || 0}`);
          totalImported += (result.imported || 0);
          totalSkipped  += (result.skipped  || 0);
          log.push({ city, state: stateAbbr, category, found: businesses.length, imported: result.imported || 0 });
        }

        await sleep(2000 + Math.random() * 2000); // polite delay
      }
      citiesScraped++;
    }
  }

  await browser.close();

  // Write output log
  const outputFile = path.join(OUTPUT_DIR, `run-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify({
    run_at:    new Date().toISOString(),
    rep_id:    REP_ID,
    category:  FILTER_CAT || 'all',
    state:     FILTER_STATE || 'all',
    cities:    citiesScraped,
    imported:  totalImported,
    skipped:   totalSkipped,
    details:   log
  }, null, 2));

  console.log('\n=========================================');
  console.log(`DONE: ${totalImported} imported, ${totalSkipped} skipped`);
  console.log(`Output: ${outputFile}`);
}

main().catch(err => { console.error('Fatal scraper error:', err); process.exit(1); });
