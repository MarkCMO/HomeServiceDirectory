// state-page.js - SSR state/category browse page
// Handles /{category}/{state} e.g. /plumbing/florida, /hvac/texas
// Returns full HTML with schema, breadcrumbs, city grid, cross-category links

const siteConfig = require('../../data/site-config.json');
const locations = require('../../data/us-locations.json');

const BRAND = siteConfig.brand.name;
const SITE_URL = siteConfig.brand.url;

exports.handler = async (event) => {
  const path = event.path.replace(/\/+$/, '').toLowerCase();
  const segments = path.split('/').filter(Boolean);

  // Expect exactly 2 segments: /{category}/{state}
  if (segments.length !== 2) {
    return { statusCode: 404, headers: { 'Content-Type': 'text/html' }, body: notFoundHtml() };
  }

  const [categorySlug, stateSlug] = segments;
  const category = siteConfig.categories[categorySlug];
  const stateData = locations.states[stateSlug];

  if (!category || !stateData) {
    return { statusCode: 404, headers: { 'Content-Type': 'text/html' }, body: notFoundHtml() };
  }

  const stateName = stateData.name;
  const stateAbbr = stateData.abbr;
  const cities = [...stateData.cities].sort((a, b) => a.name.localeCompare(b.name));
  const pageTitle = `${category.title} in ${stateName} | ${BRAND}`;
  const pageUrl = `${SITE_URL}/${categorySlug}/${stateSlug}`;
  const metaDesc = `Find trusted ${category.metaDesc} in ${stateName}. Browse ${cities.length} cities for licensed, verified ${category.shortTitle.toLowerCase()} professionals near you.`;

  // Other categories for cross-linking
  const otherCategories = Object.entries(siteConfig.categories)
    .filter(([slug]) => slug !== categorySlug)
    .map(([slug, cat]) => ({ slug, title: cat.title, emoji: cat.emoji }));

  // Schema.org @graph
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': pageUrl,
        url: pageUrl,
        name: pageTitle,
        description: metaDesc,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        breadcrumb: { '@id': `${pageUrl}#breadcrumb` }
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: BRAND,
        publisher: { '@id': `${SITE_URL}/#organization` }
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: BRAND,
        url: SITE_URL,
        logo: `${SITE_URL}${siteConfig.brand.logo}`
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${pageUrl}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: category.title, item: `${SITE_URL}/${categorySlug}` },
          { '@type': 'ListItem', position: 3, name: stateName, item: pageUrl }
        ]
      },
      {
        '@type': 'Service',
        name: `${category.title} in ${stateName}`,
        description: metaDesc,
        areaServed: {
          '@type': 'State',
          name: stateName,
          addressCountry: 'US'
        },
        provider: { '@id': `${SITE_URL}/#organization` },
        serviceType: category.title
      },
      {
        '@type': 'ItemList',
        name: `${category.title} Cities in ${stateName}`,
        numberOfItems: cities.length,
        itemListElement: cities.map((city, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `${category.title} in ${city.name}, ${stateAbbr}`,
          url: `${SITE_URL}/${categorySlug}/${stateSlug}/${city.slug}`
        }))
      }
    ]
  };

  // City grid HTML
  const cityCardsHtml = cities.map(city => {
    const cityUrl = `/${categorySlug}/${stateSlug}/${city.slug}`;
    return `<a href="${cityUrl}" class="city-card">
        <span class="city-name">${city.name}</span>
        <span class="city-pop">${city.pop ? city.pop.toLocaleString() + ' pop.' : ''}</span>
      </a>`;
  }).join('\n');

  // Cross-category links
  const crossLinksHtml = otherCategories.map(cat => {
    return `<a href="/${cat.slug}/${stateSlug}" class="cross-link">${cat.emoji} ${cat.title}</a>`;
  }).join('\n');

  // Subcategory tags
  const subcatTagsHtml = (category.subcategories || []).map(sub => {
    return `<span class="subcat-tag">${sub}</span>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="${pageUrl}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${SITE_URL}${siteConfig.seo.defaultOgImage}">
  <meta property="og:site_name" content="${BRAND}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(pageTitle)}">
  <meta name="twitter:description" content="${esc(metaDesc)}">
  <link rel="stylesheet" href="/shared.css">
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
  <style>
    .state-hero { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #fff; padding: 3rem 1.5rem; text-align: center; }
    .state-hero h1 { font-size: 2rem; margin: 0 0 0.5rem; }
    .state-hero .subtitle { color: #94a3b8; font-size: 1.1rem; }
    .breadcrumb { padding: 1rem 1.5rem; font-size: 0.85rem; color: #64748b; max-width: 1200px; margin: 0 auto; }
    .breadcrumb a { color: #3b82f6; text-decoration: none; }
    .breadcrumb a:hover { text-decoration: underline; }
    .breadcrumb .sep { margin: 0 0.4rem; color: #94a3b8; }

    .subcat-tags { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-top: 1.25rem; }
    .subcat-tag { background: rgba(255,255,255,0.1); color: #e2e8f0; padding: 0.3rem 0.75rem; border-radius: 999px; font-size: 0.8rem; }

    .section { max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; }
    .section-title { font-size: 1.4rem; font-weight: 700; margin-bottom: 1.5rem; color: #1e293b; }
    .city-count { color: #64748b; font-weight: 400; font-size: 1rem; }

    .city-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; }
    .city-card { display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 1rem; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; text-decoration: none; color: #1e293b; transition: border-color 0.15s, box-shadow 0.15s; }
    .city-card:hover { border-color: #3b82f6; box-shadow: 0 2px 8px rgba(59,130,246,0.1); }
    .city-name { font-weight: 600; }
    .city-pop { font-size: 0.78rem; color: #94a3b8; }

    .cross-section { background: #f8fafc; border-top: 1px solid #e2e8f0; }
    .cross-grid { display: flex; flex-wrap: wrap; gap: 0.6rem; }
    .cross-link { display: inline-block; padding: 0.5rem 1rem; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; text-decoration: none; color: #334155; font-size: 0.88rem; transition: border-color 0.15s; }
    .cross-link:hover { border-color: #3b82f6; color: #1e40af; }

    .cta-section { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #fff; text-align: center; padding: 3rem 1.5rem; }
    .cta-section h2 { font-size: 1.6rem; margin: 0 0 0.75rem; }
    .cta-section p { color: #fecaca; margin: 0 0 1.5rem; max-width: 600px; margin-left: auto; margin-right: auto; }
    .cta-btn { display: inline-block; padding: 0.85rem 2rem; background: #fff; color: #dc2626; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 1rem; transition: transform 0.15s; }
    .cta-btn:hover { transform: translateY(-1px); }
  </style>
</head>
<body>

  <nav class="breadcrumb">
    <a href="/">Home</a>
    <span class="sep">&rsaquo;</span>
    <a href="/${categorySlug}">${esc(category.title)}</a>
    <span class="sep">&rsaquo;</span>
    <span>${esc(stateName)}</span>
  </nav>

  <section class="state-hero">
    <h1>${category.emoji} ${esc(category.title)} in ${esc(stateName)}</h1>
    <p class="subtitle">Browse ${cities.length} cities for licensed ${esc(category.shortTitle.toLowerCase())} professionals in ${esc(stateAbbr)}</p>
    <div class="subcat-tags">
      ${subcatTagsHtml}
    </div>
  </section>

  <section class="section">
    <h2 class="section-title">${esc(category.title)} by City <span class="city-count">(${cities.length} cities)</span></h2>
    <div class="city-grid">
      ${cityCardsHtml}
    </div>
  </section>

  <section class="cross-section">
    <div class="section" style="padding-top:2rem;padding-bottom:2rem;">
      <h2 class="section-title">Browse Other Services in ${esc(stateName)}</h2>
      <div class="cross-grid">
        ${crossLinksHtml}
      </div>
    </div>
  </section>

  <section class="cta-section">
    <h2>Are You a ${esc(category.shortTitle)} Provider in ${esc(stateName)}?</h2>
    <p>Get exclusive leads from homeowners in your area. Join ${BRAND} and grow your business today.</p>
    <a href="/list-your-business" class="cta-btn">List Your Business</a>
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

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function notFoundHtml() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page Not Found | ${BRAND}</title><link rel="stylesheet" href="/shared.css"></head><body><div style="text-align:center;padding:4rem 1.5rem;"><h1>404 - Page Not Found</h1><p>The page you're looking for doesn't exist.</p><a href="/" style="color:#3b82f6;">Return Home</a></div><script src="/shared-layout.js"></script></body></html>`;
}
