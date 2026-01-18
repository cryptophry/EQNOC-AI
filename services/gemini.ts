import { GoogleGenAI, GenerateContentResponse, Chat, Type, Schema } from "@google/genai";
import { Session, Message, CommandRef, FlowNode, MessageRole } from "../types";
import { EQNOC_KNOWLEDGE_BASE } from "../constants";

// Initialize AI
export const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Types ---

export interface OutageRecord {
  suburb: string;
  location: string;
  customersAffected: string;
  status: string;
  estFix: string;
  description: string;
  type: string;
  startTime?: string;
  council?: string;
  eventId?: string;
}

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

// --- Functions ---

export const createChatSession = (customKb?: string, history?: any[]): Chat => {
  const systemInstruction = customKb ? `${EQNOC_KNOWLEDGE_BASE}\n\nADDITIONAL CONTEXT (PRIORITY):\n${customKb}` : EQNOC_KNOWLEDGE_BASE;
  
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction,
      tools: [
        {
          functionDeclarations: [
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
              description: 'Generate a handover report for the current shift.',
              parameters: { type: Type.OBJECT, properties: {} }
            },
            {
                name: 'manage_incident',
                description: 'Update the status or delete a shift incident item.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        incidentId: { type: Type.STRING, description: 'The unique ID of the incident.' },
                        action: { type: Type.STRING, enum: ['RESOLVED', 'MONITORING', 'DELETE'] }
                    },
                    required: ['incidentId', 'action']
                }
            },
             {
                name: 'start_new_shift',
                description: 'Reset shift timer and clear logs for a new shift.',
                parameters: { type: Type.OBJECT, properties: {} }
            },
            {
                name: 'set_alarm',
                description: 'Set a reminder or alarm.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        message: { type: Type.STRING },
                        type: { type: Type.STRING, enum: ['RELATIVE_MINUTES', 'ABSOLUTE_TIME'] },
                        timeValue: { type: Type.STRING, description: 'Number of minutes (string) or HH:MM time.' }
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
                description: 'Update, append, or clear the user\'s scratchpad notes.',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        content: { type: Type.STRING, description: 'The text content to write.' },
                        mode: { type: Type.STRING, enum: ['APPEND', 'OVERWRITE'], description: 'Whether to append to existing notes or overwrite them. Default is APPEND.' }
                    },
                    required: ['content']
                }
            }
          ]
        }
      ]
    },
    history: history
  });
};

export const embedText = async (text: string): Promise<number[] | null> => {
  if (!text || !text.trim()) return null;
  try {
    const result = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: {
        parts: [{ text: text }]
      }
    });
    return result.embedding?.values || null;
  } catch (e) {
    console.error("Embedding failed", e);
    return null;
  }
};

function cosineSimilarity(vecA: number[], vecB: number[]) {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magnitudeA += vecA[i] * vecA[i];
        magnitudeB += vecB[i] * vecB[i];
    }
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
}

export const findRelevantHistory = async (query: string, sessions: Session[]): Promise<string> => {
  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) return "";

  const relevant = sessions
    .filter(s => s.embedding)
    .map(s => ({
      ...s,
      score: cosineSimilarity(queryEmbedding, s.embedding!)
    }))
    .filter(s => s.score > 0.65)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (relevant.length === 0) return "";

  return "RELEVANT PAST SESSIONS:\n" + relevant.map(s => 
    `[Date: ${new Date(s.timestamp).toLocaleDateString()}] Title: ${s.title}\nSummary: ${s.messages.slice(0, 5).map(m => m.text).join(' ')}`
  ).join('\n\n');
};

