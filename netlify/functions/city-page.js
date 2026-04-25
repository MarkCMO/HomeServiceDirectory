// city-page.js - Server-rendered city/category landing pages
// URL pattern: /:category/:state/:city -> e.g. /plumbing/florida/miami
// Full @graph schema: WebPage + WebSite + Organization + BreadcrumbList + Service + FAQPage + GeoCoordinates
// Content variation: 25+ template pools for unique content per page
// Minimum 350 words unique body content per page

const path = require('path');
const { generateCityContent } = require(path.join(__dirname, '..', '..', 'data', 'content-variations'));

// Load data files
let LOCATIONS, SITE_CONFIG;
try {
  LOCATIONS = require(path.join(__dirname, '..', '..', 'data', 'us-locations.json'));
  SITE_CONFIG = require(path.join(__dirname, '..', '..', 'data', 'site-config.json'));
} catch (e) {
  console.error('Data file load error:', e.message);
}

const CATEGORIES = SITE_CONFIG ? SITE_CONFIG.categories : {
  'plumbing': { title: 'Plumbing', shortTitle: 'Plumbing', emoji: '\uD83D\uDD27', metaDesc: 'emergency plumbers, drain cleaning, pipe repair, water heater, and leak detection services' },
  'water-damage': { title: 'Water Damage Restoration', shortTitle: 'Water Damage', emoji: '\uD83D\uDCA7', metaDesc: 'emergency water removal, flood cleanup, basement flooding, and water damage restoration services' },
  'mold-remediation': { title: 'Mold Remediation', shortTitle: 'Mold', emoji: '\uD83E\uDDA0', metaDesc: 'mold inspection, mold removal, mold testing, black mold, and crawl space mold remediation' },
  'hvac': { title: 'HVAC & Air Conditioning', shortTitle: 'HVAC', emoji: '\u2744\uFE0F', metaDesc: 'AC repair, heating repair, duct cleaning, HVAC installation, and indoor air quality services' },
  'electrical': { title: 'Electrical Services', shortTitle: 'Electrical', emoji: '\u26A1', metaDesc: 'emergency electricians, panel upgrades, wiring repair, outlet installation, and generator services' },
  'roofing': { title: 'Roofing & Roof Repair', shortTitle: 'Roofing', emoji: '\uD83C\uDFE0', metaDesc: 'emergency roof repair, roof replacement, leak repair, storm damage roofing, and gutter services' },
  'foundation-repair': { title: 'Foundation Repair', shortTitle: 'Foundation', emoji: '\uD83C\uDFD7\uFE0F', metaDesc: 'foundation repair, basement waterproofing, crawl space encapsulation, concrete leveling, and structural engineering' },
  'fire-damage': { title: 'Fire & Smoke Damage', shortTitle: 'Fire Damage', emoji: '\uD83D\uDD25', metaDesc: 'fire damage restoration, smoke damage cleanup, soot removal, and emergency board-up services' },
  'sewage-cleanup': { title: 'Sewage & Biohazard Cleanup', shortTitle: 'Sewage', emoji: '\u2623\uFE0F', metaDesc: 'sewage cleanup, biohazard remediation, septic overflow, and contamination services' },
  'storm-damage': { title: 'Storm & Wind Damage', shortTitle: 'Storm', emoji: '\uD83C\uDF2A\uFE0F', metaDesc: 'storm damage repair, wind damage, hail damage, hurricane cleanup, and emergency tarping services' },
  'asbestos-abatement': { title: 'Asbestos & Lead Abatement', shortTitle: 'Asbestos', emoji: '\u26A0\uFE0F', metaDesc: 'asbestos removal, lead paint abatement, radon mitigation, environmental testing, and hazardous material services' },
  'locksmith': { title: 'Emergency Locksmith', shortTitle: 'Locksmith', emoji: '\uD83D\uDD11', metaDesc: 'emergency locksmith, lockout service, lock repair, rekeying, and security system installation' }
};

// Categories that offer 24/7 emergency service
const EMERGENCY_CATEGORIES = [
  'plumbing', 'water-damage', 'fire-damage', 'sewage-cleanup',
  'storm-damage', 'locksmith', 'electrical'
];

