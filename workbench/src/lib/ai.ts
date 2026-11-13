// Talks to the existing NOC Assistant backend (/api/login, /api/ai), which this
// site reaches same-origin through a Vercel rewrite. The backend fixes the model
// server-side and drops client system messages, so operating instructions ride
// in the first user turn.
import { BY_ID, P_ORDER, PLATFORMS } from '../data';
import { search } from './search';

export class AuthError extends Error {}

export interface Turn { role: 'user' | 'assistant'; content: string }

const FIRST_BYTE_MS = 12_000;

const RULES = `You are the AI panel inside a multi-vendor CLI workbench used by an experienced telecommunications specialist. Platforms in scope: Cisco IOS/IOS-XE, Cisco IOS-XR, Cisco NX-OS, Juniper Junos, Alcatel-Lucent OmniSwitch AOS 8 (mention AOS 6 where it differs).

Rules:
1. Lead with the answer. Put every command in a fenced code block, one block per platform, with the platform named on the line above it.
2. Never invent syntax. If you are not certain a command exists on a platform or release, say so plainly and name the "?" path the user can type to confirm it. An honest "not sure" is required; a plausible guess is a failure.
3. State the release or platform family you are assuming when syntax varies by release.
4. Before any command that can interrupt service, say so in one line.
5. When asked to simulate output, produce realistic output for that platform, start with the line "Simulated output" and then explain which fields matter.
6. When given real device output, say what it shows, what is abnormal, and the next command to run.
7. Write for an expert: no basics, no filler, no closing summary. Australian English.
8. Reference entries from the workbench's curated library may follow. Prefer them over your own recall and say when you go beyond them.`;

function reference(question: string, focusId?: string): string {
  const ids = new Set<string>();
  if (focusId && BY_ID[focusId]) ids.add(focusId);
  for (const h of search(question).slice(0, 5)) ids.add(h.entry.id);
  if (!ids.size) return '';
  const lines = [...ids].map((id) => {
    const x = BY_ID[id];
    const cmds = P_ORDER.map((p) => {
      const name = PLATFORMS.find((q) => q.id === p)!.name;
      const c = x.cmds[p];
      return `  ${name}: ${c ? c.replace(/\n/g, ' ; ') : 'no equivalent'}${x.notes?.[p] ? ` (${x.notes[p]})` : ''}`;
    }).join('\n');
    return `- ${x.title}: ${x.desc}\n${cmds}`;
  });
  return `\n\nCurated library entries that may be relevant:\n${lines.join('\n')}`;
}

export function isSignedIn(): boolean {
  try { return localStorage.getItem('rosetta:signedIn') === '1'; } catch { return false; }
}
function setSignedIn(on: boolean) {
  try { on ? localStorage.setItem('rosetta:signedIn', '1') : localStorage.removeItem('rosetta:signedIn'); } catch { /* ignore */ }
}

export async function signIn(password: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  } catch { throw new Error('Could not reach the server. Check your connection.'); }
  if (res.status === 401) throw new AuthError('That password was not accepted.');
  if (res.status === 429) throw new Error('Too many attempts. Wait a minute, then try again.');
  if (!res.ok) throw new Error(`Sign-in failed (${res.status}).`);
  setSignedIn(true);
}

async function post(body: unknown, signal: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new Error('Could not reach the AI service. The command library still works offline.');
  }
  if (res.status === 401) { setSignedIn(false); throw new AuthError('Sign in to use AI.'); }
  if (res.status === 429) throw new Error('Rate limit reached. Wait a minute, then ask again.');
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j?.error?.message || j?.error || ''; } catch { /* not JSON */ }
    throw new Error(detail ? String(detail) : `The AI service returned an error (${res.status}).`);
  }
  return res;
}

/**
 * Ask the model. Streams text through onText. If a proxy buffers the event
 * stream (common on corporate networks) and no byte arrives in time, the same
 * question is re-sent as a plain request.
 */
export async function ask(turns: Turn[], onText: (full: string) => void, signal: AbortSignal, focusId?: string): Promise<string> {
  const firstUser = turns.findIndex((t) => t.role === 'user');
  const lastUser = [...turns].reverse().find((t) => t.role === 'user')?.content || '';
  const messages = turns.map((t, i) => (i === firstUser
    ? { role: 'user', content: `${RULES}${reference(lastUser, focusId)}\n\n---\n\n${t.content}` }
    : { role: t.role, content: t.content }));
  const base = { messages, max_tokens: 2500, temperature: 0.2 };

  const inner = new AbortController();
  const onAbort = () => inner.abort();
  signal.addEventListener('abort', onAbort);
  let gotByte = false;
  let timedOut = false;
  const timer = setTimeout(() => { if (!gotByte) { timedOut = true; inner.abort(); } }, FIRST_BYTE_MS);

  try {
    const res = await post({ ...base, stream: true }, inner.signal);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      gotByte = true;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let j: any;
        try { j = JSON.parse(data); } catch { continue; }
        if (j.error) throw new Error(typeof j.error === 'string' ? j.error : j.error.message || 'The AI service returned an error.');
        const piece = j.choices?.[0]?.delta?.content;
        if (piece) { gotByte = true; full += piece; onText(full); }
      }
    }
    if (!full) throw new Error('The AI service returned an empty answer. Ask again.');
    return full;
  } catch (err) {
    if (!timedOut || signal.aborted) throw err;
    const res = await post({ ...base, stream: false }, signal);
    const j = await res.json();
    const text: string = j?.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('The AI service returned an empty answer. Ask again.');
    onText(text);
    return text;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}
