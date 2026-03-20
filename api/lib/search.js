// lib/search.js
// Queries DuckDuckGo with site:linkedin.com/in dorks
// Returns raw search result objects with title, snippet, url

const https = require('https');

/**
 * Search DuckDuckGo for LinkedIn profiles
 * @param {string} company
 * @param {string[]} keywords
 * @param {boolean} brOnly - restrict to Brazil
 * @returns {Promise<Array>} raw results
 */
async function searchLinkedIn(company, keywords, brOnly = true) {
  // Build the dork query
  const kwPart = keywords.slice(0, 5).map(k => `"${k}"`).join(' OR ');
  let query = `site:linkedin.com/in "${company}" (${kwPart})`;
  if (brOnly) query += ' Brasil OR Brazil OR "São Paulo" OR "Rio de Janeiro"';

  const results = await duckDuckGoSearch(query);
  return results;
}

/**
 * Fetch DuckDuckGo HTML search results and parse them
 * DDG HTML endpoint: https://html.duckduckgo.com/html/?q=...
 */
function duckDuckGoSearch(query) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    const options = {
      hostname: 'html.duckduckgo.com',
      path: `/html/?q=${encoded}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const results = parseDDGResults(data);
          resolve(results);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Search timeout'));
    });
    req.end();
  });
}

/**
 * Parse DDG HTML response to extract result title, url, snippet
 * DDG HTML structure:
 *   <div class="result">
 *     <h2 class="result__title"><a class="result__a" href="...">title</a></h2>
 *     <a class="result__snippet">snippet text</a>
 *   </div>
 */
function parseDDGResults(html) {
  const results = [];

  // Extract result blocks
  const resultBlockRe = /<div[^>]+class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  
  // Simpler approach: extract all result links and snippets
  // Match: <a class="result__a" href="...">title</a>
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  const links = [];
  const snippets = [];

  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const url = decodeURIComponent(m[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, ''));
    const title = stripHtml(m[2]);
    links.push({ url, title });
  }

  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(stripHtml(m[1]));
  }

  // Pair links with snippets
  for (let i = 0; i < links.length; i++) {
    const { url, title } = links[i];
    // Only include actual LinkedIn profile URLs
    if (/linkedin\.com\/in\//i.test(url)) {
      results.push({
        url: normalizeLinkedInUrl(url),
        title,
        snippet: snippets[i] || ''
      });
    }
  }

  return results;
}

function stripHtml(str) {
  return str
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLinkedInUrl(url) {
  // Handle DDG redirect URLs
  if (url.includes('duckduckgo.com')) {
    const match = url.match(/uddg=([^&]+)/);
    if (match) url = decodeURIComponent(match[1]);
  }
  // Normalize to clean profile URL
  const match = url.match(/linkedin\.com\/in\/([\w%-]+)/i);
  if (match) return `https://www.linkedin.com/in/${match[1]}`;
  return url;
}

module.exports = { searchLinkedIn };
