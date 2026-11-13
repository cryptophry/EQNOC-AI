import { VARS } from '../data';

export type VarValues = Record<string, string>;

const VAR_RE = /\{(\w+)\}/g;

export function varsIn(cmd: string | null | undefined): string[] {
  if (!cmd) return [];
  const out: string[] = [];
  for (const m of cmd.matchAll(VAR_RE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export function placeholder(name: string): string {
  return `<${(VARS[name]?.label || name).toLowerCase()}>`;
}

/** Plain text for the clipboard: filled values, or <placeholder> where empty. */
export function fill(cmd: string, values: VarValues): string {
  return cmd.replace(VAR_RE, (_, k: string) => (values[k]?.trim() ? values[k].trim() : placeholder(k)));
}

export type Seg = { text: string; kind: 'text' | 'var' | 'filled' };

/** Segments for rendering, so variables can be styled. */
export function segments(cmd: string, values: VarValues): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of cmd.matchAll(VAR_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: cmd.slice(last, i), kind: 'text' });
    const v = values[m[1]]?.trim();
    out.push(v ? { text: v, kind: 'filled' } : { text: placeholder(m[1]), kind: 'var' });
    last = i + m[0].length;
  }
  if (last < cmd.length) out.push({ text: cmd.slice(last), kind: 'text' });
  return out;
}

export function norm(s: string): string {
  return s.toLowerCase().replace(/neighbour/g, 'neighbor').replace(/\s+/g, ' ').trim();
}

/**
 * Does `typed` match the command pattern, allowing CLI-style abbreviation
 * (each typed word is a prefix of the expected word) and any value where the
 * pattern has a {variable}? Returns 'exact', 'abbrev' or null.
 * With `partial`, `typed` may stop before the end of the pattern.
 */
export function matchCommand(typed: string, pattern: string, partial = false): 'exact' | 'abbrev' | null {
  const a = norm(typed).split(' ').filter(Boolean);
  const b = norm(pattern).split(' ').filter(Boolean);
  if (!a.length) return null;
  if (partial ? a.length > b.length : a.length !== b.length) return null;
  let abbrev = false;
  for (let i = 0; i < a.length; i++) {
    const exp = b[i];
    const got = a[i];
    if (/\{\w+\}/.test(exp)) {
      // A variable slot. Literal text around it (quotes, "ae{lag}") must still fit.
      const re = new RegExp('^' + exp.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{\w+\\?\}/g, '.+') + '$');
      if (!re.test(got) && !/^<.*>$/.test(got)) return null;
      continue;
    }
    if (got === exp) continue;
    if (got.length >= 2 && exp.startsWith(got)) { abbrev = true; continue; }
    if (got.length === 1 && exp.length === 1) continue;
    return null;
  }
  return abbrev || a.length < b.length ? 'abbrev' : 'exact';
}
