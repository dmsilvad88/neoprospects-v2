// lib/parser.js
// Extracts structured LinkedIn profile data from DuckDuckGo search results
// Input: raw DDG result {url, title, snippet}
// Output: {name, title, company, url, location, matched}

const CONNECTORS = new Set(['de','da','do','dos','das','di','du','e','y','van','von','del','den','der','el']);

/**
 * Parse an array of DDG results into structured profile objects
 * @param {Array} results - raw DDG results [{url, title, snippet}]
 * @param {string[]} companies
 * @param {string[]} keywords
 * @returns {Array} structured profiles
 */
function parseResults(results, companies, keywords) {
  const cosLower = companies.map(c => ({ orig: c, low: c.toLowerCase() }));
  const kwsLower = keywords.map(k => k.toLowerCase());

  const profiles = results
    .map(r => parseResult(r, cosLower, kwsLower))
    .filter(p => p && p.name);

  // Deduplicate by normalised name
  const seen = new Set();
  return profiles.filter(p => {
    const key = normKey(p.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Parse a single DDG result into a profile
 *
 * DDG title formats for LinkedIn results:
 *   "Name - Title | Company"
 *   "Name - Title at Company"
 *   "Name - Title na Company"
 *   "Name | Title | Company"
 *   "Name - Company"
 *
 * DDG snippet formats:
 *   "Location · Title · Company"
 *   "City, State, Country. Title. Description..."
 *   "N followers · Title · Company"
 */
function parseResult(result, cosLower, kwsLower) {
  const { url, title, snippet } = result;

  // ── Parse title ───────────────────────────────────────────────────────────
  let name = '', jobTitle = '', company = '';

  // Pattern 1: "Name - Title | Company" or "Name - Title @ Company"
  const p1 = title.match(/^(.+?)\s*[-–]\s*(.+?)\s*[\|@]\s*(.+)$/);
  if (p1 && isName(p1[1])) {
    name    = cleanName(p1[1]);
    jobTitle = p1[2].trim();
    company = p1[3].split(/[·•\|]/)[0].trim();
  }

  // Pattern 2: "Name - Title na/at/em Company"
  if (!name) {
    const p2 = title.match(/^(.+?)\s*[-–]\s*(.+?)\s+(?:na|at|em|@)\s+(.+)$/i);
    if (p2 && isName(p2[1])) {
      name    = cleanName(p2[1]);
      jobTitle = p2[2].trim();
      company = p2[3].split(/[·•]/)[0].trim();
    }
  }

  // Pattern 3: "Name | Title | Company"
  if (!name) {
    const parts = title.split(/\s*\|\s*/);
    if (parts.length >= 2 && isName(parts[0])) {
      name    = cleanName(parts[0]);
      jobTitle = parts[1]?.trim() || '';
      company = parts[2]?.trim() || '';
    }
  }

  // Pattern 4: "Name - Company" (no title separator)
  if (!name) {
    const p4 = title.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (p4 && isName(p4[1])) {
      name    = cleanName(p4[1]);
      company = p4[2].trim();
    }
  }

  // Fallback: try first part of title as name
  if (!name) {
    const first = title.split(/[-–\|]/)[0].trim();
    if (isName(first)) name = cleanName(first);
  }

  if (!name) return null;

  // ── Parse snippet for location & enrich title/company if missing ──────────
  let location = '';

  if (snippet) {
    const parts = snippet.split(/\s*[·•]\s*/).map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
      // Skip follower/connection counts (e.g. "500 followers", "300 seguidores")
      if (/^\d[\d\s,\.]*\+?\s*(?:followers?|connections?|seguidores?|conexões)/i.test(part)) continue;

      // Classify as location
      if (!location && isLocation(part)) {
        location = part;
        continue;
      }

      // Classify as company via known list
      if (!company) {
        const mc = matchCompany(part, cosLower);
        if (mc) { company = mc; continue; }
      }

      // Remaining segments: first goes to jobTitle, second to company
      if (!jobTitle && part.length >= 3 && part.length <= 100) {
        jobTitle = part;
      } else if (!company && part.length >= 2 && part.length <= 80) {
        company = part;
      }
    }

    // Try comma-separated location if still missing
    if (!location) {
      const locMatch = snippet.match(/^([A-ZÀ-Ú][a-zà-ú\s]+(?:,\s*[A-ZÀ-Ú][a-zà-ú\s]+){1,3})/);
      if (locMatch && isLocation(locMatch[1])) location = locMatch[1].trim();
    }
  }

  // ── Match company against known list ──────────────────────────────────────
  const matchedCompany = matchCompany(company, cosLower) || company;

  // ── Match keyword ─────────────────────────────────────────────────────────
  const matched = matchKeyword(jobTitle, kwsLower) ||
                  matchKeyword(title,    kwsLower);

  return {
    name,
    title:    jobTitle,
    company:  matchedCompany,
    url:      url || '',
    location: location,
    matched:  matched
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normKey(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function isName(str) {
  if (!str) return false;
  const s = str.replace(/\s*[-–]\s*.*$/, '').replace(/\s+na\s+.*$/i, '').trim();
  if (s.length < 4 || s.length > 70) return false;
  if (/\d/.test(s)) return false;
  const words = s.split(/\s+/);
  if (words.length < 2 || words.length > 7) return false;
  return words.every(w => CONNECTORS.has(w.toLowerCase()) || /^[A-ZÁÉÍÓÚÀÂÊÎÔÛÃÕÄËÏÖÜÇÑ]/.test(w));
}

function cleanName(str) {
  return str
    .replace(/\s*[•·]\s*(1st|2nd|3rd|\d+st|\d+nd|\d+rd|\d+th)\+?/gi, '')
    .replace(/\s*[-–]\s*.*$/, '')
    .replace(/\s+na\s+.*$/i, '')
    .trim();
}

function matchCompany(str, cosLower) {
  if (!str) return '';
  const sl = str.toLowerCase();
  let best = cosLower.find(c => sl.includes(c.low) || c.low.includes(sl));
  if (!best) {
    const words = sl.split(/[\s|@,·•]+/);
    best = cosLower.find(c => words.some(w => w.length > 3 && c.low.includes(w)));
  }
  return best ? best.orig : '';
}

function matchKeyword(str, kwsLower) {
  if (!str) return '';
  const sl = str.toLowerCase();
  return kwsLower.find(k => sl.includes(k)) ? 
    kwsLower.find(k => sl.includes(k)) : '';
}

function isLocation(str) {
  return /Brasil|Brazil|Minas Gerais|São Paulo|Rio de Janeiro|Rio Grande|Porto Alegre|Curitiba|Recife|Salvador|Fortaleza|Brasília|Belo Horizonte|Campinas|Manaus|Florianópolis/i.test(str)
    && str.length < 100;
}

module.exports = { parseResults };
