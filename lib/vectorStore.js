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
