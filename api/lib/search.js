// lib/search.js
// Uses Google Custom Search API (CSE)
// Free tier: 100 queries/day, resets daily — no credit card needed
// Setup: https://developers.google.com/custom-search/v1/overview
// 1. Create a CSE at https://programmablesearchengine.google.com
//    - Add www.linkedin.com/in/* as the site to search
// 2. Get an API key at https://console.cloud.google.com → Custom Search API
// Env vars required: GOOGLE_CSE_KEY, GOOGLE_CSE_ID

const https = require('https');

/**
 * Search for LinkedIn profiles using Google Custom Search API
 */
async function searchLinkedIn(company, keywords, brOnly = false, page = 1) {
  const kwPart = keywords.slice(0, 5).map(k => `"${k}"`).join(' OR ');
  // No site: prefix needed — CSE is restricted to www.linkedin.com/in/*
  let query = `"${company}" (${kwPart})`;
  if (brOnly) query += ' (Brasil OR Brazil OR "São Paulo" OR "Rio de Janeiro" OR "Minas Gerais" OR "Porto Alegre")';

  const apiKey = process.env.GOOGLE_CSE_KEY;
  const cseId  = process.env.GOOGLE_CSE_ID;

  if (!apiKey) throw new Error('GOOGLE_CSE_KEY environment variable not set. Add it in Vercel → Settings → Environment Variables.');
  if (!cseId)  throw new Error('GOOGLE_CSE_ID environment variable not set. Add it in Vercel → Settings → Environment Variables.');

  return googleSearch(query, apiKey, cseId, page);
}

function googleSearch(query, apiKey, cseId, page = 1) {
  return new Promise((resolve, reject) => {
    // Google CSE uses 1-based `start` index: page 1 = 1, page 2 = 11, etc.
    const start = (page - 1) * 10 + 1;
    const params = new URLSearchParams({
      key:   apiKey,
      cx:    cseId,
      q:     query,
      num:   10,
      start: start,
    });

    const options = {
      hostname: 'www.googleapis.com',
      path:     `/customsearch/v1?${params}`,
      method:   'GET',
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (res.statusCode !== 200) {
            return reject(new Error(`Google CSE error ${res.statusCode}: ${json?.error?.message || data.slice(0, 200)}`));
          }

          const items = json?.items || [];
          const results = items
            .filter(r => /linkedin\.com\/in\//i.test(r.link))
            .map(r => ({
              url:     normalizeLinkedInUrl(r.link),
              title:   r.title   || '',
              snippet: r.snippet || '',
            }));

          resolve(results);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Search timeout')); });
    req.end();
  });
}

function normalizeLinkedInUrl(url) {
  const match = url.match(/linkedin\.com\/in\/([\w%-]+)/i);
  if (match) return `https://www.linkedin.com/in/${match[1]}`;
  return url;
}

module.exports = { searchLinkedIn };
