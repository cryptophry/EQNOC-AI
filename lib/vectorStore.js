// Upstash Vector store — holds ingested manual chunks and answers semantic
// queries. The index is configured with a built-in embedding model, so we send
// raw text (the `data` field) and Upstash embeds it for us.
//
// Env: UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN
//
// Layout:
//   - manual chunks live in the default namespace, id = `${manualId}#${page}#${i}`,
//     data = chunk text, metadata = { manualId, title, page }
//   - a single manifest record (id "__manifest__") in the "meta" namespace holds
//     the list of manuals, so we can list/manage them without a range scan.

// Read env at call time (not import time) so it works regardless of when the
// process loads its env (e.g. the local dev server loads .env.local after imports).
const BASE = () => process.env.UPSTASH_VECTOR_REST_URL;
const TOKEN = () => process.env.UPSTASH_VECTOR_REST_TOKEN;

export function vectorConfigured() {
  return !!(BASE() && TOKEN());
}

async function call(path, body, method = 'POST') {
  const res = await fetch(BASE() + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Upstash ${path} ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return {}; }
}

// records: [{ id, data, metadata }]
export function upsertChunks(records) {
  return call('/upsert-data', records);
}

export async function queryChunks(text, topK = 6) {
  const j = await call('/query-data', { data: text, topK, includeMetadata: true, includeData: true });
  return j.result || [];
}

export function deleteManualVectors(manualId) {
  return call('/delete', { prefix: `${manualId}#` }, 'DELETE');
}

// Generic prefix delete (used for site-photo vectors, ids `${photoId}#${i}`).
export function deleteVectorsByPrefix(prefix) {
  return call('/delete', { prefix }, 'DELETE');
}

// Enumerate stored chunks by id prefix (cursor-paginated). Powers the
// "keep offline" download: the client pulls a manual's full text page by page.
export async function rangeChunks(prefix, cursor = '', limit = 400) {
  const j = await call('/range', { cursor, limit, prefix, includeMetadata: true, includeData: true });
  return {
    vectors: (j.result?.vectors || []).map((v) => ({ id: v.id, data: v.data, metadata: v.metadata })),
    nextCursor: j.result?.nextCursor || '',
  };
}

// --- Manifest (list of manuals) in the "meta" namespace ---
export async function getManuals() {
  try {
    const j = await call('/fetch/meta', { ids: ['__manifest__'], includeMetadata: true });
    const rec = (j.result || j.vectors || [])[0];
    const list = rec?.metadata?.manuals;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveManuals(manuals) {
  return call('/upsert-data/meta', [{ id: '__manifest__', data: 'manuals manifest', metadata: { manuals } }]);
}

// --- Site-photo manifest (list of field photos) in the "meta" namespace ---
// Photo chunks live in the default namespace alongside manual chunks (so the
// assistant retrieves both with one query); only the listing is kept separate.
export async function getPhotos() {
  try {
    const j = await call('/fetch/meta', { ids: ['__photos__'], includeMetadata: true });
    const rec = (j.result || j.vectors || [])[0];
    const list = rec?.metadata?.photos;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function savePhotos(photos) {
  return call('/upsert-data/meta', [{ id: '__photos__', data: 'photos manifest', metadata: { photos } }]);
}

// Current display titles for every manual/guide/reference image, keyed by id.
// Retrieval uses this so a rename (which only edits the manifest) immediately
// changes citations — chunk metadata keeps the original title as a fallback.
export async function getTitleMap() {
  try {
    const j = await call('/fetch/meta', { ids: ['__manifest__', '__photos__'], includeMetadata: true });
    const recs = j.result || j.vectors || [];
    const map = {};
    for (const rec of recs) {
      for (const m of rec?.metadata?.manuals || []) if (m?.id && m?.title) map[m.id] = m.title;
      for (const p of rec?.metadata?.photos || []) if (p?.id && p?.title) map[p.id] = p.title;
    }
    return map;
  } catch {
    return {};
  }
}
