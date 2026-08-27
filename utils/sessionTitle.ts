import { Message, MessageRole, Session } from '../types';

const SNIPPET_MAX = 40;
const CUSTOM_TITLE_MAX = 80;

/** Auto title from the latest user message — same behaviour as the original session save. */
export function snippetTitle(messages: Message[]): string {
  const latestUser = messages.slice().reverse().find((m) => m.role === MessageRole.USER);
  if (!latestUser) return 'Triage session';
  const text = latestUser.text || '';
  return text.length > SNIPPET_MAX ? text.slice(0, SNIPPET_MAX) + '…' : text;
}

export function displayTitle(title: string | undefined): string {
  return (title || '').trim() || 'Untitled';
}

/** Trimmed custom name, or null if empty (caller must keep the previous title). */
export function parseCustomTitle(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return t.length > CUSTOM_TITLE_MAX ? t.slice(0, CUSTOM_TITLE_MAX) : t;
}

/** Title to persist on save. A user-set name is sticky; otherwise keep the auto snippet. */
export function titleForSave(
  messages: Message[],
  existing?: Pick<Session, 'title' | 'customTitle'>
): { title: string; customTitle?: boolean } {
  if (existing?.customTitle) {
    const kept = (existing.title || '').trim();
    if (kept) return { title: kept, customTitle: true };
  }
  return { title: snippetTitle(messages) };
}
