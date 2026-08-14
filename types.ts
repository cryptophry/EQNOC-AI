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
  text: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: Date;
  isStreaming?: boolean;
  groundingMetadata?: unknown;
  images?: string[];
  sources?: SourceExcerpt[];
}

export interface Session {
  id: string;
  title: string;
  timestamp: number;
  messages: Message[];
}

export interface CommandRef {
  title: string;
  cisco: string;
  juniper: string;
  desc: string;
  category?: string[];
}
