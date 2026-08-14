import { describe, it, expect } from 'vitest';
import { extractSearchQuery, searchTokens, recordMatchesTokens } from '../lib/retrieve.js';

describe('extractSearchQuery', () => {
  it('pulls the real question out of the SYSTEM STATE wrapper', () => {
    const raw = `[SYSTEM STATE]
- Current site/job: "SACS"
- Scratchpad notes: "buy milk"
[/SYSTEM STATE]

User Query: what's on the single line?`;
    expect(extractSearchQuery(raw)).toEqual({
      question: "what's on the single line?",
      site: 'SACS',
    });
  });

  it('treats a bare message as the question', () => {
    expect(extractSearchQuery('Tell me about SACS')).toEqual({
      question: 'Tell me about SACS',
      site: '',
    });
  });
});

describe('lexical site match', () => {
  it('matches a short site code in the photo title or site field', () => {
    const tokens = searchTokens('Tell me about SACS', '');
    expect(tokens).toContain('sacs');
    expect(recordMatchesTokens({ title: 'Single line diagram', site: 'SACS', summary: 'feeder CB' }, tokens)).toBe(true);
    expect(recordMatchesTokens({ title: 'Random nameplate', site: 'MOARCS' }, tokens)).toBe(false);
  });
});
