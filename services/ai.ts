// AI service layer — talks to /api/ai (Vercel serverless proxy for OpenRouter).
// The API key never reaches the browser; the proxy holds it server-side.
// Exports keep the same names/signatures as the old services/gemini.ts so
// components did not need rewiring.

import { Session } from "../types";

const API_URL = '/api/ai';
const LOGIN_URL = '/api/login';
const TOKEN_KEY = 'eqnoc_auth_token';

// --- Auth token handling ---
// The token is issued by /api/login after a server-side password check and sent
// as a Bearer header on every AI request. It's kept in memory and mirrored to
// localStorage so a page reload doesn't force re-login.

let authToken: string | null = null;
try { authToken = localStorage.getItem(TOKEN_KEY); } catch {}

export class AuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

export function isAuthenticated(): boolean {
  return !!authToken;
}

export function clearAuth(): void {
  authToken = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

// Verify a password against the server and store the returned token.
export async function login(password: string): Promise<void> {
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.status === 401) throw new AuthError('Invalid credentials');
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch {}
    throw new Error(detail || `Login failed (${res.status})`);
  }
  const data = await res.json();
  if (!data.token) throw new Error('Login response missing token');
  authToken = data.token;
  try { localStorage.setItem(TOKEN_KEY, data.token); } catch {}
}

// --- Types (unchanged from the Gemini version) ---

// Shape of chunks yielded by ChatSession.sendMessageStream — mirrors the parts
// of Gemini's GenerateContentResponse that App.tsx actually used.
export interface StreamChunk {
  text?: string;
  functionCalls?: { id?: string; name: string; args: any }[];
  candidates?: any[]; // kept for compatibility; always empty
}

// --- Low-level helpers ---

async function callApi(body: any, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers,
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

// One-shot utility calls get a 60s timeout so a hung request doesn't spin a
// component's loading state forever.
const ONE_SHOT_TIMEOUT_MS = 60_000;

async function generateText(prompt: string, system?: string): Promise<string> {
  const messages: any[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const res = await callApi({ messages }, AbortSignal.timeout(ONE_SHOT_TIMEOUT_MS));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
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

// --- Chat session with tool calling (OpenAI/OpenRouter format) ---

const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'generate_shift_report',
      description: 'Generate a handover report for the current shift.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'start_new_shift',
      description: 'Reset the shift timer and clear current shift logs.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_alarm',
      description: 'Set a reminder or alarm for a specific time.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The reminder text.' },
          type: { type: 'string', enum: ['RELATIVE_MINUTES', 'ABSOLUTE_TIME'] },
          timeValue: { type: 'string', description: 'Minutes (e.g., "15") or Time (e.g., "14:30").' }
        },
        required: ['message', 'type', 'timeValue']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_optical_budget',
      description: 'Calculate fiber optical loss budget.',
      parameters: {
        type: 'object',
        properties: {
          txPower: { type: 'number' },
          rxSensitivity: { type: 'number' },
          distance: { type: 'number' },
          wavelength: { type: 'string' },
          connectorCount: { type: 'number' },
          spliceCount: { type: 'number' }
        },
        required: ['txPower', 'rxSensitivity', 'distance']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_notes',
      description: 'Update the persistent scratchpad notes.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          mode: { type: 'string', enum: ['APPEND', 'OVERWRITE'] }
        },
        required: ['content']
      }
    }
  }
];

// Message inputs App.tsx passes to sendMessageStream — kept Gemini-shaped for
// compatibility: a plain string, an array of parts ({text} | {inlineData}),
// or an array of tool responses ({functionResponse}).
type GeminiStylePart = { text?: string; inlineData?: { mimeType: string; data: string } };
type GeminiStyleToolResponse = { functionResponse: { id?: string; name: string; response: any } };
type SendMessageInput = string | GeminiStylePart[] | GeminiStyleToolResponse[];

// Keep the client-side conversation bounded: without this, a long shift grows
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
      { messages: this.history, tools: CHAT_TOOLS, stream: true, useKnowledgeBase: true },
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

// --- Feature functions (same signatures as before) ---

export const generateShiftHandover = async (sessions: Session[]): Promise<string> => {
  const sessionSummary = sessions.map(s => `
    - Time: ${new Date(s.timestamp).toLocaleTimeString()}
    - Title: ${s.title}
    - Details: ${s.messages.filter(m => m.role !== 'system').map(m => `[${m.role}]: ${m.text}`).join(' | ').substring(0, 500)}...
    `).join('\n');

  const dateStr = new Date().toLocaleDateString();

  const prompt = `
    You are a Network Operations Center Senior Engineer acting as an assistant.
    Generate a formal shift handover email based EXCLUSIVELY on the following activity log.

    STRICT FORMATTING REQUIREMENTS:
    1. Start with "Hi Team,"
    2. Header: "Please find below the handover notes from [Shift Name e.g. Late Shift] (${dateStr})"
    3. Use the section headers below.

    SECTIONS TO POPULATE:

    --- Incidents / Outages ---
    [Format: EQNINCxxxxxxx - Title/Location - Description - Status]
    (CRITICAL RULE: ONLY include incidents/outages that the USER explicitly mentioned, asked about, or worked on.)
    (IGNORE any outages that were only mentioned by the System/Assistant as a status update or greeting if the User did not engage with them.)
    (If Ticket ID is missing, generate a placeholder EQNINC...)
    (If no user-engaged incidents exist, write "Nil")

    --- Changes Implemented ---
    [Format: EQNCHGxxxxxxx - Description - Time - Outcome]
    (Extract configuration changes or planned works completed. If none, write "Nil")

    --- Changes Scheduled for Next Shift ---
    (Infer from logs if there are upcoming scheduled works. If none, write "Nil")

    --- Generators Running ---
    [Format: Site Name - [Details provided by user including fuel level]]
    (Example: "MOARCS - Running on generator due to mains failure - Fuel 94%")
    (Include this section ONLY if specific generator info was provided by the user. If not, OMIT this entire section.)

    --- Active RTUs Currently Down ---
    (Include ONLY if RTU/SCADA devices were reported down by the user. List them. If none, OMIT this entire section)

    --- Shift-End Validation Checklist ---
    [ ] All site access logs reviewed and confirmed closed.
    [ ] Fuel levels checked on all running generators.
    [ ] Phone queue verified empty (0 calls waiting).
    [ ] Alarm console clear critical alerts. (Mark as [ ] if there are active incidents in the first section, otherwise [/])
    [ ] All open incidents from shift handed over with latest status in ticket system.

    ACTIVITY LOG:
    ${sessionSummary}
    `;

  return (await generateText(prompt)) || "Report generation failed.";
};

