// AI service layer — talks to /api/ai (Vercel serverless proxy for OpenRouter).
// The API key never reaches the browser; the proxy holds it server-side.
// Exports keep the same names/signatures as the old services/gemini.ts so
// components did not need rewiring.

import { SourceExcerpt } from "../types";

const API_URL = '/api/ai';
const LOGIN_URL = '/api/login';
const LOGOUT_URL = '/api/logout';
const SIGNED_IN_KEY = 'eqnoc_signed_in';

// The session token is an HttpOnly cookie set by /api/login. The browser only
// stores a non-secret flag so a reload can skip the login screen; JS never
// holds the token (so XSS cannot exfiltrate it).

function readSignedIn(): boolean {
  try { return localStorage.getItem(SIGNED_IN_KEY) === '1'; } catch { return false; }
}
function writeSignedIn(on: boolean): void {
  try {
    if (on) localStorage.setItem(SIGNED_IN_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch { /* ignore */ }
}

export class AuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
  }
}

export function isAuthenticated(): boolean {
  return readSignedIn();
}

export function clearAuth(): void {
  writeSignedIn(false);
  try { localStorage.removeItem('eqnoc_auth_token'); } catch { /* leftover from pre-cookie auth */ }
}

export async function logout(): Promise<void> {
  try { await fetch(LOGOUT_URL, { method: 'POST' }); } catch { /* ignore */ }
  clearAuth();
}

// Silent session renewal: the cookie is sent automatically. Returns false when
// the session is expired/invalid. Network failures leave the flag untouched
// (offline-safe).
export async function refreshAuthToken(): Promise<boolean> {
  if (!readSignedIn()) return false;
  let res: Response;
  try {
    res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: true }),
    });
  } catch {
    return true;
  }
  if (res.status === 401) { clearAuth(); return false; }
  if (!res.ok) return true;
  return true;
}

export async function login(password: string): Promise<void> {
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.status === 401) throw new AuthError('Invalid credentials');
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* ignore */ }
    throw new Error(detail || `Login failed (${res.status})`);
  }
  writeSignedIn(true);
}

// Note: login JSON may still include `token` so older cached PWA clients
// (which stored it in localStorage) keep working after the cookie migration.

// --- Types (unchanged from the Gemini version) ---

// Shape of chunks yielded by ChatSession.sendMessageStream — mirrors the parts
// of Gemini's GenerateContentResponse that App.tsx actually used.
export interface StreamChunk {
  text?: string;
  functionCalls?: { id?: string; name: string; args: any }[];
  sources?: SourceExcerpt[]; // retrieved excerpts (emitted once, before the answer)
  candidates?: any[]; // kept for compatibility; always empty
}

// --- Low-level helpers ---

async function callApi(body: any, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 401) {
    clearAuth();
    throw new AuthError('Session expired. Please sign in again.');
  }
  if (!res.ok) {
    let detail = '';
    try {
      const text = await res.text();
      try {
        const j = JSON.parse(text);
        detail = j?.error?.message || j?.error || text;
      } catch {
        detail = text;
      }
    } catch {}
    throw new Error(`AI proxy error ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res;
}

// Robust JSON extraction: models sometimes wrap JSON in ```json fences or prose.
export function extractJson<T>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    try { return JSON.parse(c.trim()) as T; } catch {}
    // Last resort: slice from first { or [ to last } or ]
    const start = Math.min(...['{', '['].map(ch => { const i = c.indexOf(ch); return i === -1 ? Infinity : i; }));
    const end = Math.max(c.lastIndexOf('}'), c.lastIndexOf(']'));
    if (start !== Infinity && end > start) {
      try { return JSON.parse(c.slice(start, end + 1)) as T; } catch {}
    }
  }
  return null;
}

// --- Health check (drives the ONLINE/OFFLINE indicator) ---

export async function checkAiHealth(): Promise<{ ok: boolean; configured: boolean; model?: string }> {
  try {
    const res = await fetch(API_URL, { method: 'GET' });
    if (!res.ok) return { ok: false, configured: false };
    const data = await res.json();
    return { ok: true, configured: !!data.configured, model: data.model };
  } catch {
    return { ok: false, configured: false };
  }
}

// Message inputs App.tsx passes to sendMessageStream — kept Gemini-shaped for
// compatibility: a plain string, an array of parts ({text} | {inlineData}),
// or an array of tool responses ({functionResponse}).
type GeminiStylePart = { text?: string; inlineData?: { mimeType: string; data: string } };
type GeminiStyleToolResponse = { functionResponse: { id?: string; name: string; response: any } };
type SendMessageInput = string | GeminiStylePart[] | GeminiStyleToolResponse[];

