import { describe, it, expect } from 'vitest';
import { extractJson } from '../services/ai';

describe('extractJson', () => {
  it('parses raw JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON wrapped in a ```json fence', () => {
    const text = 'Here you go:\n```json\n{"vendor":"Cisco"}\n```\nHope that helps.';
    expect(extractJson(text)).toEqual({ vendor: 'Cisco' });
  });

  it('parses JSON wrapped in a bare ``` fence', () => {
    expect(extractJson('```\n[1,2,3]\n```')).toEqual([1, 2, 3]);
  });

  it('slices JSON out of surrounding prose when unfenced', () => {
    expect(extractJson('Result: {"ok":true} done')).toEqual({ ok: true });
  });

  it('returns null on unparseable input', () => {
    expect(extractJson('not json at all')).toBeNull();
    expect(extractJson('')).toBeNull();
  });
});
