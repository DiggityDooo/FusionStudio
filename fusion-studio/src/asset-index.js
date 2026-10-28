'use strict';
// Asset library index and search (A32 "Asset libraries, tagging,
// metadata and search"): an in-memory inverted index over asset
// records { id, name, type, tags, metadata } with a small query
// language — whitespace terms (AND), tag:x and type:x filters,
// -term exclusions, and "quoted phrases" matched against names.
// Scoring: exact name token 3, exact tag 2, name/metadata
// substring 1; results sort by score desc, name asc, id asc.

export function tokenize(text) {
  const tokens = [];
  for (const chunk of String(text).split(/[^a-zA-Z0-9]+/)) {
    if (!chunk) continue;
    // Split camelCase / letter-digit transitions (original case).
    let current = '';
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      const prev = chunk[i - 1] || '';
      const boundary = i > 0
        && ((/[a-z]/.test(prev) && /[A-Z]/.test(ch))
          || (/[a-zA-Z]/.test(prev) && /[0-9]/.test(ch))
          || (/[0-9]/.test(prev) && /[a-zA-Z]/.test(ch)));
      if (boundary && current) { tokens.push(current.toLowerCase()); current = ch; }
      else current += ch;
    }
    if (current) tokens.push(current.toLowerCase());
  }
  return tokens;
}

export function createAssetIndex(assets) {
  if (!Array.isArray(assets)) throw new Error('assets: an array of assets is required');
  const byId = new Map();
  const postings = new Map(); // token -> Set of ids
  const tagPostings = new Map();
  const addPosting = (map, key, id) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(id);
  };
  for (const asset of assets) {
    if (!asset?.id || !asset?.name) throw new Error('assets: every asset needs id and name');
    if (byId.has(asset.id)) throw new Error(`assets: duplicate id ${asset.id}`);
    const record = {
      id: asset.id,
      name: asset.name,
      type: asset.type || 'asset',
      tags: [...(asset.tags || [])].map((t) => String(t).toLowerCase()),
      metadata: asset.metadata || {},
      nameTokens: tokenize(asset.name),
      searchText: [
        asset.name,
        ...(asset.tags || []),
        ...Object.values(asset.metadata || {}).map(String),
      ].join(' ').toLowerCase(),
    };
    byId.set(asset.id, record);
    for (const token of new Set(record.nameTokens)) addPosting(postings, token, asset.id);
    for (const tag of new Set(record.tags)) addPosting(tagPostings, tag, asset.id);
  }
  return { byId, postings, tagPostings, size: byId.size };
}

function parseQuery(query) {
  const phrases = [];
  const rest = String(query).replace(/"([^"]+)"/g, (_, phrase) => {
    phrases.push(phrase.toLowerCase());
    return ' ';
  });
  const terms = [], exclusions = [], tagFilters = [], tagExclusions = [], typeFilters = [];
  for (const raw of rest.split(/\s+/)) {
    if (!raw) continue;
    const token = raw.toLowerCase();
    if (token.startsWith('-tag:')) tagExclusions.push(token.slice(5));
    else if (token.startsWith('tag:')) tagFilters.push(token.slice(4));
    else if (token.startsWith('type:')) typeFilters.push(token.slice(5));
    else if (token.startsWith('-') && token.length > 1) exclusions.push(token.slice(1));
    else terms.push(token);
  }
  return { phrases, terms, exclusions, tagFilters, tagExclusions, typeFilters };
}

function scoreRecord(record, { phrases, terms }) {
  let score = 0;
  for (const phrase of phrases) {
    if (!record.name.toLowerCase().includes(phrase)) return -1;
    score += 4;
  }
  for (const term of terms) {
    if (record.nameTokens.includes(term)) score += 3;
    else if (record.tags.includes(term)) score += 2;
    else if (record.searchText.includes(term)) score += 1;
    else return -1;
  }
  return score;
}

/**
 * Ranked search. options: { type, limit } — `type` may also be
 * given inside the query as type:x. Excluded terms veto a record
 * if they appear in its tags, name tokens, or search text.
 */
export function searchAssets(index, query, { limit = 50 } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('assets: limit must be a positive integer');
  const parsed = parseQuery(query ?? '');
  const results = [];
  for (const record of index.byId.values()) {
    if (parsed.typeFilters.length && !parsed.typeFilters.includes(record.type.toLowerCase())) continue;
    if (!parsed.tagFilters.every((tag) => record.tags.includes(tag))) continue;
    if (parsed.tagExclusions.some((tag) => record.tags.includes(tag))) continue;
    const vetoed = parsed.exclusions.some((term) => record.tags.includes(term)
      || record.nameTokens.includes(term) || record.searchText.includes(term));
    if (vetoed) continue;
    const score = scoreRecord(record, parsed);
    if (score < 0) continue;
    results.push({ id: record.id, name: record.name, type: record.type, score });
  }
  results.sort((a, b) => (b.score - a.score)
    || a.name.localeCompare(b.name)
    || String(a.id).localeCompare(String(b.id)));
  return results.slice(0, limit);
}

/** Tag frequency across the library, sorted by count desc then tag. */
export function tagCounts(index) {
  const counts = new Map();
  for (const record of index.byId.values()) {
    for (const tag of new Set(record.tags)) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag));
}
