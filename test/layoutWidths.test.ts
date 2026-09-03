import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  DEFAULT_NOTES,
  DEFAULT_RAIL,
  LAYOUT_STORAGE_KEY,
  MAX_NOTES,
  MAX_RAIL,
  MIN_CHAT,
  MIN_NOTES,
  MIN_RAIL,
  SPLITTER_W,
  clampLayout,
  loadLayoutWidths,
  notesLimits,
  railLimits,
  saveLayoutWidths,
} from '../utils/layoutWidths';

const memory = new Map<string, string>();
const storage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memory.set(k, String(v));
  },
  removeItem: (k: string) => {
    memory.delete(k);
  },
};

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
});

afterEach(() => {
  memory.clear();
});

describe('loadLayoutWidths', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadLayoutWidths()).toEqual(DEFAULT_LAYOUT);
  });

  it('reads saved rail and notes independently', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ rail: 260, notes: 340 }));
    expect(loadLayoutWidths()).toEqual({ rail: 260, notes: 340 });
  });

  it('falls back per-field on junk, and ignores extra keys', () => {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ rail: 'wide', notes: 250, extra: true })
    );
    expect(loadLayoutWidths()).toEqual({ rail: DEFAULT_RAIL, notes: 250 });
  });

  it('returns defaults on invalid JSON', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, '{nope');
    expect(loadLayoutWidths()).toEqual(DEFAULT_LAYOUT);
  });
});

describe('saveLayoutWidths', () => {
  it('round-trips through localStorage', () => {
    saveLayoutWidths({ rail: 240.6, notes: 311.2 });
    expect(JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || '{}')).toEqual({
      rail: 241,
      notes: 311,
    });
    expect(loadLayoutWidths()).toEqual({ rail: 241, notes: 311 });
  });
});

describe('clampLayout', () => {
  it('keeps defaults on a wide desk', () => {
    expect(clampLayout(DEFAULT_LAYOUT, 1400, false)).toEqual(DEFAULT_LAYOUT);
    expect(clampLayout(DEFAULT_LAYOUT, 1400, true)).toEqual(DEFAULT_LAYOUT);
  });

  it('does not change stored rail when notes open on a wide screen', () => {
    const stored = { rail: 320, notes: 260 };
    expect(clampLayout(stored, 1400, false).rail).toBe(320);
    expect(clampLayout(stored, 1400, true).rail).toBe(320);
  });

  it('caps absolute max and floors absolute min', () => {
    expect(clampLayout({ rail: 900, notes: 20 }, 1400, false)).toEqual({
      rail: MAX_RAIL,
      notes: MIN_NOTES,
    });
  });

  it('shrinks notes then rail so chat stays usable when notes are open', () => {
    const tight = MIN_CHAT + MIN_RAIL + MIN_NOTES + SPLITTER_W * 2;
    const shown = clampLayout({ rail: MAX_RAIL, notes: MAX_NOTES }, tight, true);
    expect(shown.rail).toBe(MIN_RAIL);
    expect(shown.notes).toBe(MIN_NOTES);
    expect(tight - shown.rail - shown.notes - SPLITTER_W * 2).toBe(MIN_CHAT);
  });

  it('only shrinks rail when notes are closed', () => {
    const tight = MIN_CHAT + MIN_RAIL + SPLITTER_W;
    const shown = clampLayout({ rail: MAX_RAIL, notes: MAX_NOTES }, tight, false);
    expect(shown.rail).toBe(MIN_RAIL);
    expect(shown.notes).toBe(MAX_NOTES);
  });
});

describe('limits', () => {
  it('gives the rail room up to MAX on a wide two-column frame', () => {
    const { min, max } = railLimits(1400, false, DEFAULT_NOTES);
    expect(min).toBe(MIN_RAIL);
    expect(max).toBe(MAX_RAIL);
  });

  it('tightens rail max when notes are open so chat is not crushed', () => {
    const container = MIN_CHAT + 280 + 260 + SPLITTER_W * 2;
    const { max } = railLimits(container, true, 260);
    expect(max).toBe(280);
  });

  it('tightens notes max against the current rail', () => {
    const container = MIN_CHAT + 300 + 220 + SPLITTER_W * 2;
    const { min, max } = notesLimits(container, 300);
    expect(min).toBe(MIN_NOTES);
    expect(max).toBe(220);
  });
});
