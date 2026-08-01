import { describe, it, expect } from 'vitest';
import { windowHistory } from '../services/ai';

const u = (i: number) => ({ role: 'user', id: i });
const a = (i: number) => ({ role: 'assistant', id: i });
const t = (i: number) => ({ role: 'tool', id: i });

describe('windowHistory', () => {
  it('returns history unchanged when under the cap', () => {
    const h = [u(1), a(2), u(3)];
    expect(windowHistory(h, 40)).toBe(h);
  });

  it('trims to the most recent messages when over the cap', () => {
    const h = Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? u(i) : a(i)));
    const out = windowHistory(h, 10);
    expect(out.length).toBeLessThanOrEqual(10);
  });

  it('never starts the window on an orphaned tool message', () => {
    // ...user, assistant(tool_calls), tool, assistant, user, assistant
    const h = [u(1), a(2), t(3), a(4), u(5), a(6), t(7), a(8), u(9), a(10)];
    const out = windowHistory(h, 4);
    expect(out[0].role).toBe('user');
    expect(out.some((m) => m.role === 'tool' && out.indexOf(m) === 0)).toBe(false);
  });

  it('keeps everything if no user boundary exists in the window', () => {
    const h = [u(1), a(2), t(3), a(4), t(5)]; // one long turn
    const out = windowHistory(h, 2);
    expect(out).toBe(h); // no clean cut → unchanged
  });
});