export const generateCommandDetails = async (input: string): Promise<CommandRef | null> => {
    const prompt = `Generate a CommandRef object for: "${input}". 
    Identify the Cisco IOS-XR and Juniper Junos equivalents. 
    Category options: phys, l2, l3, ospf, bgp, mpls, logs, sec.
    Return JSON only.`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            cisco: { type: Type.STRING },
            juniper: { type: Type.STRING },
            desc: { type: Type.STRING },
            category: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['title', 'cisco', 'juniper', 'desc', 'category']
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema
            }
        });
        if (response.text) {
             return JSON.parse(response.text) as CommandRef;
        }
        return null;
    } catch (e) {
        console.error(e);
        return null;
    }
};

export const generateTroubleshootingFlow = async (input: string): Promise<FlowNode | null> => {
    const prompt = `Generate a troubleshooting flowchart for: "${input}". Return a hierarchical JSON object (FlowNode).`;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                systemInstruction: `Return a FlowNode object.
                Interface:
                interface FlowNode {
                  id: string;
                  title: string;
                  description?: string;
                  type: 'action' | 'command' | 'decision' | 'solution';
                  command?: string;
                  branches?: { label: string; node: FlowNode }[];
                }
                `
            }
        });
        if (response.text) return JSON.parse(response.text) as FlowNode;
        return null;
    } catch(e) {
        console.error(e);
        return null;
    }
};

// Internal parsing logic
const parseOutageData = async (textData: string): Promise<OutageRecord[]> => {
    // Increased specific instructions for high volume data extraction
    const prompt = `
    CRITICAL TASK: Extract **ALL** outage records from the raw text below.
    
    SOURCE: Ergon Energy Outage Finder
    INSTRUCTION: 
    1. Scan the ENTIRE text block.
    2. Identify every single outage row/item listed. 
    3. Do NOT summarize. Do NOT limit to top 5. If there are 50 outages, return 50 objects.
    4. Extract fields: Suburb, Street/Location, Customers Affected, Status, Estimated Fix Time, Fault Description.
    
    RAW TEXT DATA (START):
    ${textData.substring(0, 150000)} 
    RAW TEXT DATA (END)
    `;

    const schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                suburb: { type: Type.STRING },
                location: { type: Type.STRING },
                customersAffected: { type: Type.STRING },
                status: { type: Type.STRING },
                estFix: { type: Type.STRING },
                description: { type: Type.STRING },
                type: { type: Type.STRING },
                startTime: { type: Type.STRING },
                council: { type: Type.STRING },
                eventId: { type: Type.STRING }
            },
            required: ['suburb', 'status', 'description', 'type']
        }
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema
            }
        });
        if (response.text) return JSON.parse(response.text) as OutageRecord[];
        return [];
    } catch(e) {
        console.error(e);
        return [];
    }
};

export const fetchErgonOutages = async (): Promise<{records: OutageRecord[], source: 'LIVE' | 'SEARCH' | 'SIMULATION'}> => {
  const targetUrl = 'https://www.ergon.com.au/network/outages/outage-finder/outage-finder-text-view';
  
  // Strategy 1: Proxy Fetch + AI Parse (High Fidelity for Raw Data)
  // We use Jina because it renders the page into LLM-friendly Markdown, often preserving full tables.
  try {
    const proxyUrl = `https://r.jina.ai/${targetUrl}`;
    const response = await fetch(proxyUrl);
    if (response.ok) {
      const text = await response.text();
      // Basic validation to ensure we got content and not a block page
      if (!text.includes('Access Denied') && text.length > 500) {
        const records = await parseOutageData(text);
        if (records.length > 0) return { records, source: 'LIVE' };
      }
    }
  } catch (e) { console.log("Jina proxy failed, falling back..."); }

  // Strategy 2: AI Search Grounding (Aggressive Extraction)
  // If direct proxy fails, we ask the model to search and scrape.
  try {
     const prompt = `
     Perform a comprehensive Google Search for "Ergon Energy Outage Finder Text View current outages list".
     
     Your Goal: Retrieve the FULL LIST of current outages.
     
     INSTRUCTIONS:
     1. Find the official text view page or a reliable aggregator.
     2. Read through the ENTIRE list of unplanned and planned outages available in the search grounding data.
     3. Extract EVERY SINGLE entry you find. Do NOT stop after the first few.
     4. Format exactly as a JSON array.
     `;
     
     const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
           tools: [{ googleSearch: {} }],
           responseMimeType: 'application/json'
        }
     });
     
     if (response.text) {
        const records = JSON.parse(response.text) as OutageRecord[];
        if (records.length > 0) return { records, source: 'SEARCH' };
     }
  } catch(e) { console.log("Search strategy failed"); }

  // Fallback: If all else fails, return empty to trigger simulation mode in UI
  return { records: [], source: 'SIMULATION' };
}


