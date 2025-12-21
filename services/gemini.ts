import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { EQNOC_KNOWLEDGE_BASE } from "../constants";
import { FlowNode, CommandRef, Session, MessageRole } from "../types";

// Ensure API key exists
const apiKey = process.env.API_KEY || '';

export const ai = new GoogleGenAI({ apiKey });

// Helper for retry logic on rate limits
const retryWithBackoff = async <T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error?.status === 429 || error?.code === 429 || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED'))) {
      console.warn(`Rate limit hit (429). Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const createChatSession = (customContext?: string, history?: any[]) => {
  const combinedSystemInstruction = customContext
    ? `${EQNOC_KNOWLEDGE_BASE}\n\n=== CUSTOMER SPECIFIC KNOWLEDGE BASE (HIGH PRIORITY) ===\n${customContext}\n\nINSTRUCTIONS:\n- You MUST prioritize the Custom Knowledge Base above for any procedural steps or policies.\n- If the Custom Knowledge Base contradicts general knowledge, follow the Custom Knowledge Base.`
    : EQNOC_KNOWLEDGE_BASE;

  return ai.chats.create({
    // gemini-2.5-flash is required for Google Maps Grounding
    model: 'gemini-2.5-flash', 
    config: {
      systemInstruction: combinedSystemInstruction,
      temperature: 0.7,
      tools: [
        // Combine tools into a single Tool object
        { 
          googleSearch: {}, 
          googleMaps: {} 
        }
      ]
    },
    history: history
  });
};

// --- RAG / EMBEDDING SERVICES ---

export const embedText = async (text: string): Promise<number[] | undefined> => {
  try {
    const cleanText = text.replace(/\n/g, ' ').substring(0, 9000); // Limit context window
    if (!cleanText) return undefined;

    const result = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: cleanText,
    });

    return result.embedding?.values;
  } catch (error) {
    console.error("Embedding generation failed:", error);
    return undefined;
  }
};

const cosineSimilarity = (vecA: number[], vecB: number[]) => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const findRelevantHistory = async (query: string, sessions: Session[]): Promise<string> => {
  // 1. Generate embedding for current query
  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) return '';

  // 2. Search sessions with embeddings
  const candidates = sessions
    .filter(s => s.embedding && s.messages.length > 2) // Only check sessions with data
    .map(s => ({
      session: s,
      score: cosineSimilarity(queryEmbedding, s.embedding!)
    }))
    .filter(c => c.score > 0.65) // Similarity threshold (tuned for text-embedding-004)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2); // Top 2 relevant sessions

  if (candidates.length === 0) return '';

  // 3. Format context
  const contextString = candidates.map(c => {
     const summary = c.session.messages
        .filter(m => m.role !== 'system')
        .slice(-4) // Take last few exchanges
        .map(m => `${m.role.toUpperCase()}: ${m.text.substring(0, 200)}`)
        .join('\n');
     return `[Previous Ticket "${c.session.title}" (Relevance: ${(c.score * 100).toFixed(0)}%)]:\n${summary}`;
  }).join('\n\n');

  return `\n\n=== RELEVANT PAST INCIDENTS (MEMORY) ===\n${contextString}\n\n`;
};

// --- EXISTING SERVICES ---

export const generateTroubleshootingFlow = async (faultDescription: string): Promise<FlowNode | null> => {
  try {
    const prompt = `
      Act as a Senior Utility Telecommunications Engineer. Create a troubleshooting flowchart for this fault: "${faultDescription}".
      
      Consider:
      - Is this a Field Worker (Safety First)?
      - Is this SCADA/OT (Grid Visibility)?
      - Is this Corporate Network?

      Return a SINGLE valid JSON object representing a decision tree.
      
      Schema:
      {
        "id": "root",
        "title": "Initial Check",
        "type": "command", // or 'action', 'decision', 'solution'
        "description": "Brief explanation",
        "command": "show interface ...", // Optional, valid Cisco/Juniper syntax OR Instruction (e.g. "Check Radio Profile")
        "branches": [
          {
            "label": "If Result X",
            "node": { ... nested node ... }
          }
        ]
      }
      
      Limit depth to 3-4 levels.
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      // gemini-3-pro-preview is best for complex JSON generation
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) return null;

    return JSON.parse(text) as FlowNode;
  } catch (error) {
    console.error("Failed to generate flowchart:", error);
    return null;
  }
};

