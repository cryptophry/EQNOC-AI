// Offline library — manuals/guides a tech has chosen to "keep offline".
// Full extracted text is stored in IndexedDB on the device, with a simple
// keyword search that works with no network at all (black-spot sites).

export interface OfflineChunk {
  page: number;
  unit: 'page' | 'section';
  text: string;
}

export interface OfflineManual {
  id: string;
  title: string;
  type: string; // 'pdf' | 'docx'
  category?: string;
  pages: number;
  savedAt: number;
  chunks: OfflineChunk[];
}

export interface OfflineHit {
  manualId: string;
  title: string;
  page: number;
  unit: 'page' | 'section';
  text: string;
  score: number;
}

const DB_NAME = 'tech-assistant-offline';
const STORE = 'manuals';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB unavailable'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

export function saveOfflineManual(manual: OfflineManual): Promise<void> {
  return tx<void>('readwrite', (s) => s.put(manual));
}

export function removeOfflineManual(id: string): Promise<void> {
  return tx<void>('readwrite', (s) => s.delete(id));
}

export async function listOfflineManuals(): Promise<Omit<OfflineManual, 'chunks'>[]> {
  try {
    const all = await tx<OfflineManual[]>('readonly', (s) => s.getAll());
    return (all || []).map(({ chunks: _chunks, ...meta }) => meta);
  } catch {
    return [];
  }
}

export async function getOfflineIds(): Promise<Set<string>> {
  try {
    const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
    return new Set((keys || []).map(String));
  } catch {
    return new Set();
  }
}

// Keyword search over every saved manual. Scores chunks by term frequency,
// with a bonus for phrase matches. Pure string work — no network, no AI.
export async function searchOffline(query: string, limit = 8): Promise<OfflineHit[]> {
  const terms = query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2);
  if (terms.length === 0) return [];
  const phrase = query.toLowerCase().trim();

  let all: OfflineManual[] = [];
  try { all = (await tx<OfflineManual[]>('readonly', (s) => s.getAll())) || []; } catch { return []; }

  const hits: OfflineHit[] = [];
  for (const m of all) {
    for (const c of m.chunks) {
      const lower = c.text.toLowerCase();
      let score = 0;
      for (const t of terms) {
        let idx = lower.indexOf(t);
        while (idx !== -1) { score += 1; idx = lower.indexOf(t, idx + t.length); }
      }
      if (score === 0) continue;
      if (terms.length > 1 && lower.includes(phrase)) score += terms.length * 3; // phrase bonus
      // Mild normalisation so one giant chunk doesn't win on length alone.
      score = score / Math.sqrt(Math.max(1, c.text.length / 400));
      hits.push({ manualId: m.id, title: m.title, page: c.page, unit: c.unit, text: c.text, score });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
