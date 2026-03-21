// lib/search.js
// Uses Serper.dev Google Search API
// Free tier: 2,500 searches, no credit card needed
// Sign up at: https://serper.dev

const https = require('https');

/**
 * Search for LinkedIn profiles using Serper.dev (Google Search API)
 */
async function searchLinkedIn(company, keywords, brOnly = false, page = 1) {
  const kwPart = keywords.slice(0, 5).map(k => `"${k}"`).join(' OR ');
  let query = `site:linkedin.com/in "${company}" (${kwPart})`;
  if (brOnly) query += ' (Brasil OR Brazil OR "São Paulo" OR "Rio de Janeiro" OR "Minas Gerais" OR "Porto Alegre")';

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new Error('SERPER_API_KEY environment variable not set. Add it in Vercel → Settings → Environment Variables.');
  }

  return serperSearch(query, apiKey, page);
}

function serperSearch(query, apiKey, page = 1) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      q:    query,
      num:  10,
      page: page,
    });

    const options = {
      hostname: 'google.serper.dev',
      path:     '/search',
      method:   'POST',
      headers:  {
        'X-API-KEY':      apiKey,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          if (res.statusCode !== 200) {
            return reject(new Error(`Serper API error ${res.statusCode}: ${json?.message || data.slice(0,200)}`));
          }

          // Serper returns organic results in json.organic
          const organic = json?.organic || [];
          const results = organic
            .filter(r => /linkedin\.com\/in\//i.test(r.link))
            .map(r => ({
              url:     normalizeLinkedInUrl(r.link),
              title:   r.title   || '',
              snippet: r.snippet || ''
            }));

          resolve(results);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Search timeout')); });
    req.write(body);
    req.end();
  });
}

function normalizeLinkedInUrl(url) {
  const match = url.match(/linkedin\.com\/in\/([\w%-]+)/i);
  if (match) return `https://www.linkedin.com/in/${match[1]}`;
  return url;
}

module.exports = { searchLinkedIn };
