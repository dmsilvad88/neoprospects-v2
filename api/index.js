// api/index.js
// Vercel serverless function — handles all API routes

const { searchLinkedIn } = require('./lib/search');
const { parseResults }   = require('./lib/parser');

// ── CORS helper ───────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  setCors(res);

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const path = req.url?.split('?')[0];

  // ── Health check ───────────────────────────────────────────────────────────
  if (path === '/api/health' || path === '/') {
    return res.status(200).json({ status: 'ok', version: '2.0.0' });
  }

  // ── POST /api/search ───────────────────────────────────────────────────────
  // Body: { company: string, keywords: string[], brOnly?: boolean }
  // Returns: { profiles: Profile[], query: string, count: number }
  if (path === '/api/search' && req.method === 'POST') {
    return handleSearch(req, res);
  }

  // ── POST /api/search/batch ─────────────────────────────────────────────────
  // Body: { companies: string[], keywords: string[], brOnly?: boolean }
  // Returns: { results: { [company]: Profile[] }, total: number }
  if (path === '/api/search/batch' && req.method === 'POST') {
    return handleBatchSearch(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
};

// ── Single company search ─────────────────────────────────────────────────────
async function handleSearch(req, res) {
  try {
    const body = await parseBody(req);
    const { company, keywords, brOnly = true } = body;

    if (!company)           return res.status(400).json({ error: 'company is required' });
    if (!keywords?.length)  return res.status(400).json({ error: 'keywords is required' });

    const raw      = await searchLinkedIn(company, keywords, brOnly);
    const profiles = parseResults(raw, [company], keywords);

    return res.status(200).json({
      company,
      profiles,
      count: profiles.length,
      raw_count: raw.length
    });

  } catch (err) {
    console.error('[search]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── Batch search across multiple companies ────────────────────────────────────
async function handleBatchSearch(req, res) {
  try {
    const body = await parseBody(req);
    const { companies, keywords, brOnly = true } = body;

    if (!companies?.length) return res.status(400).json({ error: 'companies is required' });
    if (!keywords?.length)  return res.status(400).json({ error: 'keywords is required' });

    const results = {};
    let total = 0;

    // Search companies sequentially with a small delay to be polite
    for (const company of companies) {
      try {
        const raw      = await searchLinkedIn(company, keywords, brOnly);
        const profiles = parseResults(raw, companies, keywords);
        results[company] = profiles;
        total += profiles.length;

        // Small delay between searches to avoid rate limiting
        if (companies.indexOf(company) < companies.length - 1) {
          await sleep(1200);
        }
      } catch (err) {
        console.error(`[batch] error for ${company}:`, err.message);
        results[company] = [];
      }
    }

    return res.status(200).json({ results, total, companies: companies.length });

  } catch (err) {
    console.error('[batch]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) return resolve(req.body); // already parsed (Vercel does this)
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
