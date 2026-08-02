
export enum MessageRole {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system',
  FUNCTION = 'function'
}

// A verbatim excerpt the server retrieved to ground an answer — shown to the
// tech so they can verify the answer against the original source wording.
export interface SourceExcerpt {
  title: string;
  label: string; // "p.4" | "§2" | "reference image"
  kind: 'manual' | 'guide' | 'image';
  text: string;  // the exact stored text the answer drew on
}

export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: Date;
  isStreaming?: boolean;
  groundingMetadata?: any;
  images?: string[]; // Base64 strings for displayed images
  sources?: SourceExcerpt[]; // retrieved manual/guide/image excerpts for this answer
}

export interface Session {
  id: string;
  title: string;
  timestamp: number; // Unix timestamp
  messages: Message[];
}

export interface TriageStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed';
}

export type TriageStatus = 'pending' | 'active' | 'completed';

export interface CommandRef {
  title: string;
  cisco: string;
  juniper: string;
  desc: string;
  category?: string[];
}

export type TriageMode = 'TEXT' | 'LIVE';

export interface DiagnosticModule {
  id: string;
  title: string;
  subtitle: string;
  icon: string; // lucide icon name
  details: string;
}

// Flowchart Types
export interface FlowNode {
  id: string;
  title: string;
  description?: string;
  type: 'action' | 'command' | 'decision' | 'solution';
  command?: string; // The command to run
  branches?: FlowBranch[];
}

export interface FlowBranch {
  label: string; // e.g., "If Output is Up", "If Error Found"
  node: FlowNode;
}

export interface WarRoomEvent {
  id: string;
  timestamp: number;
  type: 'USER' | 'SYSTEM' | 'AI' | 'MANUAL';
  message: string;
}

export interface ActivityItem {
    uniqueId: string;
    sessionId: string;
    sessionTitle: string;
    text: string;
    timestamp: Date;
    status: 'OPEN' | 'RESOLVED' | 'MONITORING';
    isAiGrouped?: boolean;
    isLoading?: boolean;
}
