// Offline field-kit maths. Kept pure so the UI and the AI tool share one source.

export const FIBRE_COLOURS: { n: number; name: string; hex: string; ink: string }[] = [
  { n: 1, name: 'Blue', hex: '#2563eb', ink: '#fff' },
  { n: 2, name: 'Orange', hex: '#ea580c', ink: '#fff' },
  { n: 3, name: 'Green', hex: '#16a34a', ink: '#fff' },
  { n: 4, name: 'Brown', hex: '#92400e', ink: '#fff' },
  { n: 5, name: 'Slate', hex: '#64748b', ink: '#fff' },
  { n: 6, name: 'White', hex: '#f8fafc', ink: '#0b1b2b' },
  { n: 7, name: 'Red', hex: '#dc2626', ink: '#fff' },
  { n: 8, name: 'Black', hex: '#171717', ink: '#fff' },
  { n: 9, name: 'Yellow', hex: '#eab308', ink: '#0b1b2b' },
  { n: 10, name: 'Violet', hex: '#7c3aed', ink: '#fff' },
  { n: 11, name: 'Rose', hex: '#fb7185', ink: '#0b1b2b' },
  { n: 12, name: 'Aqua', hex: '#22d3ee', ink: '#0b1b2b' },
];

export interface OpticalInput {
  txPower: number;
  rxSensitivity: number;
  distance: number;
  wavelength?: string;
  connectorCount?: number;
  spliceCount?: number;
  safetyMargin?: number;
}

export interface OpticalResult {
  attenuation: number;
  fiberLoss: number;
  passiveLoss: number;
  totalLinkLoss: number;
  estimatedRxPower: number;
  margin: number;
  status: 'PASS' | 'FAIL';
  wavelength: string;
  distance: number;
}

export function opticalBudget(a: OpticalInput): OpticalResult {
  const txPower = Number(a.txPower);
  const rxSensitivity = Number(a.rxSensitivity);
  const distance = Number(a.distance);
  const wavelength = String(a.wavelength ?? '1310');
  const connectorCount = Number(a.connectorCount ?? 2);
  const spliceCount = Number(a.spliceCount ?? 2);
  const safetyMargin = Number(a.safetyMargin ?? 3);
  const attenuation = wavelength === '1550' ? 0.25 : wavelength === '1625' ? 0.22 : wavelength === '850' ? 3.0 : 0.35;
  const fiberLoss = distance * attenuation;
  const passiveLoss = connectorCount * 0.5 + spliceCount * 0.1;
  const totalLoss = fiberLoss + passiveLoss;
  const estRx = txPower - totalLoss;
  const margin = estRx - rxSensitivity - safetyMargin;
  return {
    attenuation,
    fiberLoss: +fiberLoss.toFixed(2),
    passiveLoss: +passiveLoss.toFixed(2),
    totalLinkLoss: +totalLoss.toFixed(2),
    estimatedRxPower: +estRx.toFixed(2),
    margin: +margin.toFixed(2),
    status: margin >= 0 ? 'PASS' : 'FAIL',
    wavelength,
    distance,
  };
}

export function irRisePct(baseline: number, now: number): number | null {
  if (!Number.isFinite(baseline) || !Number.isFinite(now) || baseline <= 0) return null;
  return +(((now - baseline) / baseline) * 100).toFixed(1);
}

export function irAdvice(pct: number | null): { label: string; tone: 'ok' | 'warn' | 'danger' } {
  if (pct == null) return { label: 'Enter both readings', tone: 'ok' };
  if (pct < 20) return { label: 'Within typical drift — keep monitoring', tone: 'ok' };
  if (pct < 30) return { label: 'Investigate, increase monitoring (~20%+ over baseline)', tone: 'warn' };
  return { label: 'End-of-life signal — plan replacement / capacity test', tone: 'danger' };
}

export function stringVoltage(cells: number, vPerCell: number): number | null {
  if (!Number.isFinite(cells) || !Number.isFinite(vPerCell) || cells <= 0) return null;
  return +(cells * vPerCell).toFixed(2);
}

export function autonomyHours(ah: number, loadA: number): number | null {
  if (!Number.isFinite(ah) || !Number.isFinite(loadA) || loadA <= 0 || ah < 0) return null;
  return +(ah / loadA).toFixed(2);
}

export function fadeCheck(measured: number, design: number, threshold: number) {
  if (![measured, design, threshold].every(Number.isFinite)) return null;
  const vsDesign = +(measured - design).toFixed(2);
  const fadeMargin = +(measured - threshold).toFixed(2);
  return {
    vsDesign,
    fadeMargin,
    alignment: vsDesign <= -3 ? 'Below design by ≥3 dB — check alignment / path' : 'Close to design',
    fade: fadeMargin < 10 ? 'Thin fade margin — rain/fade risk' : 'Fade margin looks healthy',
  };
}

export function fibreByNumber(n: number): (typeof FIBRE_COLOURS)[0] | null {
  if (!Number.isFinite(n) || n < 1) return null;
  return FIBRE_COLOURS[(Math.floor(n) - 1) % 12];
}
