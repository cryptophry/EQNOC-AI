// Library retrieval for chat: vector search PLUS a lexical pass over
// photo/manual titles and site names. Short site codes (SACS, MOARCS) rarely
// embed close enough to a "single line diagram" OCR dump to beat the score
// floor, so we also match the manifest and pull those chunks in.

import { queryChunks, getTitleMap, getPhotos, getManuals, rangeChunks } from './vectorStore.js';

const VEC_TOP_K = 10;
const MIN_SCORE = 0.35;
const MIN_SCORE_IMAGE = 0.2;
const MAX_SOURCES = 8;

export function extractSearchQuery(raw) {
  const text = String(raw || '');
  const user = text.match(/User Query:\s*([\s\S]*)$/i);
  const question = (user ? user[1] : text).trim();
  const siteM = text.match(/Current site\/job:\s*"([^"]+)"/i);
  const site = siteM ? siteM[1].trim() : '';
  return { question, site };
}

export function searchTokens(...parts) {
  const set = new Set();
  for (const p of parts) {
    for (const t of String(p || '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (t.length >= 3) set.add(t);
    }
  }
  return [...set];
}

export function recordHaystack(rec) {
  return [rec?.title, rec?.site, rec?.summary, rec?.category].filter(Boolean).join(' ').toLowerCase();
}

export function recordMatchesTokens(rec, tokens) {
  if (!tokens.length || !rec) return false;
  const hay = recordHaystack(rec);
  return tokens.some((t) => hay.includes(t));
}

function hitKey(h) {
  return h.id || `${h.metadata?.manualId || ''}#${h.metadata?.page ?? ''}#${String(h.data || '').slice(0, 48)}`;
}

function toSource(h, titleMap) {
  const kind = h.metadata?.kind === 'reference' ? 'image' : (h.metadata?.unit === 'section' ? 'guide' : 'manual');
  const title = (titleMap && titleMap[h.metadata?.manualId])
    || h.metadata?.title
    || (kind === 'image' ? 'Reference image' : kind === 'guide' ? 'Guide' : 'Manual');
  const site = h.metadata?.site ? String(h.metadata.site) : '';
  const label = kind === 'image'
    ? (site ? `reference image · ${site}` : 'reference image')
    : (kind === 'guide' ? `§${h.metadata?.page ?? '?'}` : `p.${h.metadata?.page ?? '?'}`);
  return { title, label, kind, text: h.data, site };
}

async function chunksForRecord(rec, kind) {
  const { vectors } = await rangeChunks(`${rec.id}#`, '', 24);
  if (vectors.length) {
    return vectors.map((v) => ({
      ...v,
      score: 1,
      metadata: { ...(v.metadata || {}), kind: kind === 'image' ? 'reference' : v.metadata?.kind, site: rec.site || v.metadata?.site, title: rec.title || v.metadata?.title, manualId: rec.id },
    }));
  }
  const stub = [rec.site ? `Site: ${rec.site}` : '', rec.title ? `Title: ${rec.title}` : '', rec.summary || '']
    .filter(Boolean).join('\n');
  if (!stub) return [];
  return [{
    id: `${rec.id}#summary`,
    data: stub,
    score: 1,
    metadata: { manualId: rec.id, title: rec.title, kind: kind === 'image' ? 'reference' : undefined, unit: kind === 'guide' ? 'section' : 'page', site: rec.site || undefined },
  }];
}

export async function retrieveLibraryContext(rawUserText) {
  const { question, site } = extractSearchQuery(rawUserText);
  if (!question && !site) return null;

  const vecQuery = [question, site].filter(Boolean).join(' ');
  const tokens = searchTokens(question, site);

  let hits = [];
  let titleMap = {};
  let photos = [];
  let manuals = [];
  try {
    [hits, titleMap, photos, manuals] = await Promise.all([
      queryChunks(vecQuery, VEC_TOP_K),
      getTitleMap(),
      getPhotos(),
      getManuals(),
    ]);
  } catch (e) {
    console.warn('library retrieval failed', e.message);
    return null;
  }

  const picked = new Map();
  const consider = (h) => {
    if (!h || !h.data) return;
    const isImage = h.metadata?.kind === 'reference';
    const floor = isImage ? MIN_SCORE_IMAGE : MIN_SCORE;
    if ((h.score ?? 0) < floor) return;
    const key = hitKey(h);
    if (!picked.has(key)) picked.set(key, h);
  };

  for (const h of hits || []) consider(h);

  const photoHit = (p) =>
    recordMatchesTokens(p, tokens)
    || (site && p.site && String(p.site).toLowerCase() === site.toLowerCase());
  const extra = [
    ...photos.filter(photoHit).slice(0, 4).map((p) => ({ rec: p, kind: 'image' })),
    ...manuals.filter((m) => recordMatchesTokens(m, tokens)).slice(0, 2).map((m) => ({ rec: m, kind: 'manual' })),
  ];
  for (const { rec, kind } of extra) {
    try {
      const more = await chunksForRecord(rec, kind);
      for (const h of more) consider({ ...h, score: 1 });
    } catch (e) {
      console.warn('lexical fetch failed', rec.id, e.message);
    }
  }

  const good = [...picked.values()].slice(0, MAX_SOURCES);
  if (good.length === 0) return null;

  const sources = good.map((h) => toSource(h, titleMap));
  const excerpts = sources
    .map((s, i) => {
      const head = s.kind === 'image'
        ? `${s.title}${s.site ? ` (${s.site})` : ''} — ${s.label}`
        : `${s.title}, ${s.label}`;
      return `[${i + 1}] (${head})\n${s.text}`;
    })
    .join('\n\n');

  const imageNote = sources.some((s) => s.kind === 'image')
    ? '\n\nYou have reference images in the library for this question. You MUST mention them by title (and site if given) and use what they show. Do not answer as if no diagram exists.'
    : '';

  const prompt = `RELEVANT MANUAL / GUIDE / REFERENCE-IMAGE EXCERPTS (retrieved for this question — prefer these over general knowledge, and CITE the source shown in each bracket: (Title, p.X) for manuals, (Title, §X) for guides, (Title — reference image) for images):${imageNote}\n\n${excerpts}`;
  return { prompt, sources };
}