export const generateRegex = async (input: string): Promise<RegexResult | null> => {
     const prompt = `Create Regex for: "${input}"`;
     const schema = {
        type: Type.OBJECT,
        properties: {
            cisco: { type: Type.STRING },
            juniper: { type: Type.STRING },
            grep: { type: Type.STRING },
            explanation: { type: Type.STRING }
        },
        required: ['cisco', 'juniper', 'grep', 'explanation']
     };
     
     try {
         const response = await ai.models.generateContent({
             model: 'gemini-3-flash-preview',
             contents: prompt,
             config: { responseMimeType: 'application/json', responseSchema: schema }
         });
         if(response.text) return JSON.parse(response.text) as RegexResult;
         return null;
     } catch(e) { return null; }
};

export const lookupMacVendor = async (mac: string): Promise<MacLookupResult | null> => {
    const prompt = `Identify MAC OUI: ${mac}`;
    const schema = {
        type: Type.OBJECT,
        properties: {
            vendor: { type: Type.STRING },
            country: { type: Type.STRING },
            isPrivate: { type: Type.BOOLEAN }
        },
        required: ['vendor', 'country', 'isPrivate']
    };
    try {
         const response = await ai.models.generateContent({
             model: 'gemini-3-flash-preview',
             contents: prompt,
             config: { responseMimeType: 'application/json', responseSchema: schema }
         });
         if(response.text) return JSON.parse(response.text) as MacLookupResult;
         return null;
    } catch(e) { return null; }
};

export const generateTopologyMermaid = async (input: string): Promise<string> => {
    const prompt = `Generate a Mermaid JS graph definition (graph TD or graph LR) for the following network description or CLI output. Return ONLY the mermaid code, no markdown.
    
    Input: ${input}`;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });
        return response.text || '';
    } catch(e) { return ''; }
};

export const analyzeRawLogs = async (logs: string): Promise<string> => {
    const prompt = `Analyze these network logs. Identify root cause, patterns, and suggest fixes. Be concise.
    
    Logs:
    ${logs.substring(0, 10000)}`;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt
        });
        return response.text || '';
    } catch(e) { return ''; }
};

export const generateNetworkConfig = async (intent: string, vendor: string): Promise<string> => {
    const prompt = `Generate ${vendor} configuration for: ${intent}. Return only the config commands.`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt
        });
        return response.text || '';
    } catch(e) { return ''; }
};

export const assessChangeRisk = async (script: string): Promise<ChangeAuditResult | null> => {
    const prompt = `Assess risk for this network change script.`;
    const schema = {
        type: Type.OBJECT,
        properties: {
            score: { type: Type.NUMBER },
            riskLevel: { type: Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
            impactAnalysis: { type: Type.ARRAY, items: { type: Type.STRING } },
            preChecks: { type: Type.ARRAY, items: { type: Type.STRING } },
            postChecks: { type: Type.ARRAY, items: { type: Type.STRING } },
            rollbackPlan: { type: Type.STRING }
        },
        required: ['score', 'riskLevel', 'impactAnalysis', 'preChecks', 'postChecks', 'rollbackPlan']
    };
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: schema }
        });
        if (response.text) return JSON.parse(response.text) as ChangeAuditResult;
        return null;
    } catch(e) { return null; }
};