// Keep the client-side conversation bounded: without this, a long day grows
// the request every turn until it exceeds the model context window (400s).
// Counts individual messages (a turn may be user + assistant + tool messages).
const MAX_HISTORY_MESSAGES = 40;

// Trim to the most recent messages, cutting only at a clean user-turn boundary
// so we never orphan a `tool` message or an assistant(tool_calls) from its tools.
// Pure + exported for unit testing.
export function windowHistory<T extends { role: string }>(history: T[], max: number): T[] {
  if (history.length <= max) return history;
  let start = history.length - max;
  while (start < history.length && history[start].role !== 'user') start++;
  if (start > 0 && start < history.length) return history.slice(start);
  return history;
}

export class ChatSession {
  private history: any[] = [];
  private abortController: AbortController | null = null;

  // The knowledge-base system prompt is injected server-side (api/ai.js) via the
  // useKnowledgeBase flag, so it never ships in the client bundle and isn't
  // re-sent from the browser each turn. Client history holds only the turns.
  constructor(history?: any[]) {
    if (history) this.history.push(...history);
  }

  // Cancel any in-flight request (called when a new message is sent, or on unmount).
  abort() {
    this.abortController?.abort();
    this.abortController = null;
  }

  // Drop base64 image parts from past user turns — the model already produced a
  // text response for them, so re-sending the image every turn just wastes tokens.
  private stripImagesFromHistory() {
    for (const m of this.history) {
      if (m.role === 'user' && Array.isArray(m.content)) {
        m.content = m.content.map((p: any) =>
          p?.type === 'image_url' ? { type: 'text', text: '[image omitted from history]' } : p
        );
      }
    }
  }

  private trimHistory() {
    this.history = windowHistory(this.history, MAX_HISTORY_MESSAGES);
  }

  async *sendMessageStream({ message }: { message: SendMessageInput }): AsyncGenerator<StreamChunk> {
    // Convert the incoming message to OpenAI format and append to history
    if (typeof message === 'string') {
      this.history.push({ role: 'user', content: message });
    } else if (Array.isArray(message) && message.length > 0 && 'functionResponse' in (message[0] as any)) {
      for (const tr of message as GeminiStyleToolResponse[]) {
        this.history.push({
          role: 'tool',
          tool_call_id: tr.functionResponse.id || tr.functionResponse.name,
          content: typeof tr.functionResponse.response === 'string'
            ? tr.functionResponse.response
            : JSON.stringify(tr.functionResponse.response),
        });
      }
    } else {
      const content: any[] = [];
      for (const part of message as GeminiStylePart[]) {
        if (part.text) content.push({ type: 'text', text: part.text });
        if (part.inlineData) {
          content.push({
            type: 'image_url',
            image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }
          });
        }
      }
      this.history.push({ role: 'user', content });
    }

    this.abortController = new AbortController();
    const res = await callApi(
      { messages: this.history, stream: true, useKnowledgeBase: true },
      this.abortController.signal
    );

    // Parse the SSE stream
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    // Accumulate tool call deltas by index (OpenAI streaming format)
    const toolCallAcc: Record<number, { id?: string; name: string; args: string }> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        let parsed: any;
        try { parsed = JSON.parse(data); } catch { continue; }

        // Custom server event: retrieved source excerpts for verification.
        if (Array.isArray(parsed.sources)) {
          yield { sources: parsed.sources };
          continue;
        }

        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          fullText += delta.content;
          yield { text: delta.content };
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallAcc[idx]) toolCallAcc[idx] = { name: '', args: '' };
            if (tc.id) toolCallAcc[idx].id = tc.id;
            if (tc.function?.name) toolCallAcc[idx].name += tc.function.name;
            if (tc.function?.arguments) toolCallAcc[idx].args += tc.function.arguments;
          }
        }
      }
    }

    // Record the assistant turn in history (required before tool responses)
    const assistantMsg: any = { role: 'assistant', content: fullText || null };
    const completedCalls = Object.entries(toolCallAcc)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, tc]) => tc);

    if (completedCalls.length > 0) {
      assistantMsg.tool_calls = completedCalls.map((tc, i) => ({
        id: tc.id || `call_${i}`,
        type: 'function',
        function: { name: tc.name, arguments: tc.args || '{}' }
      }));
    }
    this.history.push(assistantMsg);

    // Turn complete: drop now-redundant images and bound the history length.
    this.stripImagesFromHistory();
    this.trimHistory();

    // Emit completed function calls as a final chunk (Gemini-style)
    if (completedCalls.length > 0) {
      yield {
        functionCalls: completedCalls.map((tc, i) => {
          let args: any = {};
          try { args = JSON.parse(tc.args || '{}'); } catch {}
          return { id: tc.id || `call_${i}`, name: tc.name, args };
        })
      };
    }
  }
}

export const createChatSession = (history?: any[]) => {
  return new ChatSession(history);
};


