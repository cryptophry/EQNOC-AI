import { Entry, LIBRARY, P } from '../data';
import { matchCommand } from './cmd';

export interface Card { entry: Entry; p: P; key: string; answer: string }
export interface Progress { box: number; due: number; seen: number; right: number }
export type ProgressMap = Record<string, Progress>;

const DAY = 86_400_000;
/** Leitner intervals: a right answer moves a card up a box, a wrong one back to the start. */
export const INTERVALS = [0, 1 * DAY, 3 * DAY, 7 * DAY, 21 * DAY];
export const MASTERED_BOX = 3;

/** Only single-line commands make fair typing drills. */
export function drillable(entry: Entry, p: P): boolean {
  const c = entry.cmds[p];
  return !!c && !c.includes('\n') && !(entry.check || []).includes(p) && c !== '{text}';
}

export function buildDeck(platforms: P[], ids?: string[]): Card[] {
  const pool = ids ? LIBRARY.filter((x) => ids.includes(x.id)) : LIBRARY;
  const out: Card[] = [];
  for (const entry of pool) for (const p of platforms) {
    if (drillable(entry, p)) out.push({ entry, p, key: `${entry.id}:${p}`, answer: entry.cmds[p] as string });
  }
  return out;
}

/** Due cards first (lowest box first), then unseen, in a stable shuffle. */
export function orderDeck(deck: Card[], prog: ProgressMap, now = Date.now(), limit = 12): Card[] {
  const rnd = (k: string) => { let h = 2166136261 ^ Math.floor(now / 60000); for (const ch of k) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
  const due = deck.filter((c) => prog[c.key] && prog[c.key].due <= now).sort((a, b) => prog[a.key].box - prog[b.key].box || rnd(a.key) - rnd(b.key));
  const fresh = deck.filter((c) => !prog[c.key]).sort((a, b) => rnd(a.key) - rnd(b.key));
  const later = deck.filter((c) => prog[c.key] && prog[c.key].due > now).sort((a, b) => prog[a.key].due - prog[b.key].due);
  return [...due, ...fresh, ...later].slice(0, limit);
}

export type Grade = 'exact' | 'abbrev' | 'wrong';
export function grade(typed: string, answer: string): Grade {
  return matchCommand(typed, answer) ?? 'wrong';
}

export function advance(prev: Progress | undefined, correct: boolean, now = Date.now()): Progress {
  const p = prev ?? { box: 0, due: 0, seen: 0, right: 0 };
  const box = correct ? Math.min(p.box + 1, INTERVALS.length - 1) : 0;
  return { box, due: now + (correct ? INTERVALS[box] : 0), seen: p.seen + 1, right: p.right + (correct ? 1 : 0) };
}

export function stats(deck: Card[], prog: ProgressMap, now = Date.now()) {
  let mastered = 0, learning = 0, due = 0;
  for (const c of deck) {
    const s = prog[c.key];
    if (!s) continue;
    if (s.box >= MASTERED_BOX) mastered++; else learning++;
    if (s.due <= now) due++;
  }
  return { total: deck.length, mastered, learning, fresh: deck.length - mastered - learning, due };
}