function titleCase(str) {
  return str.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getCityData(stateSlug, citySlug) {
  if (!LOCATIONS || !LOCATIONS.states || !LOCATIONS.states[stateSlug]) return null;
  const stateObj = LOCATIONS.states[stateSlug];
  return stateObj.cities ? stateObj.cities.find(c => c.slug === citySlug) || null : null;
}

function getStateData(stateSlug) {
  if (!LOCATIONS || !LOCATIONS.states || !LOCATIONS.states[stateSlug]) return null;
  return LOCATIONS.states[stateSlug];
}

function getStateAbbr(stateSlug) {
  if (LOCATIONS && LOCATIONS.states && LOCATIONS.states[stateSlug]) {
    return LOCATIONS.states[stateSlug].abbr || '';
  }
  const map = { 'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA','colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA','hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','new-hampshire':'NH','new-jersey':'NJ','new-mexico':'NM','new-york':'NY','north-carolina':'NC','north-dakota':'ND','ohio':'OH','oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode-island':'RI','south-carolina':'SC','south-dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT','virginia':'VA','washington':'WA','west-virginia':'WV','wisconsin':'WI','wyoming':'WY' };
  return map[stateSlug] || '';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJson(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

exports.handler = async (event) => {
  const urlPath = event.path || event.rawUrl || '';
  const parts = urlPath.split('/').filter(Boolean);

  if (parts.length < 3) {
    return { statusCode: 404, body: 'Not found' };
  }

  const categorySlug = parts[0];
  const stateSlug = parts[1];
  const citySlug = parts[2];

  const category = CATEGORIES[categorySlug];
  if (!category) {
    return { statusCode: 404, body: 'Category not found' };
  }

  const city = titleCase(citySlug);
  const state = titleCase(stateSlug);
  const stateAbbr = getStateAbbr(stateSlug);
  const pageTitle = `${category.title} in ${city}, ${state}`;
  const canonicalUrl = `https://homeservicedirectory.com/${categorySlug}/${stateSlug}/${citySlug}`;
  const desc = category.metaDesc || category.title.toLowerCase();
  const isEmergency = EMERGENCY_CATEGORIES.includes(categorySlug);

  // Get geo + state data
  const cityData = getCityData(stateSlug, citySlug);
  const stateData = getStateData(stateSlug);

  // Generate varied content
  const content = generateCityContent(city, state, categorySlug, category, stateData, cityData);

  // Build FAQ schema items
  const faqSchemaItems = content.faqs.map(faq => `{
          "@type": "Question",
          "name": "${escapeJson(faq.q)}",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "${escapeJson(faq.a)}"
          }
        }`).join(',\n        ');

  // Build FAQ HTML
  const faqHTML = content.faqs.map(faq => `
          <details class="faq-item" style="border:1px solid var(--light-gray);border-radius:var(--radius);padding:16px 20px;margin-bottom:8px;">
            <summary style="font-weight:600;font-size:0.95rem;cursor:pointer;color:var(--navy);">${faq.q}</summary>
            <p style="color:var(--dark-gray);line-height:1.7;margin-top:12px;font-size:0.92rem;">${faq.a}</p>
          </details>`).join('');

  // Build tips HTML
  const tipsHTML = content.tips.map(tip => `
            <div style="background:var(--white);border:1px solid var(--light-gray);border-radius:var(--radius);padding:20px;">
              <h4 style="font-size:0.95rem;font-weight:700;color:var(--navy);margin-bottom:8px;">${tip.title}</h4>
              <p style="color:var(--dark-gray);font-size:0.88rem;line-height:1.6;">${tip.text}</p>
            </div>`).join('');

  // Geo data for schema
  const lat = cityData ? cityData.lat : '';
  const lng = cityData ? cityData.lng : '';

  // Build related categories (other categories in same city)
  const relatedCategories = Object.entries(CATEGORIES)
    .filter(([slug]) => slug !== categorySlug)
    .map(([slug, cat]) => `
          <a href="/${slug}/${stateSlug}/${citySlug}" class="category-card" style="text-align:left;padding:16px;display:block;">
            <span style="font-size:1.4rem;display:block;margin-bottom:4px;">${cat.emoji}</span>
            <h3 style="font-size:0.88rem;font-weight:700;color:var(--navy);">${cat.shortTitle || cat.title}</h3>
          </a>`).join('');

  // Build subcategory badges
  const subcategoryBadges = (category.subcategories || []).map(sub =>
    `<span style="display:inline-block;padding:4px 12px;background:rgba(255,255,255,0.15);border-radius:20px;font-size:0.78rem;color:var(--white);border:1px solid rgba(255,255,255,0.25);">${sub}</span>`
  ).join(' ');

  // Build @graph JSON-LD
  const schemaGraph = `{
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": "${canonicalUrl}#webpage",
        "url": "${canonicalUrl}",
        "name": "${escapeJson(pageTitle)} | HomeServiceDirectory",
        "description": "Find ${escapeJson(desc)} in ${city}, ${state}. Licensed, insured contractors with verified reviews and Trust Scores.",
        "isPartOf": { "@id": "https://homeservicedirectory.com/#website" },
        "breadcrumb": { "@id": "${canonicalUrl}#breadcrumb" },
        "inLanguage": "en-US"
      },
      {
        "@type": "WebSite",
        "@id": "https://homeservicedirectory.com/#website",
        "url": "https://homeservicedirectory.com/",
        "name": "HomeServiceDirectory",
        "description": "America's Emergency Home Service Directory",
        "publisher": { "@id": "https://homeservicedirectory.com/#organization" },
        "inLanguage": "en-US"
      },
      {
        "@type": "Organization",
        "@id": "https://homeservicedirectory.com/#organization",
        "name": "HomeServiceDirectory",
        "url": "https://homeservicedirectory.com/",
        "logo": {
          "@type": "ImageObject",
          "url": "https://homeservicedirectory.com/images/logo.png"
        },
        "founder": {
          "@type": "Person",
          "name": "Mark Gabrielli",
          "url": "https://markcmo.com"
        },
        "foundingDate": "2026",
        "sameAs": []
      },
      {
        "@type": "BreadcrumbList",
        "@id": "${canonicalUrl}#breadcrumb",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://homeservicedirectory.com/" },
          { "@type": "ListItem", "position": 2, "name": "${escapeJson(category.title)}", "item": "https://homeservicedirectory.com/${categorySlug}" },
          { "@type": "ListItem", "position": 3, "name": "${escapeJson(state)}", "item": "https://homeservicedirectory.com/${categorySlug}/${stateSlug}" },
          { "@type": "ListItem", "position": 4, "name": "${escapeJson(city)}" }
        ]
      },
      {
        "@type": "Service",
        "@id": "${canonicalUrl}#service",
        "name": "${escapeJson(pageTitle)}",
        "description": "Find and compare licensed ${escapeJson(desc)} providers in ${city}, ${state}",
        "provider": { "@id": "https://homeservicedirectory.com/#organization" },
        "serviceType": "${escapeJson(category.title)}",
        "areaServed": {
          "@type": "City",
          "name": "${city}",
          "containedInPlace": {
            "@type": "State",
            "name": "${state}"
          }${lat ? `,
          "geo": {
            "@type": "GeoCoordinates",
            "latitude": ${lat},
            "longitude": ${lng}
          }` : ''}
        }
      },
      {
        "@type": "FAQPage",
        "@id": "${canonicalUrl}#faqpage",
        "mainEntity": [
          ${faqSchemaItems}
        ]
      }${lat ? `,
      {
        "@type": "Place",
        "@id": "${canonicalUrl}#place",
        "name": "${city}, ${state}",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "${city}",
          "addressRegion": "${stateAbbr}",
          "addressCountry": "US"
        },
        "geo": {
          "@type": "GeoCoordinates",
          "latitude": ${lat},
          "longitude": ${lng}
        }
      }` : ''}
    ]
  }`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)} | HomeServiceDirectory</title>
  <meta name="description" content="Find ${escapeHtml(desc)} in ${city}, ${state}. Licensed, insured contractors with verified reviews and Trust Scores.">
  <meta name="robots" content="index, follow">
  <meta name="geo.region" content="US-${stateAbbr}">
  <meta name="geo.placename" content="${city}, ${state}">
  ${lat ? `<meta name="geo.position" content="${lat};${lng}">
  <meta name="ICBM" content="${lat}, ${lng}">` : ''}
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:title" content="${escapeHtml(pageTitle)} | HomeServiceDirectory">
  <meta property="og:description" content="Find ${escapeHtml(desc)} in ${city}, ${state}. Licensed, insured contractors with verified reviews.">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="HomeServiceDirectory">
  <meta property="og:image" content="https://homeservicedirectory.com/images/og-default.png">
  <script type="application/ld+json">
  ${schemaGraph}
  </script>
  <link rel="stylesheet" href="/shared.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
</head>
<body>
  <script src="/shared-layout.js"></script>

  <section class="directory-hero">
    <div class="container">
      <nav aria-label="Breadcrumb" style="font-size:0.82rem;margin-bottom:12px;">
        <a href="/" style="color:var(--ice);">Home</a>
        <span style="color:var(--mid-gray);margin:0 6px;">/</span>
        <a href="/${categorySlug}" style="color:var(--ice);">${category.title}</a>
        <span style="color:var(--mid-gray);margin:0 6px;">/</span>
        <a href="/${categorySlug}/${stateSlug}" style="color:var(--ice);">${state}</a>
        <span style="color:var(--mid-gray);margin:0 6px;">/</span>
        <span style="color:var(--white);">${city}</span>
      </nav>
      ${isEmergency ? '<div style="display:inline-block;background:#dc2626;color:white;padding:4px 14px;border-radius:20px;font-size:0.78rem;font-weight:700;margin-bottom:12px;letter-spacing:0.02em;">24/7 EMERGENCY SERVICE</div>' : ''}
      <h1>${category.emoji} ${category.title} in ${city}, ${state}${stateAbbr ? ` (${stateAbbr})` : ''}</h1>
      <p>Find licensed, insured ${desc} providers in ${city}, ${state}. Verified credentials. Real reviews. Trust Scores.</p>
      ${subcategoryBadges ? `<div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:6px;">${subcategoryBadges}</div>` : ''}
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-heading">
        <h2>${category.title} Providers in <span>${city}</span></h2>
        <p>Licensed contractors serving ${city}, ${state}. Verified by HomeServiceDirectory.</p>
      </div>

      <div id="listings" style="padding:20px 0;">
        <p style="text-align:center;color:var(--mid-gray);">Loading providers...</p>
      </div>
      <div id="listings-cta" style="display:none;text-align:center;margin-top:24px;">
        <a href="/list-your-business" class="btn btn-primary">List Your Business - Free</a>
      </div>
    </div>
  </section>

  <script>
  (function() {
    var cat = '${categorySlug}';
    var state = '${stateSlug}';
    var city = '${citySlug}';
    fetch('/api/approved-listings?category=' + cat + '&state=' + state + '&city=' + city + '&limit=24')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var el = document.getElementById('listings');
        var cta = document.getElementById('listings-cta');
        if (!data.listings || data.listings.length === 0) {
          el.innerHTML = '<div style="background:var(--white);border-radius:16px;padding:48px;border:1px solid #e5e7eb;max-width:600px;margin:0 auto;text-align:center;">' +
            '<h3 style="font-size:1.3rem;font-weight:700;margin-bottom:12px;">Be the First ${category.title} Provider Listed in ${city}</h3>' +
            '<p style="color:#6b7280;margin-bottom:24px;">We are building the most comprehensive ${category.title.toLowerCase()} directory in ${state}. List your business for free and start receiving exclusive leads.</p>' +
            '<a href="/list-your-business" class="btn btn-primary">List Your Business - Free</a></div>';
          return;
        }
        var html = '<div class="grid-2" style="gap:16px;">';
        data.listings.forEach(function(l) {
          var stars = '';
          for (var i = 0; i < 5; i++) stars += i < Math.round(l.rating) ? '&#9733;' : '&#9734;';
          var badges = (l.serviceTypes || l.subcategories || []).slice(0, 3).map(function(t) {
            return '<span style="display:inline-block;padding:2px 8px;background:#f0f4f8;border-radius:4px;font-size:0.72rem;color:#334155;">' + t + '</span>';
          }).join(' ');
          var emergency = l.emergency247 ? '<span style="display:inline-block;padding:2px 8px;background:#dc2626;border-radius:4px;font-size:0.68rem;color:white;font-weight:700;">24/7</span> ' : '';
          html += '<a href="/listing/' + l.slug + '" class="category-card" style="text-align:left;padding:20px;display:block;">' +
            '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">' +
            '<h3 style="font-size:1rem;font-weight:700;color:#0f172a;">' + l.name + '</h3>' +
            (l.plan === 'elite' || l.plan === 'sponsor' ? '<span style="background:#22c55e;color:white;padding:2px 8px;border-radius:10px;font-size:0.68rem;font-weight:700;">&#x2713; VERIFIED</span>' : l.plan === 'premium' ? '<span style="background:#e8722a;color:white;padding:2px 8px;border-radius:10px;font-size:0.68rem;font-weight:700;">FEATURED</span>' : '') +
            '</div>' +
            '<p style="font-size:0.85rem;color:#6b7280;margin-bottom:8px;">' + l.city + ', ' + l.state + (l.responseTime ? ' &bull; ' + l.responseTime : '') + '</p>' +
            '<div style="color:#f59e0b;font-size:0.85rem;margin-bottom:8px;">' + stars + ' <span style="color:#6b7280;">(' + (l.reviewCount || 0) + ')</span></div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">' + emergency + badges + '</div>' +
            (l.trustScore ? '<p style="font-size:0.82rem;color:#6b7280;">Trust Score: <strong style="color:#0f172a;">' + l.trustScore + '/100</strong></p>' : '') +
            '</a>';
        });
        html += '</div>';
        if (data.total > 0) {
          html += '<p style="text-align:center;margin-top:16px;font-size:0.88rem;color:#6b7280;">' + data.total + ' providers found</p>';
        }
        el.innerHTML = html;
        if (cta) cta.style.display = 'block';
      })
      .catch(function() {
        document.getElementById('listings').innerHTML = '<p style="text-align:center;color:#6b7280;">Unable to load listings. <a href="/search?category=' + cat + '&state=' + state + '" style="color:var(--sky);">Try search</a></p>';
      });
  })();
  </script>

  <section class="section section-alt">
    <div class="container">
      <div style="max-width:800px;margin:0 auto;">
        <h2 style="font-size:1.5rem;font-weight:800;margin-bottom:20px;">${category.title} in ${city}, ${state}${stateAbbr ? ' (' + stateAbbr + ')' : ''}</h2>
        <p style="color:var(--dark-gray);line-height:1.8;margin-bottom:16px;">${content.opening}</p>
        ${content.popContext ? `<p style="color:var(--dark-gray);line-height:1.8;margin-bottom:16px;">${content.popContext}</p>` : ''}
        ${content.stateContext ? `<p style="color:var(--dark-gray);line-height:1.8;margin-bottom:16px;">${content.stateContext}</p>` : ''}
        <p style="color:var(--dark-gray);line-height:1.8;margin-bottom:16px;">${content.valueProp}</p>

        <h3 style="font-size:1.2rem;font-weight:700;margin:32px 0 16px;">Tips for ${city} Homeowners</h3>
        <div style="display:grid;gap:12px;">
          ${tipsHTML}
        </div>

        <p style="color:var(--dark-gray);line-height:1.8;margin-top:24px;">${content.closing}</p>

        <div style="text-align:center;margin-top:32px;">
          <a href="/list-your-business" class="btn btn-primary">List Your ${category.shortTitle || category.title} Business - Free</a>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-heading">
        <h2>${category.title} FAQ - <span>${city}, ${state}</span></h2>
        <p>Common questions about ${category.title.toLowerCase()} in ${city}.</p>
      </div>
      <div style="max-width:800px;margin:0 auto;">
        ${faqHTML}
      </div>
    </div>
  </section>

  <section class="section section-alt">
    <div class="container">
      <div class="section-heading">
        <h2>Other Home Services in <span>${city}, ${state}</span></h2>
        <p>Browse all home service categories available in ${city}.</p>
      </div>
      <div class="grid-4" style="gap:12px;">
        ${relatedCategories}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="section-heading">
        <h2>More ${category.title} in <span>${state}</span></h2>
        <p><a href="/${categorySlug}/${stateSlug}" style="color:var(--sky);">Browse all ${category.title.toLowerCase()} providers in ${state} &rarr;</a></p>
      </div>
    </div>
  </section>

  <section class="cta-section">
    <div class="container">
      <h2>Provide ${category.title} in ${city}?</h2>
      <p>Get listed for free and start receiving exclusive leads from homeowners in ${city}, ${state} who need your services.</p>
      <a href="/list-your-business" class="btn btn-primary btn-lg">List Your Business - Free</a>
    </div>
  </section>

  <script src="/shared-layout.js"></script>
</body>
</html>`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400'
    },
    body: html
  };
};