export const generateNetworkConfig = async (intent: string, vendor: string): Promise<string> => {
  try {
    const prompt = `
      Act as a Senior Network Implementation Engineer for a Power Utility.
      Generate network configuration for **${vendor}**.
      
      Task: "${intent}"
      
      Requirements:
      1. Provide the exact CLI commands.
      2. Include comments (!) explaining complex lines.
      3. If applicable, consider Utility-specific constraints (e.g. SCADA QoS, Multicast for Radio).
      4. Format appropriately for the vendor.
      5. Return ONLY the configuration text.
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // High logic capability for correct syntax
      contents: prompt
    });

    return response.text || "Configuration generation failed.";
  } catch (error) {
    console.error("Config gen failed:", error);
    return "Failed to generate configuration.";
  }
};

export const analyzeRawLogs = async (logs: string): Promise<string> => {
  try {
    const prompt = `
      Analyze the following raw logs (Network/SCADA/Radio). 
      Identify the Root Cause, the Timeline of failure, and Recommend a fix.
      Format the output in concise Markdown.
      
      Logs:
      ${logs.substring(0, 15000)}
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // Strong reasoning for log analysis
      contents: prompt
    });

    return response.text || "Analysis failed.";
  } catch (error) {
    console.error("Log analysis failed:", error);
    return "Failed to analyze logs.";
  }
};

export const generateRFO = async (conversationContext: string): Promise<string> => {
  try {
    const prompt = `
      Based on the following Utility Telecoms troubleshooting session, draft a formal Reason For Outage (RFO) report.
      
      Structure:
      1. **Incident Summary**: One sentence overview.
      2. **Affected Service**: (e.g. SCADA, Field Radio, Corporate WAN).
      3. **Root Cause**: Technical explanation.
      4. **Timeline**: Estimated sequence of events.
      5. **Resolution**: What fixed it.
      
      Session Context:
      ${conversationContext.substring(0, 25000)}
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // High quality text generation
      contents: prompt
    });

    return response.text || "Failed to generate RFO.";
  } catch (error) {
    console.error("RFO generation failed:", error);
    return "Failed to generate report.";
  }
};

export const generateCommunication = async (type: string, context: string): Promise<string> => {
  try {
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[now.getDay()];
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const dateStr = `${dayName} ${dd}/${mm}/${yy}`;

    const prompt = `
      Act as a Professional Utility NOC Communication Specialist.
      Draft a **${type}** based on the context.

      Context:
      ${context.substring(0, 15000)}

      Requirements:
      1. Tone: Professional, Clear.
         - 'Customer Update': Empathetic.
         - 'Control Room Alert': Urgent, Concise, Safety-focused.
         - 'Shift Handover': Brief, bulleted.
      2. Format: Standard Email or Ticket Update.
      3. SUBJECT LINE MANDATE: For Shift Handover, use: "Subject: Shift Handover - ${dateStr}"
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt
    });

    return response.text || "Failed to generate communication.";
  } catch (error) {
    console.error("Comm generation failed:", error);
    return "Failed to generate text.";
  }
};

export const generateShiftHandover = async (sessions: Session[]): Promise<string> => {
  try {
    // 1. Prepare session summaries with FULL transcripts
    const sessionSummaries = sessions.map(s => {
      // Filter out empty messages to reduce noise
      const validMessages = s.messages.filter(m => m.text && m.text.trim().length > 0);
      
      // Construct full transcript
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
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();

    const prompt = `
      Act as a Lead Utility NOC Engineer.
      Generate a **Shift Handover Report** based on the following session logs from the last shift.

      **Current Time:** ${dateStr} ${timeStr}

      **Report Structure:**
      1. **Shift Summary**: High-level overview.
      2. **Incidents Handled**: Grouped by Type (SCADA / Radio / Network / Mobility).
         - Format: [Status] Service - Brief Description
      3. **Pending Actions**: Immediate attention items.

      **Session Logs:**
      ${sessionSummaries.substring(0, 100000)}
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // High reasoning to summarize multiple contexts and separate incidents
      contents: prompt
    });

    return response.text || "Failed to generate handover report.";

  } catch (error) {
    console.error("Handover generation failed:", error);
    return "Error generating handover report.";
  }
};

export const generateIncidentSummary = async (session: Session, focusTopic?: string): Promise<string> => {
  try {
    const validMessages = session.messages.filter(m => m.text && m.text.trim().length > 0);
    const context = validMessages
      .map(m => `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.role.toUpperCase()}: ${m.text}`)
      .join('\n');

    let instruction = "Review the following troubleshooting session transcript and provide a concise, up-to-date Incident Summary.";
    
    if (focusTopic) {
        instruction = `
        Review the following session transcript.
        **CRITICAL TASK:** Isolate and summarize ONLY the events related to: "**${focusTopic}**".
        Ignore unrelated chatter.
        `;
    }

    const prompt = `
      Act as a Senior Utility Telecoms Engineer.
      ${instruction}
      
      **Transcript:**
      ${context}
      
      **Output Format (Markdown):**
      **INCIDENT FOCUS: ${focusTopic || 'General Summary'}**
      
      *   **Service Type:** [SCADA / Radio / Mobility / WAN]
      *   **Current Status:** [Resolved/Monitoring/Pending]
      *   **Summary:** (2-3 sentences)
      *   **Key Actions:** (Bulleted list)
      *   **Findings:**
      *   **Next Steps:**
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt
    });

    return response.text || "Failed to generate incident summary.";
  } catch (error) {
    console.error("Incident summary failed:", error);
    return "Error generating incident summary.";
  }
};

