// lib/search.js
// Uses Brave Search API
// Free tier: 2,000 queries/month, no credit card needed
// Sign up at: https://brave.com/search/api/
// Env var required: BRAVE_SEARCH_KEY

const https = require('https');

/**
 * Search for LinkedIn profiles using Brave Search API
 */
async function searchLinkedIn(company, keywords, brOnly = false, page = 1) {
  const kwPart = keywords.slice(0, 5).map(k => `"${k}"`).join(' OR ');
  let query = `site:linkedin.com/in "${company}" (${kwPart})`;
  if (brOnly) query += ' (Brasil OR Brazil OR "São Paulo" OR "Rio de Janeiro" OR "Minas Gerais" OR "Porto Alegre")';

  const apiKey = process.env.BRAVE_SEARCH_KEY;
  if (!apiKey) {
    throw new Error('BRAVE_SEARCH_KEY environment variable not set. Add it in Vercel → Settings → Environment Variables.');
  }

  return braveSearch(query, apiKey, page);
}

function braveSearch(query, apiKey, page = 1) {
  return new Promise((resolve, reject) => {
    const offset = (page - 1) * 10;
    const params = new URLSearchParams({
      q:      query,
      count:  10,
      offset: offset,
    });

    const options = {
      hostname: 'api.search.brave.com',
      path:     `/res/v1/web/search?${params}`,
      method:   'GET',
      headers:  {
        'Accept':               'application/json',
        'Accept-Encoding':      'gzip',
        'X-Subscription-Token': apiKey,
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const raw  = Buffer.concat(chunks);
          const text = raw.toString('utf8');
          const json = JSON.parse(text);

          if (res.statusCode !== 200) {
            return reject(new Error(`Brave API error ${res.statusCode}: ${json?.message || text.slice(0, 200)}`));
          }

          const items = json?.web?.results || [];
          const results = items
            .filter(r => /linkedin\.com\/in\//i.test(r.url))
            .map(r => ({
              url:     normalizeLinkedInUrl(r.url),
              title:   r.title       || '',
              snippet: r.description || '',
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
