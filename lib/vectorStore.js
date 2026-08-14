// Upstash Vector store — holds ingested manual chunks and answers semantic
// queries. The index is configured with a built-in embedding model, so we send
// raw text (the `data` field) and Upstash embeds it for us.
//
// Env: UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN
//
// Layout:
//   - chunks live in the default namespace, id = `${id}#...`
//   - each manual / photo is its own meta record (__manual__${id} / __photo__${id})
//     so two concurrent ingests cannot clobber each other's listing

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

export function chunkText(text, words = 150, overlap = 25) {
  const w = (text || '').split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < w.length; i += words - overlap) {
    const seg = w.slice(i, i + words).join(' ');
    if (seg.length > 40) out.push(seg);
    if (i + words >= w.length) break;
  }
  return out;
}

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

export function deleteVectorsByPrefix(prefix) {
  return call('/delete', { prefix }, 'DELETE');
}

export async function rangeChunks(prefix, cursor = '', limit = 400) {
  const j = await call('/range', { cursor, limit, prefix, includeMetadata: true, includeData: true });
  return {
    vectors: (j.result?.vectors || []).map((v) => ({ id: v.id, data: v.data, metadata: v.metadata })),
    nextCursor: j.result?.nextCursor || '',
  };
}

async function listByPrefix(prefix, field) {
  const items = [];
  let cursor = '';
  for (let guard = 0; guard < 40; guard++) {
    const j = await call('/range/meta', { cursor, limit: 200, prefix, includeMetadata: true });
    for (const v of (j.result?.vectors || [])) {
      const rec = v.metadata?.[field];
      if (rec && rec.id) items.push(rec);
    }
    cursor = j.result?.nextCursor || '';
    if (!cursor) break;
  }
  return items.sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
}

async function fetchLegacy(id, field) {
  try {
    const j = await call('/fetch/meta', { ids: [id], includeMetadata: true });
    const rec = (j.result || j.vectors || [])[0];
    const list = rec?.metadata?.[field];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function mergeById(legacy, listed) {
  if (!legacy.length) return listed;
  if (!listed.length) return legacy;
  const map = new Map();
  for (const x of legacy) if (x?.id) map.set(x.id, x);
  for (const x of listed) if (x?.id) map.set(x.id, x);
  return [...map.values()].sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
}

export async function getManuals() {
  try {
    const listed = await listByPrefix('__manual__', 'manual');
    const legacy = await fetchLegacy('__manifest__', 'manuals');
    return mergeById(legacy, listed);
  } catch {
    return fetchLegacy('__manifest__', 'manuals');
  }
}

export async function getManual(id) {
  try {
    const j = await call('/fetch/meta', { ids: [`__manual__${id}`], includeMetadata: true });
    const rec = (j.result || j.vectors || [])[0];
    if (rec?.metadata?.manual) return rec.metadata.manual;
  } catch { /* fall through */ }
  const all = await getManuals();
  return all.find((m) => m.id === id) || null;
}

export function upsertManual(manual) {
  return call('/upsert-data/meta', [{
    id: `__manual__${manual.id}`,
    data: 'manual',
    metadata: { manual },
  }]);
}

export async function deleteManualRecord(id) {
  try { await call('/delete/meta', { ids: [`__manual__${id}`] }, 'DELETE'); } catch { /* ignore */ }
  const leftover = (await fetchLegacy('__manifest__', 'manuals')).filter((m) => m.id !== id);
  if (leftover.length) {
    await call('/upsert-data/meta', [{ id: '__manifest__', data: 'manuals manifest', metadata: { manuals: leftover } }]);
  }
}

export async function getPhotos() {
  try {
    const listed = await listByPrefix('__photo__', 'photo');
    const legacy = await fetchLegacy('__photos__', 'photos');
    return mergeById(legacy, listed);
  } catch {
    return fetchLegacy('__photos__', 'photos');
  }
}

export async function getPhoto(id) {
  try {
    const j = await call('/fetch/meta', { ids: [`__photo__${id}`], includeMetadata: true });
    const rec = (j.result || j.vectors || [])[0];
    if (rec?.metadata?.photo) return rec.metadata.photo;
  } catch { /* fall through */ }
  const all = await getPhotos();
  return all.find((p) => p.id === id) || null;
}

export function upsertPhoto(photo) {
  return call('/upsert-data/meta', [{
    id: `__photo__${photo.id}`,
    data: 'photo',
    metadata: { photo },
  }]);
}

export async function deletePhotoRecord(id) {
  try { await call('/delete/meta', { ids: [`__photo__${id}`] }, 'DELETE'); } catch { /* ignore */ }
  const leftover = (await fetchLegacy('__photos__', 'photos')).filter((p) => p.id !== id);
  if (leftover.length) {
    await call('/upsert-data/meta', [{ id: '__photos__', data: 'photos manifest', metadata: { photos: leftover } }]);
  }
}

export async function getTitleMap() {
  try {
    const [manuals, photos] = await Promise.all([getManuals(), getPhotos()]);
    const map = {};
    for (const m of manuals) if (m?.id && m?.title) map[m.id] = m.title;
    for (const p of photos) if (p?.id && p?.title) map[p.id] = p.title;
    return map;
  } catch {
    return {};
  }
}

// Back-compat wrappers used by older call sites during the transition.
export async function saveManuals(manuals) {
  await Promise.all((manuals || []).map(upsertManual));
}

export async function savePhotos(photos) {
  await Promise.all((photos || []).map(upsertPhoto));
}
