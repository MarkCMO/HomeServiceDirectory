// blobs.js - Shared Netlify Blobs helper with fallback auth
// Uses NETLIFY_BLOBS_CONTEXT if available (auto-injected by Netlify)
// Falls back to explicit siteID + NETLIFY_TOKEN (Personal Access Token)

const { getStore: _getStore } = require('@netlify/blobs');

// TODO: Replace with actual Netlify site ID after first deploy
const SITE_ID = 'fda10acc-bfb5-4397-8a85-79d6d2b39fce';

function getStore(name) {
  if (process.env.NETLIFY_BLOBS_CONTEXT) {
    return _getStore(name);
  }
  const token = process.env.NETLIFY_TOKEN;
  if (!token) {
    throw new Error('Neither NETLIFY_BLOBS_CONTEXT nor NETLIFY_TOKEN is set');
  }
  return _getStore({ name, siteID: SITE_ID, token });
}

module.exports = { getStore };
