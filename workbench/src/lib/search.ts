import { CATS, Cat, Entry, LIBRARY, P, P_ORDER } from '../data';
import { matchCommand, norm } from './cmd';

export interface Hit {
  entry: Entry;
  score: number;
  /** Set when the query reads as a command on this platform. */
  cmdMatch?: P;
}

const stem = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

const CAT_NAME: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.id, c.name.toLowerCase()]));

interface Indexed {
  entry: Entry;
  title: string;
  titleWords: string[];
  tags: string[];
  desc: string;
  cmds: { p: P; line: string; text: string }[];
}

const INDEX: Indexed[] = LIBRARY.map((entry) => ({
  entry,
  title: norm(entry.title),
  titleWords: norm(entry.title).split(/[^a-z0-9.]+/).filter(Boolean).map(stem),
  tags: norm((entry.tags || '') + ' ' + CAT_NAME[entry.cat]).split(/[^a-z0-9.]+/).filter(Boolean).map(stem),
  desc: norm(entry.desc),
  cmds: P_ORDER.flatMap((p) => (entry.cmds[p] || '').split('\n').filter(Boolean).map((line) => ({ p, line: line.trim(), text: norm(line) }))),
}));

const STOP = new Set(['show', 'display', 'list', 'get', 'check', 'see', 'view', 'command', 'the', 'a', 'an', 'of', 'to', 'on', 'for', 'in', 'is', 'how', 'do', 'i', 'my', 'what', 'and', 'or', 'me']);

export function search(query: string, opts: { cat?: Cat | 'all' | 'fav'; favs?: string[]; prefer?: P } = {}): Hit[] {
  const q = norm(query);
  const pool = INDEX.filter((x) => {
    if (!opts.cat || opts.cat === 'all') return true;
    if (opts.cat === 'fav') return (opts.favs || []).includes(x.entry.id);
    return x.entry.cat === opts.cat;
  });
  if (!q) return pool.map((x) => ({ entry: x.entry, score: 0 }));

  const words = q.split(/[^a-z0-9.:/]+/).filter((w) => w && !STOP.has(w)).map(stem);
  const hits: Hit[] = [];
  for (const x of pool) {
    let score = 0;
    let cmdMatch: P | undefined;

    // 1. The query reads as a command (possibly abbreviated, possibly unfinished).
    for (const c of x.cmds) {
      const nq = q.split(' ').length;
      // A line made only of variables ("{prefix} {ip}") would match anything.
      const literal = c.text.split(' ').slice(0, nq).some((t) => !t.includes('{'));
      const m = literal ? matchCommand(q, c.line, nq >= 2) : null;
      if (m) {
        const full = matchCommand(q, c.line, false);
        const s = (full ? 120 : 70) + (c.p === opts.prefer ? 5 : 0) + Math.min(q.length, 20);
        if (s > score) { score = s; cmdMatch = c.p; }
      }
    }

    // 2. The query reads as an intent.
    let intent = 0;
    let matched = 0;
    for (const w of words) {
      let best = 0;
      if (x.titleWords.includes(w)) best = 10;
      else if (x.titleWords.some((t) => t.startsWith(w))) best = 7;
      else if (x.tags.includes(w)) best = 9;
      else if (x.tags.some((t) => t.startsWith(w))) best = 5;
      else if (w.length >= 3 && x.desc.includes(w)) best = 3;
      else if (w.length >= 3 && x.cmds.some((c) => c.text.split(' ').some((t) => t.startsWith(w)))) best = 2;
      if (best) matched++;
      intent += best;
    }
    if (words.length && matched === words.length) intent += 12;
    else if (matched < Math.ceil(words.length / 2)) intent = 0;
    if (x.title === q) intent += 30;

    // Last resort: the query is a fragment from the middle of a command.
    if (!score && !intent && q.length >= 5) {
      const c = x.cmds.find((k) => k.text.includes(q));
      if (c) { score = 14; cmdMatch = c.p; }
    }

    const total = Math.max(score, intent) + Math.min(score, intent) * 0.2;
    if (total > 0) hits.push({ entry: x.entry, score: total, cmdMatch: score >= intent ? cmdMatch : undefined });
  }
  hits.sort((a, b) => b.score - a.score);
  // Drop the long tail: a weak partial match next to a strong one is noise.
  const floor = (hits[0]?.score || 0) * 0.42;
  return hits.filter((h) => h.score >= floor);
}
