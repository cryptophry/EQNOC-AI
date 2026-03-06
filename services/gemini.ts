import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { Session, Message, CommandRef, FlowNode } from "../types";
import { EQNOC_KNOWLEDGE_BASE } from "../constants";

// Initialize AI
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Types ---

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

// --- Functions ---

export const createChatSession = (customKb?: string, history?: any[]) => {
  const systemInstruction = customKb ? `${EQNOC_KNOWLEDGE_BASE}\n\nADDITIONAL CONTEXT (PRIORITY):\n${customKb}` : EQNOC_KNOWLEDGE_BASE;
  
  // Define tools
  const tools: FunctionDeclaration[] = [
    {
        name: 'start_triage_flow',
        description: 'Initiate the visual troubleshooting flowchart for complex faults.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                faultDescription: { type: Type.STRING, description: 'Brief description of the issue.' }
            },
            required: ['faultDescription']
        }
    },
    {
        name: 'generate_shift_report',
        description: 'Generate a handover report for the current shift.'
    },
    {
        name: 'manage_incident',
        description: 'Update the status or delete a shift incident item.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                incidentId: { type: Type.STRING, description: 'The unique ID of the incident.' },
                action: { type: Type.STRING, description: 'Action to perform: RESOLVED, MONITORING, DELETE, OPEN' }
            },
            required: ['incidentId', 'action']
        }
    },
    {
        name: 'start_new_shift',
        description: 'Reset the shift timer and clear current shift logs.'
    },
    {
        name: 'set_alarm',
        description: 'Set a reminder or alarm for a specific time.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                message: { type: Type.STRING, description: 'The reminder text.' },
                type: { type: Type.STRING, enum: ['RELATIVE_MINUTES', 'ABSOLUTE_TIME'] },
                timeValue: { type: Type.STRING, description: 'Minutes (e.g., "15") or Time (e.g., "14:30").' }
            },
            required: ['message', 'type', 'timeValue']
        }
    },
    {
        name: 'calculate_optical_budget',
        description: 'Calculate fiber optical loss budget.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                txPower: { type: Type.NUMBER },
                rxSensitivity: { type: Type.NUMBER },
                distance: { type: Type.NUMBER },
                wavelength: { type: Type.STRING },
                connectorCount: { type: Type.NUMBER },
                spliceCount: { type: Type.NUMBER }
            },
            required: ['txPower', 'rxSensitivity', 'distance']
        }
    },
    {
        name: 'update_notes',
        description: 'Update the persistent scratchpad notes.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                content: { type: Type.STRING },
                mode: { type: Type.STRING, enum: ['APPEND', 'OVERWRITE'] }
            },
            required: ['content']
        }
    }
  ];

  return ai.chats.create({
    model: 'gemini-3.1-pro-preview',
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: tools }]
    },
    ...(history ? { history } : {})
  });
};

export const findRelevantHistory = async (query: string, sessions: Session[]): Promise<string> => {
    // Simple mock RAG for now - find session with keyword match
    // In production, use embeddings
    const relevant = sessions.filter(s => 
        s.title.toLowerCase().includes(query.toLowerCase()) || 
        s.messages.some(m => m.text.toLowerCase().includes(query.toLowerCase()))
    ).slice(0, 3);

    if (relevant.length === 0) return '';

    return `RELEVANT PAST SESSIONS:\n${relevant.map(s => 
        `- [${new Date(s.timestamp).toLocaleDateString()}] "${s.title}": ${s.messages[1]?.text?.slice(0, 100)}...`
    ).join('\n')}`;
};

export const embedText = async (text: string): Promise<number[] | undefined> => {
    // Placeholder for embedding logic if needed
    // Currently relying on Gemini 3's context window instead of strict RAG
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

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt
    });
    return response.text || "Report generation failed.";
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

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt
    });
    return response.text || "Summary generation failed.";
};

