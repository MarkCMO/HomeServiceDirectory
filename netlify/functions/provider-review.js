// provider-review.js - Submit and retrieve provider reviews
// POST /api/provider-review { slug, rating, name, serviceType, review }
// GET /api/provider-review?slug=xxx

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(), body: '' };

  const { getStore } = require('./blobs');

  if (event.httpMethod === 'GET') {
    const slug = (event.queryStringParameters || {}).slug;
    if (!slug) return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'slug required' }) };

    try {
      const reviewStore = getStore('provider-reviews');
      const reviews = await reviewStore.get(slug, { type: 'json' }).catch(() => []);
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(reviews || []) };
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Server error' }) };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const data = JSON.parse(event.body || '{}');
      if (!data.slug || !data.rating || !data.name) {
        return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'slug, rating, and name required' }) };
      }

      const review = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        rating: Math.min(Math.max(parseFloat(data.rating), 1), 5),
        name: String(data.name).trim().slice(0, 100),
        serviceType: String(data.serviceType || '').slice(0, 50),
        review: String(data.review || '').trim().slice(0, 2000),
        createdAt: new Date().toISOString()
      };

      const reviewStore = getStore('provider-reviews');
      const existing = await reviewStore.get(data.slug, { type: 'json' }).catch(() => []);
      const reviews = Array.isArray(existing) ? existing : [];
      reviews.unshift(review);
      await reviewStore.setJSON(data.slug, reviews);

      // Update listing rating
      try {
        const listingStore = getStore('provider-listings');
        const listing = await listingStore.get(data.slug, { type: 'json' }).catch(() => null);
        if (listing) {
          const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
          listing.rating = Math.round((totalRating / reviews.length) * 10) / 10;
          listing.reviewCount = reviews.length;
          await listingStore.setJSON(data.slug, listing);
        }
      } catch (e) { console.log('Rating update failed:', e.message); }

      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ message: 'Review submitted.', review }) };
    } catch (err) {
      console.error('provider-review error:', err);
      return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'Server error' }) };
    }
  }

  return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) };
};

function corsHeaders() {
  return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
}
