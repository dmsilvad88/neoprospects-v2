// lib/search.js
// Uses Bing Web Search API (Azure)
// Free tier: 1,000 queries/month (F1), resets monthly — no credit card needed
// Setup: portal.azure.com → Create resource → "Bing Search v7" → F1 tier
// Env var required: BING_SEARCH_KEY

const https = require('https');

/**
 * Search for LinkedIn profiles using Bing Web Search API
 */
async function searchLinkedIn(company, keywords, brOnly = false, page = 1) {
  const kwPart = keywords.slice(0, 5).map(k => `"${k}"`).join(' OR ');
  let query = `site:linkedin.com/in "${company}" (${kwPart})`;
  if (brOnly) query += ' (Brasil OR Brazil OR "São Paulo" OR "Rio de Janeiro" OR "Minas Gerais" OR "Porto Alegre")';

  const apiKey = process.env.BING_SEARCH_KEY;
  if (!apiKey) {
    throw new Error('BING_SEARCH_KEY environment variable not set. Add it in Vercel → Settings → Environment Variables.');
  }

  return bingSearch(query, apiKey, page);
}

function bingSearch(query, apiKey, page = 1) {
  return new Promise((resolve, reject) => {
    const offset = (page - 1) * 10;
    const params = new URLSearchParams({
      q:      query,
      count:  10,
      offset: offset,
    });

    const options = {
      hostname: 'api.bing.microsoft.com',
      path:     `/v7.0/search?${params}`,
      method:   'GET',
      headers:  {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (res.statusCode !== 200) {
            return reject(new Error(`Bing API error ${res.statusCode}: ${json?.error?.message || data.slice(0, 200)}`));
          }

          const items = json?.webPages?.value || [];
          const results = items
            .filter(r => /linkedin\.com\/in\//i.test(r.url))
            .map(r => ({
              url:     normalizeLinkedInUrl(r.url),
              title:   r.name    || '',
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
