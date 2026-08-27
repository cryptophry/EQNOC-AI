import { describe, it, expect } from 'vitest';
import { MessageRole, type Message } from '../types';
import { displayTitle, parseCustomTitle, snippetTitle, titleForSave } from '../utils/sessionTitle';

const msg = (role: MessageRole, text: string): Message => ({
  id: text || role,
  role,
  text,
  timestamp: new Date(0),
});

describe('snippetTitle', () => {
  it('uses the latest user message, truncated at 40 chars', () => {
    const long = 'Check OTDR traces on the SACS feeder span after the overnight outage';
    expect(snippetTitle([msg(MessageRole.USER, 'first'), msg(MessageRole.USER, long)])).toBe(
      long.slice(0, 40) + '…'
    );
  });

  it('falls back when there is no user message', () => {
    expect(snippetTitle([msg(MessageRole.MODEL, 'ready')])).toBe('Triage session');
  });

  it('keeps a short message as-is, including empty image-only text', () => {
    expect(snippetTitle([msg(MessageRole.USER, 'OTDR')])).toBe('OTDR');
    expect(snippetTitle([msg(MessageRole.USER, '')])).toBe('');
  });
});

describe('displayTitle', () => {
  it('shows Untitled when the stored title is empty', () => {
    expect(displayTitle('')).toBe('Untitled');
    expect(displayTitle('  ')).toBe('Untitled');
    expect(displayTitle(undefined)).toBe('Untitled');
    expect(displayTitle('SACS rectifier')).toBe('SACS rectifier');
  });
});

describe('parseCustomTitle', () => {
  it('trims and rejects empty names', () => {
    expect(parseCustomTitle('  SACS job  ')).toBe('SACS job');
    expect(parseCustomTitle('   ')).toBeNull();
    expect(parseCustomTitle('')).toBeNull();
  });

  it('caps very long names', () => {
    const t = parseCustomTitle('x'.repeat(120));
    expect(t).toHaveLength(80);
  });
});

describe('titleForSave', () => {
  const messages = [msg(MessageRole.USER, 'latest snippet')];

  it('keeps a custom title once the user has named the chat', () => {
    expect(titleForSave(messages, { title: 'SACS rectifier', customTitle: true })).toEqual({
      title: 'SACS rectifier',
      customTitle: true,
    });
  });

  it('falls back to the auto snippet when there is no custom title', () => {
    expect(titleForSave(messages, { title: 'old snippet' })).toEqual({ title: 'latest snippet' });
    expect(titleForSave(messages)).toEqual({ title: 'latest snippet' });
  });

  it('does not stick an empty custom title', () => {
    expect(titleForSave(messages, { title: '  ', customTitle: true })).toEqual({
      title: 'latest snippet',
    });
  });
});
