/** Desktop column widths for the chat | rail | scratchpad grid. */

export const LAYOUT_STORAGE_KEY = 'eqnoc_layout';

/** Matches the current two-column rail (`lg:grid-cols-[minmax(0,1fr)_300px]`). */
export const DEFAULT_RAIL = 300;
/** Preferred size of the current docked notes column (`minmax(240px, 300px)`). */
export const DEFAULT_NOTES = 280;

export const MIN_CHAT = 360;
export const MIN_RAIL = 200;
export const MIN_NOTES = 200;
export const MAX_RAIL = 480;
export const MAX_NOTES = 480;

/** Splitter column width — same as the previous `gap-4` (16px). */
export const SPLITTER_W = 16;

export type LayoutWidths = {
  rail: number;
  notes: number;
};

export const DEFAULT_LAYOUT: LayoutWidths = { rail: DEFAULT_RAIL, notes: DEFAULT_NOTES };

function clampNum(n: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, n));
}

function asWidth(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : fallback;
}

export function loadLayoutWidths(): LayoutWidths {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LAYOUT };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_LAYOUT };
    const rec = parsed as Record<string, unknown>;
    return {
      rail: asWidth(rec.rail, DEFAULT_RAIL),
      notes: asWidth(rec.notes, DEFAULT_NOTES),
    };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

export function saveLayoutWidths(widths: LayoutWidths): void {
  try {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        rail: Math.round(widths.rail),
        notes: Math.round(widths.notes),
      })
    );
  } catch {
    /* ignore */
  }
}

/** Grid content box (client width minus horizontal padding). */
export function contentBoxWidth(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  return Math.max(0, el.clientWidth - (Number.isFinite(pad) ? pad : 0));
}

export function railLimits(
  containerW: number,
  notesOpen: boolean,
  notesW: number
): { min: number; max: number } {
  const notesSpace = notesOpen ? clampNum(notesW, MIN_NOTES, MAX_NOTES) + SPLITTER_W : 0;
  const leftover = containerW - MIN_CHAT - SPLITTER_W - notesSpace;
  return { min: MIN_RAIL, max: clampNum(leftover, MIN_RAIL, MAX_RAIL) };
}

export function notesLimits(containerW: number, railW: number): { min: number; max: number } {
  const leftover = containerW - MIN_CHAT - SPLITTER_W * 2 - clampNum(railW, MIN_RAIL, MAX_RAIL);
  return { min: MIN_NOTES, max: clampNum(leftover, MIN_NOTES, MAX_NOTES) };
}

/**
 * Display widths. Does not mutate the stored user preference — a narrow
 * laptop can clamp for the moment, then restore the saved split on a wider screen.
 */
export function clampLayout(
  stored: LayoutWidths,
  containerW: number,
  notesOpen: boolean
): LayoutWidths {
  if (containerW <= 0) return { ...stored };

  let rail = clampNum(stored.rail, MIN_RAIL, MAX_RAIL);
  let notes = clampNum(stored.notes, MIN_NOTES, MAX_NOTES);

  const splitters = notesOpen ? SPLITTER_W * 2 : SPLITTER_W;
  const extras = notesOpen ? notes : 0;
  const chat = containerW - rail - extras - splitters;

  if (chat < MIN_CHAT) {
    let deficit = MIN_CHAT - chat;
    if (notesOpen) {
      const cut = Math.min(deficit, notes - MIN_NOTES);
      notes -= cut;
      deficit -= cut;
    }
    rail -= Math.min(deficit, rail - MIN_RAIL);
  }

  return { rail, notes };
}
