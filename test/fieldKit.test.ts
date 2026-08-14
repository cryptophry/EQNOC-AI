import { describe, it, expect } from 'vitest';
import { opticalBudget, irRisePct, irAdvice, stringVoltage, autonomyHours, fadeCheck, fibreByNumber } from '../utils/fieldKit';

describe('opticalBudget', () => {
  it('flags a short 1310 span as PASS with typical SFP numbers', () => {
    const r = opticalBudget({ txPower: 0, rxSensitivity: -20, distance: 10, connectorCount: 2, spliceCount: 4 });
    expect(r.totalLinkLoss).toBeCloseTo(4.9, 1);
    expect(r.status).toBe('PASS');
  });

  it('fails when the span eats the margin', () => {
    const r = opticalBudget({ txPower: -2, rxSensitivity: -14, distance: 40, wavelength: '1310' });
    expect(r.status).toBe('FAIL');
  });
});

describe('battery helpers', () => {
  it('computes IR rise and advice bands', () => {
    expect(irRisePct(2.5, 3.5)).toBeCloseTo(40, 0);
    expect(irAdvice(15).tone).toBe('ok');
    expect(irAdvice(25).tone).toBe('warn');
    expect(irAdvice(40).tone).toBe('danger');
  });

  it('does 48 V float and autonomy', () => {
    expect(stringVoltage(24, 2.27)).toBeCloseTo(54.48, 1);
    expect(autonomyHours(100, 10)).toBe(10);
    expect(autonomyHours(100, 0)).toBeNull();
  });
});

describe('radio / fibre lookup', () => {
  it('flags a 4 dB-low RSL', () => {
    const r = fadeCheck(-48, -44, -70);
    expect(r?.vsDesign).toBe(-4);
    expect(r?.alignment).toMatch(/Below design/);
  });

  it('wraps fibre colours past 12', () => {
    expect(fibreByNumber(1)?.name).toBe('Blue');
    expect(fibreByNumber(13)?.name).toBe('Blue');
    expect(fibreByNumber(7)?.name).toBe('Red');
  });
});