export interface DetectedIncident {
  title: string;
  timestamp: string;
  description: string;
  status: 'OPEN' | 'RESOLVED' | 'MONITORING';
}

export const detectSessionIncidents = async (session: Session): Promise<DetectedIncident[]> => {
  try {
     const userMsgs = session.messages.filter(m => m.role === 'user');
     if (userMsgs.length === 0) return [];

     if (userMsgs.length <= 1) {
         const txt = userMsgs[0]?.text || 'Empty';
         return [{
             title: txt.substring(0, 75),
             timestamp: userMsgs[0]?.timestamp.toISOString() || new Date().toISOString(),
             description: txt,
             status: 'OPEN'
         }];
     }

     const context = session.messages.map(m => `[${new Date(m.timestamp).toISOString()}] ${m.role}: ${m.text}`).join('\n');

     const prompt = `
     Analyze this support session log. Identify distinct technical incidents.
     
     **Context:** Utility NOC (SCADA, Radio, Networking, Field Support).
     
     Rules:
     1. Group related sequential messages into a SINGLE incident.
     2. Create a specific title (e.g. "Feeder 1234 Protection Fail" or "Radio Site 5 Down").
     3. Status: 'OPEN', 'RESOLVED', 'MONITORING'.
     
     Log:
     ${context.substring(0, 15000)}

     Return a JSON array:
     [ { "title": "string", "timestamp": "ISO string", "description": "short summary", "status": "OPEN" | "RESOLVED" | "MONITORING" } ]
     `;

     // Use retryWithBackoff here to handle rate limiting during batch processing
     const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview', 
        contents: prompt,
        config: { responseMimeType: 'application/json' }
     }));

     const text = response.text;
     if (!text) return [];
     
     const incidents = JSON.parse(text) as DetectedIncident[];
     if (!Array.isArray(incidents)) return [];
     return incidents;

  } catch (e) {
      console.error("Failed to detect incidents", e);
      return [{
         title: session.title,
         timestamp: new Date(session.timestamp).toISOString(),
         description: session.title,
         status: 'OPEN'
      }];
  }
};

export interface OutageRecord {
  location: string;
  suburb: string;
  description: string;
  status: string;
  type: string;
  estFix: string;
  customersAffected: string;
}

export const parseOutageData = async (rawHtml: string): Promise<OutageRecord[]> => {
  try {
    // 1. Client-side HTML cleanup using DOMParser
    // HTML pages are mostly noise (scripts, styles, nav). Truncating raw HTML kills data at the end of the list.
    // Parsing it to text first is far more efficient and ensures we get the full list.
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    // Remove irrelevant elements to reduce token usage and noise
    const trash = doc.querySelectorAll('script, style, iframe, svg, nav, header, footer, .header, .footer, #header, #footer');
    trash.forEach(el => el.remove());

    // Extract pure text content. We preserve newlines to help Gemini distinguish records.
    const cleanText = doc.body.innerText;

    const prompt = `
      You are an Outage Data Parser.
      The following is the clean TEXT CONTENT extracted from the Ergon Energy Outage Finder.
      
      Your task:
      1. Identify individual outage records from the text.
      2. Map them to a JSON object with these keys:
         - location (Street/Area)
         - suburb
         - description (Reason/Fault type)
         - status (e.g., Under Investigation, Work in Progress)
         - type (Planned or Unplanned)
         - estFix (Estimated fix time)
         - customersAffected (Number of customers)
      
      3. Return a JSON Array of these objects.
      4. If no outages are found, return an empty array [].
      
      TEXT CONTENT:
      ${cleanText.substring(0, 200000)} 
    `;
    // Increased substring limit significantly as text is much denser than HTML

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) return null;

    return JSON.parse(text) as OutageRecord[];
  } catch (error) {
    console.error("Outage parsing failed:", error);
    return [];
  }
};

export interface ChangeAuditResult {
  score: number;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  impactAnalysis: string[];
  preChecks: string[];
  postChecks: string[];
  rollbackPlan: string;
}