export const detectSessionIncidents = async (session: Session): Promise<{title: string, status: string, timestamp: string}[]> => {
    const prompt = `
    Analyze this chat session. Identify distinct technical incidents.
    Return JSON array: [{ title: string, status: "RESOLVED" | "MONITORING" | "OPEN", timestamp: ISOString }]

    Chat:
    ${session.messages.map(m => `${m.timestamp}: ${m.text}`).join('\n')}
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });
    
    try {
        return JSON.parse(response.text || '[]');
    } catch {
        return [];
    }
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

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });

    try {
        return JSON.parse(response.text || 'null');
    } catch {
        return null;
    }
};

export const generateCommandDetails = async (cmdInput: string): Promise<CommandRef | null> => {
    const prompt = `
    User wants to add this command to the library: "${cmdInput}".
    Generate a JSON object with:
    {
      title: string (Short concise title),
      cisco: string (IOS/IOS-XR syntax),
      juniper: string (Junos syntax),
      desc: string (Short description),
      category: string[] (e.g. ['l2', 'bgp', 'phys'])
    }
    If the command doesn't exist in one vendor, provide the best equivalent or "N/A".
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });

    try {
        return JSON.parse(response.text || 'null');
    } catch {
        return null;
    }
};

export const generateRegex = async (description: string): Promise<RegexResult | null> => {
    const prompt = `
    Generate regex for network CLI filtering based on: "${description}".
    Return JSON:
    {
      cisco: string (include/exclude),
      juniper: string (match/except),
      grep: string,
      explanation: string
    }
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });

    try {
        return JSON.parse(response.text || 'null');
    } catch {
        return null;
    }
};

export const lookupMacVendor = async (oui: string): Promise<MacLookupResult | null> => {
    // In production this would be a static DB, but using AI for "simulated" lookup of obscure OUI is fine
    const prompt = `
    Identify the vendor for MAC OUI: ${oui}.
    Return JSON: { vendor: string, country: string, isPrivate: boolean }.
    If unknown, guess based on common prefixes or return "Unknown".
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });

    try {
        return JSON.parse(response.text || 'null');
    } catch {
        return null;
    }
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

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt
    });
    return response.text || "Analysis failed.";
};

export const generateNetworkConfig = async (intent: string, vendor: string): Promise<string> => {
    const prompt = `
    Generate network configuration.
    Vendor: ${vendor}
    Intent: ${intent}
    
    Output ONLY the configuration commands in a code block.
    `;
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt
    });
    return response.text || "";
};

export const assessChangeRisk = async (script: string): Promise<ChangeAuditResult | null> => {
    const prompt = `
    Audit this network change script for risk.
    Return JSON:
    {
      score: number (0-100),
      riskLevel: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
      impactAnalysis: string[],
      preChecks: string[],
      postChecks: string[],
      rollbackPlan: string
    }
    
    Script:
    ${script}
    `;
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });

    try {
        return JSON.parse(response.text || 'null');
    } catch {
        return null;
    }
};

export const generateCommunication = async (type: string, context: string): Promise<string> => {
    const prompt = `
    Draft a professional communication.
    Type: ${type}
    Context:
    ${context}
    `;
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt
    });
    return response.text || "";
};

export const generateTopologyMermaid = async (description: string): Promise<string> => {
    const prompt = `
    Create a Mermaid.js flowchart (graph TD) representing the network topology described below.
    Use standard Mermaid syntax. Return ONLY the code.
    
    Description:
    ${description}
    `;
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt
    });
    return response.text?.replace(/```mermaid/g, '').replace(/```/g, '').trim() || "";
};

export const generateTicketDraft = async (messages: Message[]): Promise<TicketDraft | null> => {
    const prompt = `
    Create a Ticket Draft from this chat session.
    Return JSON:
    {
      shortDescription: string,
      description: string,
      configurationItem: string,
      impact: "High"|"Medium"|"Low",
      urgency: "High"|"Medium"|"Low",
      workNotes: string
    }

    Chat:
    ${messages.map(m => m.text).join('\n')}
    `;
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });

    try {
        return JSON.parse(response.text || 'null');
    } catch {
        return null;
    }
};

export const generateGeoFiberPath = async (query: string): Promise<FiberPathData | null> => {
    // Simulation of GIS data generation
    const prompt = `
    Generate simulated GIS fiber path data for: "${query}".
    Return JSON:
    {
      start: { x: number (0-100), y: number (0-100), name: string },
      end: { x: number (0-100), y: number (0-100), name: string },
      route: Array<{x: number, y: number}> (10-20 points creating a path),
      distance: number (km),
      estimatedLoss: number (dB),
      events: Array<{ distance: number, type: "SPLICE"|"CONNECTOR"|"BEND"|"CUT", loss: number }>
    }
    `;
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });

    try {
        return JSON.parse(response.text || 'null');
    } catch {
        return null;
    }
};