export const generateCommunication = async (type: string, context: string): Promise<string> => {
    const prompt = `Draft a ${type} based on: ${context}`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });
        return response.text || '';
    } catch(e) { return ''; }
};

export const generateIncidentSummary = async (session: Session, focus?: string): Promise<string> => {
     const prompt = `Summarize incident from session. Focus: ${focus || 'General'}.
     Session: ${JSON.stringify(session.messages)}`;
     try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });
        return response.text || '';
     } catch(e) { return ''; }
};

export const detectSessionIncidents = async (session: Session): Promise<{title: string, timestamp: number, status: string}[]> => {
    const prompt = `Detect incidents in session. Return JSON array.`;
    const schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING },
                timestamp: { type: Type.NUMBER },
                status: { type: Type.STRING }
            },
            required: ['title', 'timestamp', 'status']
        }
    };
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt + `\n${JSON.stringify(session.messages)}`,
            config: { responseMimeType: 'application/json', responseSchema: schema }
        });
        if (response.text) return JSON.parse(response.text);
        return [];
    } catch(e) { return []; }
};

export const generateGeoFiberPath = async (query: string): Promise<FiberPathData | null> => {
    const prompt = `Generate simulated fiber path data for: ${query}. Return JSON.`;
    try {
        const response = await ai.models.generateContent({
             model: 'gemini-3-flash-preview',
             contents: prompt,
             config: { responseMimeType: 'application/json' }
        });
        if (response.text) return JSON.parse(response.text) as FiberPathData;
        return null;
    } catch(e) { return null; }
};

export const generateTicketDraft = async (messages: Message[]): Promise<TicketDraft | null> => {
    const prompt = `Draft a ticket based on these messages.`;
    const schema = {
        type: Type.OBJECT,
        properties: {
            shortDescription: { type: Type.STRING },
            description: { type: Type.STRING },
            configurationItem: { type: Type.STRING },
            impact: { type: Type.STRING },
            urgency: { type: Type.STRING },
            workNotes: { type: Type.STRING }
        },
        required: ['shortDescription', 'description', 'configurationItem', 'impact', 'urgency', 'workNotes']
    };
    try {
         const response = await ai.models.generateContent({
             model: 'gemini-3-flash-preview',
             contents: prompt + `\n${JSON.stringify(messages)}`,
             config: { responseMimeType: 'application/json', responseSchema: schema }
         });
         if (response.text) return JSON.parse(response.text) as TicketDraft;
         return null;
    } catch(e) { return null; }
};

export const generateShiftHandover = async (sessions: Session[]): Promise<string> => {
  try {
    const sessionSummaries = sessions.map(s => {
      const validMessages = s.messages.filter(m => m.text && m.text.trim().length > 0);
      const context = validMessages
        .map(m => `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.role.toUpperCase()}: ${m.text}`)
        .join('\n');
      
      return `### SESSION ID: ${s.id}
TITLE: ${s.title}
TIME_UPDATED: ${new Date(s.timestamp).toLocaleTimeString()}
TRANSCRIPT:
${context}
--------------------------------------------------`;
    }).join('\n\n');

    const now = new Date();
    const prompt = `
      Act as a Lead Utility NOC Engineer.
      Generate a **Highly Concise Shift Handover Report** (TL;DR style) based on the session logs.
      
      **Current Time:** ${now.toLocaleDateString()} ${now.toLocaleTimeString()}

      **Strict Formatting Rules:**
      1. **Critical Actions (Must Read):** Max 3 bullet points of PENDING/URGENT items only. If none, say "None".
      2. **Incident Manifest:** Single-line bullets only. 
         - Format: \`[TIME] [TYPE] Short Description -> Outcome\`
      3. **No fluff.** No long paragraphs.

      **Session Logs:**
      ${sessionSummaries.substring(0, 100000)}
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt
    });

    return response.text || "Failed to generate handover report.";

  } catch (error) {
    console.error("Handover generation failed:", error);
    return "Error generating handover report.";
  }
};