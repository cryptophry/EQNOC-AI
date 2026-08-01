// AI service layer — talks to /api/ai (Vercel serverless proxy for OpenRouter).
// The API key never reaches the browser; the proxy holds it server-side.
// Exports keep the same names/signatures as the old services/gemini.ts so
// components did not need rewiring.

import { Session, Message, CommandRef, FlowNode } from "../types";
import { EQNOC_KNOWLEDGE_BASE } from "../constants";

const API_URL = '/api/ai';

// --- Types (unchanged from the Gemini version) ---

export interface RegexResult {
  cisco: string;
  juniper: string;
  grep: string;
  explanation: string;
}

export interface MacLookupResult {
  vendor: string;
  country: string;
  isPrivate: boolean;
}

export interface ChangeAuditResult {
  score: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  impactAnalysis: string[];
  preChecks: string[];
  postChecks: string[];
  rollbackPlan: string;
}

export interface FiberPathData {
  start: { x: number, y: number, name: string };
  end: { x: number, y: number, name: string };
  route: { x: number, y: number }[];
  distance: number;
  estimatedLoss: number;
  events: { distance: number, type: 'SPLICE' | 'CONNECTOR' | 'BEND' | 'CUT', loss: number }[];
}

export interface TicketDraft {
  shortDescription: string;
  description: string;
  configurationItem: string;
  impact: string;
  urgency: string;
  workNotes: string;
}

export interface OutageRecord {
  council?: string;
  type: string;
  suburb: string;
  status: string;
  location: string;
  eventId?: string;
  startTime?: string;
  customersAffected: number | string;
  estFix: string;
  description: string;
}

// Shape of chunks yielded by ChatSession.sendMessageStream — mirrors the parts
// of Gemini's GenerateContentResponse that App.tsx actually used.
export interface StreamChunk {
  text?: string;
  functionCalls?: { id?: string; name: string; args: any }[];
  candidates?: any[]; // kept for compatibility; always empty
}

// --- Low-level helpers ---