export const assessChangeRisk = async (script: string): Promise<ChangeAuditResult | null> => {
  try {
    const prompt = `
      Act as a Senior Network Reliability Engineer.
      Audit the following network configuration change script for risk.
      
      Script:
      ${script.substring(0, 15000)}
      
      Output a JSON object with:
      - score: number (0-100, where 100 is catastrophic risk)
      - riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
      - impactAnalysis: array of strings (potential side effects, outage risks)
      - preChecks: array of strings (specific CLI commands to run BEFORE change to benchmark state)
      - postChecks: array of strings (specific CLI commands to run AFTER to verify success)
      - rollbackPlan: string (exact CLI commands to revert changes if they fail)
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // Reasoning needed for risk assessment
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;
    if (!text) return null;

    return JSON.parse(text) as ChangeAuditResult;
  } catch (error) {
    console.error("Change audit failed:", error);
    return null;
  }
};

export const generateTopologyMermaid = async (input: string): Promise<string> => {
  try {
    const prompt = `
      Act as a Network Topology Mapper.
      Convert the following text (which may be CLI output like 'show lldp neighbors', or a natural language description) into a Mermaid.js graph definition.
      
      Input:
      ${input.substring(0, 20000)}
      
      Rules:
      1. Return ONLY the Mermaid code. No markdown fences.
      2. Start with 'graph TD' or 'graph LR'.
      3. If interfaces are present, use them as edge labels: A -- Ge0/0/1 --> B
      4. Style the nodes to look like network devices if possible (classDef).
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt
    });

    let text = response.text || '';
    // Remove markdown code blocks if present
    text = text.replace(/```mermaid/g, '').replace(/```/g, '').trim();

    // Basic validation
    if (!text.startsWith('graph') && !text.startsWith('flowchart')) {
       return 'graph TD;\nError[Could not generate topology]';
    }

    return text;
  } catch (error) {
    console.error("Topology gen failed:", error);
    return 'graph TD;\nError[Generation failed]';
  }
};

export const generateCommandDetails = async (input: string): Promise<CommandRef | null> => {
  try {
    const prompt = `
      Act as a Network Engineer.
      Create a standardized command library entry based on this input: "${input}".

      Return a SINGLE JSON object with this schema:
      {
        "title": "Short Title (Max 25 chars)",
        "cisco": "Cisco IOS/XR command",
        "juniper": "Juniper Junos command",
        "desc": "Brief description (Max 100 chars)",
        "category": ["array", "of", "ids"] // ids from: ['phys', 'l2', 'l3', 'mpls', 'bgp', 'logs', 'e2e']
      }

      If the input is specific to one vendor, infer the other.
      Ensure strict JSON format.
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    return JSON.parse(response.text || '{}') as CommandRef;
  } catch (error) {
    console.error("Command gen failed:", error);
    return null;
  }
};

export interface RegexResult {
  cisco: string;
  juniper: string;
  grep: string;
  explanation: string;
}

export const generateRegex = async (description: string): Promise<RegexResult | null> => {
  try {
    const prompt = `
      Act as a Network Engineering CLI Assistant.
      Convert the following natural language filtering requirement into specific CLI pipe commands (regex).
      
      Requirement: "${description}"
      
      Return a SINGLE JSON object with these keys:
      - cisco: The pipe command for Cisco IOS/XR (e.g., | include x | exclude y). Use 'include' (not grep) for IOS standard.
      - juniper: The pipe command for Juniper Junos (e.g., | match x | except y)
      - grep: Standard Linux grep command (e.g., | grep -E "x")
      - explanation: Brief explanation of the logic (max 10 words).
      
      Rules:
      1. If the input describes a "show" command, include it. If it just describes filtering, start with the pipe (|).
      2. Handle case insensitivity if implied (use -i for grep, or just standard match for others).
      3. Focus on standard router CLI syntax.
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as RegexResult;
  } catch (error) {
    console.error("Regex gen failed:", error);
    return null;
  }
};

export interface MacLookupResult {
  vendor: string;
  country: string;
  isPrivate: boolean;
}

export const lookupMacVendor = async (mac: string): Promise<MacLookupResult | null> => {
  try {
    const prompt = `
      Identify the vendor/manufacturer for the following MAC Address OUI: "${mac}".
      
      Return a SINGLE JSON object:
      {
        "vendor": "Company Name (e.g., Cisco Systems, Apple Inc.)",
        "country": "Country Code (e.g., US, CN, TW)",
        "isPrivate": boolean // true if locally administered range or private randomization
      }
      
      If unknown, return vendor as "Unknown OUI".
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    return JSON.parse(response.text || '{}') as MacLookupResult;
  } catch (error) {
    console.error("MAC lookup failed:", error);
    return null;
  }
};