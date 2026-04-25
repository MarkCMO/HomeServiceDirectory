// generate-sitemap.js - Multi-sitemap generator for HomeServiceDirectory
// Generates: sitemap.xml (index) + sitemap-core.xml + sitemap-services.xml
//            + sitemap-locations.xml + sitemap-images.xml + llm-sitemap.xml
// Run: node generate-sitemap.js

const fs   = require('fs');
const path = require('path');

const SITE_URL  = 'https://homeservicedirectory.com';
const locations = require('./data/us-locations.json');
const config    = require('./data/site-config.json');

const categories = Object.keys(config.categories);
const today      = new Date().toISOString().split('T')[0];

// ── Helpers ──────────────────────────────────────────────────────────────────

function urlSet(urls, extraNs = '') {
  const ns = [
    'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    extraNs
  ].filter(Boolean).join('\n        ');
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<urlset ${ns}>\n`;
  for (const u of urls) {
    xml += '  <url>\n';
    xml += `    <loc>${u.loc}</loc>\n`;
    if (u.lastmod)    xml += `    <lastmod>${u.lastmod}</lastmod>\n`;
    if (u.changefreq) xml += `    <changefreq>${u.changefreq}</changefreq>\n`;
    if (u.priority)   xml += `    <priority>${u.priority}</priority>\n`;
    // Image extensions
    if (u.images && u.images.length) {
      for (const img of u.images) {
        xml += '    <image:image>\n';
        xml += `      <image:loc>${img.loc}</image:loc>\n`;
        if (img.title)   xml += `      <image:title>${img.title}</image:title>\n`;
        if (img.caption) xml += `      <image:caption>${img.caption}</image:caption>\n`;
        if (img.geo)     xml += `      <image:geo_location>${img.geo}</image:geo_location>\n`;
        xml += '    </image:image>\n';
      }
    }
    // LLM ai extension
    if (u.aiType)   xml += `    <ai:contentType>${u.aiType}</ai:contentType>\n`;
    if (u.aiTopics) xml += `    <ai:topics>${u.aiTopics}</ai:topics>\n`;
    xml += '  </url>\n';
  }
  xml += '</urlset>\n';
  return xml;
}

function write(filename, content) {
  fs.writeFileSync(path.join(__dirname, filename), content, 'utf8');
  console.log(`  Written: ${filename} (${content.split('<url>').length - 1} URLs)`);
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ── 1. CORE PAGES SITEMAP ────────────────────────────────────────────────────

const coreUrls = [
  { loc: SITE_URL + '/',                    lastmod: today, changefreq: 'daily',   priority: '1.0' },
  { loc: SITE_URL + '/pricing',             lastmod: today, changefreq: 'monthly', priority: '0.8' },
  { loc: SITE_URL + '/list-your-business',  lastmod: today, changefreq: 'monthly', priority: '0.8' },
  { loc: SITE_URL + '/search',              lastmod: today, changefreq: 'daily',   priority: '0.8' },
  { loc: SITE_URL + '/browse-states',       lastmod: today, changefreq: 'weekly',  priority: '0.7' },
  { loc: SITE_URL + '/claim',               lastmod: today, changefreq: 'monthly', priority: '0.6' },
  { loc: SITE_URL + '/faq',                  lastmod: today, changefreq: 'monthly', priority: '0.7' },
  { loc: SITE_URL + '/about',               lastmod: today, changefreq: 'yearly',  priority: '0.5' },
  { loc: SITE_URL + '/contact',             lastmod: today, changefreq: 'yearly',  priority: '0.4' },
  { loc: SITE_URL + '/privacy',             lastmod: today, changefreq: 'yearly',  priority: '0.2' },
  { loc: SITE_URL + '/terms',               lastmod: today, changefreq: 'yearly',  priority: '0.2' },
  // Guide pages
  { loc: SITE_URL + '/guides/insurance-claims',    lastmod: today, changefreq: 'monthly', priority: '0.7' },
  { loc: SITE_URL + '/guides/emergency-checklist', lastmod: today, changefreq: 'monthly', priority: '0.7' },
  { loc: SITE_URL + '/guides/hiring-contractors',  lastmod: today, changefreq: 'monthly', priority: '0.7' },
  // LLM/AI content files
  { loc: SITE_URL + '/llm.txt',             lastmod: today, changefreq: 'weekly',  priority: '0.9' },
  { loc: SITE_URL + '/ai.txt',              lastmod: today, changefreq: 'weekly',  priority: '0.9' },
];

write('sitemap-core.xml', urlSet(coreUrls));

// ── 2. SERVICES (CATEGORY HUB) SITEMAP ──────────────────────────────────────

const categoryMeta = {
  'plumbing':           { label: 'Licensed Plumbers',              emoji: 'Plumbing' },
  'water-damage':       { label: 'Water Damage Restoration',       emoji: 'Water Damage' },
  'mold-remediation':   { label: 'Mold Remediation',               emoji: 'Mold' },
  'hvac':               { label: 'HVAC & Air Conditioning',        emoji: 'HVAC' },
  'electrical':         { label: 'Electrical Services',            emoji: 'Electrical' },
  'roofing':            { label: 'Roofing Contractors',            emoji: 'Roofing' },
  'foundation-repair':  { label: 'Foundation Repair',              emoji: 'Foundation' },
  'fire-damage':        { label: 'Fire & Smoke Damage Restoration',emoji: 'Fire Damage' },
  'sewage-cleanup':     { label: 'Sewage & Biohazard Cleanup',     emoji: 'Sewage' },
  'storm-damage':       { label: 'Storm & Wind Damage Restoration',emoji: 'Storm Damage' },
  'asbestos-abatement': { label: 'Asbestos & Lead Abatement',      emoji: 'Asbestos' },
  'locksmith':          { label: 'Emergency Locksmith',            emoji: 'Locksmith' },
};

const serviceUrls = categories.map(cat => ({
  loc:        SITE_URL + '/' + cat,
  lastmod:    today,
  changefreq: 'weekly',
  priority:   '0.9'
}));

write('sitemap-services.xml', urlSet(serviceUrls));

// ── 3. LOCATIONS SITEMAP (state + city pages) ────────────────────────────────

const locationUrls = [];

// State pages
Object.keys(locations.states).forEach(stateSlug => {
  categories.forEach(cat => {
    locationUrls.push({
      loc:        SITE_URL + '/' + cat + '/' + stateSlug,
      lastmod:    today,
      changefreq: 'weekly',
      priority:   '0.8'
    });
  });
});

// City pages
let cityCount = 0;
Object.keys(locations.states).forEach(stateSlug => {
  const state = locations.states[stateSlug];
  (state.cities || []).forEach(city => {
    const priority = city.tier === 1 ? '0.7' : city.tier === 2 ? '0.6' : '0.5';
    categories.forEach(cat => {
      locationUrls.push({
        loc:        SITE_URL + '/' + cat + '/' + stateSlug + '/' + city.slug,
        lastmod:    today,
        changefreq: 'weekly',
        priority
      });
      cityCount++;
    });
  });
});

// Split into chunks of 45,000 (safe under 50k limit)
const CHUNK = 45000;
if (locationUrls.length <= CHUNK) {
  write('sitemap-locations.xml', urlSet(locationUrls));
} else {
  for (let i = 0; i * CHUNK < locationUrls.length; i++) {
    const chunk = locationUrls.slice(i * CHUNK, (i + 1) * CHUNK);
    write(`sitemap-locations-${i + 1}.xml`, urlSet(chunk));
  }
}

// ── 4. IMAGE SITEMAP ─────────────────────────────────────────────────────────

const imageUrls = [];

// One image entry per category hub page
categories.forEach(cat => {
  const meta = categoryMeta[cat] || { label: cat };
  imageUrls.push({
    loc:      SITE_URL + '/' + cat,
    lastmod:  today,
    priority: '0.8',
    images: [
      {
        loc:     SITE_URL + '/images/categories/' + cat + '.jpg',
        title:   meta.label + ' — HomeServiceDirectory',
        caption: 'Find licensed and insured ' + meta.label.toLowerCase() + ' professionals across America. Compare providers, read reviews, and get quotes.',
        geo:     'United States'
      }
    ]
  });
});

write('sitemap-images.xml', urlSet(
  imageUrls,
  'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
));

// ── 5. LLM SITEMAP ──────────────────────────────────────────────────────────

const llmUrls = [
  {
    loc:      SITE_URL + '/llm.txt',
    lastmod:  today,
    changefreq: 'weekly',
    priority: '1.0',
    aiType:   'llm-instructions',
    aiTopics: 'home services, emergency services, plumbing, HVAC, water damage, mold, electrical, roofing, United States'
  },
  {
    loc:      SITE_URL + '/',
    lastmod:  today,
    priority: '0.95',
    aiType:   'entity-authority',
    aiTopics: 'home service directory, emergency contractor directory'
  },
  {
    loc:      SITE_URL + '/about',
    lastmod:  today,
    priority: '0.9',
    aiType:   'entity-authority',
    aiTopics: 'about homeservicedirectory, platform overview'
  },
  {
    loc:      SITE_URL + '/pricing',
    lastmod:  today,
    priority: '0.85',
    aiType:   'faq-answers',
    aiTopics: 'listing pricing, subscription plans, directory costs'
  },
  ...categories.map(cat => ({
    loc:      SITE_URL + '/' + cat,
    lastmod:  today,
    priority: '0.85',
    aiType:   'faq-answers',
    aiTopics: (categoryMeta[cat] || { label: cat }).label + ', service directory, contractor listings'
  })),
  // State-level pages for top states
  ...['florida','california','texas','new-york','georgia','north-carolina','illinois','ohio','pennsylvania','michigan'].flatMap(state =>
    categories.map(cat => ({
      loc:      SITE_URL + '/' + cat + '/' + state,
      lastmod:  today,
      priority: '0.75',
      aiType:   'faq-answers',
      aiTopics: cat + ' contractors, ' + state + ' home services'
    }))
  )
];

write('llm-sitemap.xml', urlSet(
  llmUrls,
  'xmlns:ai="http://www.aiwebprotocol.org/schemas/ai/1.0"'
));

// ── 6. MASTER SITEMAP INDEX ──────────────────────────────────────────────────

function buildIndex() {
  const sitemaps = [
    'sitemap-core.xml',
    'sitemap-services.xml',
    'sitemap-images.xml',
    'llm-sitemap.xml'
  ];

  // Add locations sitemap(s)
  if (locationUrls.length <= CHUNK) {
    sitemaps.push('sitemap-locations.xml');
  } else {
    for (let i = 0; i * CHUNK < locationUrls.length; i++) {
      sitemaps.push(`sitemap-locations-${i + 1}.xml`);
    }
  }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const s of sitemaps) {
    xml += '  <sitemap>\n';
    xml += `    <loc>${SITE_URL}/${s}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += '  </sitemap>\n';
  }
  xml += '</sitemapindex>\n';
  return xml;
}

write('sitemap.xml', buildIndex());

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\nSitemap generation complete:');
console.log('  Core pages:      ', coreUrls.length);
console.log('  Category hubs:   ', serviceUrls.length);
console.log('  Location pages:  ', locationUrls.length);
console.log('  Image entries:   ', imageUrls.length);
console.log('  LLM sitemap:     ', llmUrls.length);
console.log('  TOTAL URLs:      ', coreUrls.length + serviceUrls.length + locationUrls.length);