async function callApi(body: any): Promise<Response> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || (await res.text()); } catch {}
    throw new Error(`AI proxy error ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res;
}

async function generateText(prompt: string, system?: string): Promise<string> {
  const messages: any[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const res = await callApi({ messages });
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

async function generateJson<T>(prompt: string): Promise<T | null> {
  const text = await generateText(
    `${prompt}\n\nIMPORTANT: Respond with ONLY the raw JSON. No markdown fences, no commentary.`
  );
  return extractJson<T>(text);
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
      name: 'start_triage_flow',
      description: 'Initiate the visual troubleshooting flowchart for complex faults.',
      parameters: {
        type: 'object',
        properties: {
          faultDescription: { type: 'string', description: 'Brief description of the issue.' }
        },
        required: ['faultDescription']
      }
    }
  },
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
      name: 'manage_incident',
      description: 'Update the status or delete a shift incident item.',
      parameters: {
        type: 'object',
        properties: {
          incidentId: { type: 'string', description: 'The unique ID of the incident.' },
          action: { type: 'string', description: 'Action to perform: RESOLVED, MONITORING, DELETE, OPEN' }
        },
        required: ['incidentId', 'action']
      }
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

export class ChatSession {
  private history: any[] = [];

  constructor(systemInstruction: string, history?: any[]) {
    this.history.push({ role: 'system', content: systemInstruction });
    if (history) this.history.push(...history);
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

    const res = await callApi({ messages: this.history, tools: CHAT_TOOLS, stream: true });

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

export const createChatSession = (customKb?: string, history?: any[]) => {
  const systemInstruction = customKb
    ? `${EQNOC_KNOWLEDGE_BASE}\n\nADDITIONAL CONTEXT (PRIORITY):\n${customKb}`
    : EQNOC_KNOWLEDGE_BASE;
  return new ChatSession(systemInstruction, history);
};

// --- Feature functions (same signatures as before) ---

export const findRelevantHistory = async (query: string, sessions: Session[]): Promise<string> => {
  const relevant = sessions.filter(s =>
    s.title.toLowerCase().includes(query.toLowerCase()) ||
    s.messages.some(m => m.text.toLowerCase().includes(query.toLowerCase()))
  ).slice(0, 3);

  if (relevant.length === 0) return '';

  return `RELEVANT PAST SESSIONS:\n${relevant.map(s =>
    `- [${new Date(s.timestamp).toLocaleDateString()}] "${s.title}": ${s.messages[1]?.text?.slice(0, 100)}...`
  ).join('\n')}`;
};

export const embedText = async (_text: string): Promise<number[] | undefined> => {
  return undefined;
};

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

export const generateIncidentSummary = async (session: Session, focusText: string): Promise<string> => {
  const prompt = `
    Summarize this specific incident based on the chat logs.
    Focus on: Root Cause, Resolution, and Timeline.

    Session Title: ${session.title}
    Focus Activity: ${focusText}

    Logs:
    ${session.messages.map(m => `${m.role}: ${m.text}`).join('\n')}
    `;

  return (await generateText(prompt)) || "Summary generation failed.";
};

export const detectSessionIncidents = async (session: Session): Promise<{ title: string, status: string, timestamp: string }[]> => {
  const prompt = `
    Analyze this chat session. Identify distinct technical incidents.
    Return JSON array: [{ "title": string, "status": "RESOLVED" | "MONITORING" | "OPEN", "timestamp": ISOString }]

    Chat:
    ${session.messages.map(m => `${m.timestamp}: ${m.text}`).join('\n')}
    `;

  return (await generateJson<{ title: string, status: string, timestamp: string }[]>(prompt)) || [];
};

export const generateTroubleshootingFlow = async (description: string): Promise<FlowNode | null> => {
  const prompt = `
    Create a troubleshooting flowchart for this network issue: "${description}".
    Return a JSON object representing a decision tree.

    Schema:
    interface FlowNode {
      id: string;
      title: string;
      description?: string;
      type: 'action' | 'command' | 'decision' | 'solution';
      command?: string;
      branches?: { label: string, node: FlowNode }[];
    }

    Example: "If ping fails, branch to 'Check ARP'. If ping works, branch to 'Check BGP'."
    Make it technical (Cisco/Juniper commands).
    `;

  return generateJson<FlowNode>(prompt);
};

export const generateCommandDetails = async (cmdInput: string): Promise<CommandRef | null> => {
  const prompt = `
    User wants to add this command to the library: "${cmdInput}".
    Generate a JSON object with:
    {
      "title": string (Short concise title),
      "cisco": string (IOS/IOS-XR syntax),
      "juniper": string (Junos syntax),
      "desc": string (Short description),
      "category": string[] (e.g. ["l2", "bgp", "phys"])
    }
    If the command doesn't exist in one vendor, provide the best equivalent or "N/A".
    `;

  return generateJson<CommandRef>(prompt);
};

export const generateRegex = async (description: string): Promise<RegexResult | null> => {
  const prompt = `
    Generate regex for network CLI filtering based on: "${description}".
    Return JSON:
    {
      "cisco": string (include/exclude),
      "juniper": string (match/except),
      "grep": string,
      "explanation": string
    }
    `;

  return generateJson<RegexResult>(prompt);
};

export const lookupMacVendor = async (oui: string): Promise<MacLookupResult | null> => {
  const prompt = `
    Identify the vendor for MAC OUI: ${oui}.
    Return JSON: { "vendor": string, "country": string, "isPrivate": boolean }.
    If unknown, guess based on common prefixes or return "Unknown".
    `;

  return generateJson<MacLookupResult>(prompt);
};

export const analyzeRawLogs = async (logs: string): Promise<string> => {
  const prompt = `
    Analyze these raw network logs.
    Identify:
    1. Root Cause Patterns
    2. Timestamps of failure
    3. Correlated events

    Logs:
    ${logs.substring(0, 50000)}
    `;

  return (await generateText(prompt)) || "Analysis failed.";
};

export const generateNetworkConfig = async (intent: string, vendor: string): Promise<string> => {
  const prompt = `
    Generate network configuration.
    Vendor: ${vendor}
    Intent: ${intent}

    Output ONLY the configuration commands in a code block.
    `;
  return (await generateText(prompt)) || "";
};

export const assessChangeRisk = async (script: string): Promise<ChangeAuditResult | null> => {
  const prompt = `
    Audit this network change script for risk.
    Return JSON:
    {
      "score": number (0-100),
      "riskLevel": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
      "impactAnalysis": string[],
      "preChecks": string[],
      "postChecks": string[],
      "rollbackPlan": string
    }

    Script:
    ${script}
    `;

  return generateJson<ChangeAuditResult>(prompt);
};

export const generateCommunication = async (type: string, context: string): Promise<string> => {
  const prompt = `
    Draft a professional communication.
    Type: ${type}
    Context:
    ${context}
    `;
  return (await generateText(prompt)) || "";
};

export const generateTopologyMermaid = async (description: string): Promise<string> => {
  const prompt = `
    Create a Mermaid.js flowchart (graph TD) representing the network topology described below.
    Use standard Mermaid syntax. Return ONLY the code.

    Description:
    ${description}
    `;
  const text = await generateText(prompt);
  return text?.replace(/```mermaid/g, '').replace(/```/g, '').trim() || "";
};

export const generateTicketDraft = async (messages: Message[]): Promise<TicketDraft | null> => {
  const prompt = `
    Create a Ticket Draft from this chat session.
    Return JSON:
    {
      "shortDescription": string,
      "description": string,
      "configurationItem": string,
      "impact": "High"|"Medium"|"Low",
      "urgency": "High"|"Medium"|"Low",
      "workNotes": string
    }

    Chat:
    ${messages.map(m => m.text).join('\n')}
    `;

  return generateJson<TicketDraft>(prompt);
};

export const generateGeoFiberPath = async (query: string): Promise<FiberPathData | null> => {
  const prompt = `
    Generate simulated GIS fiber path data for: "${query}".
    Return JSON:
    {
      "start": { "x": number (0-100), "y": number (0-100), "name": string },
      "end": { "x": number (0-100), "y": number (0-100), "name": string },
      "route": Array<{"x": number, "y": number}> (10-20 points creating a path),
      "distance": number (km),
      "estimatedLoss": number (dB),
      "events": Array<{ "distance": number, "type": "SPLICE"|"CONNECTOR"|"BEND"|"CUT", "loss": number }>
    }
    `;

  return generateJson<FiberPathData>(prompt);
};
