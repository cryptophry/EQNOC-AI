import React, { useState } from 'react';
import { Copy, Check, Terminal, ExternalLink, MapPin, Globe } from 'lucide-react';

interface MessageContentProps {
  text: string;
  isStreaming?: boolean;
  groundingMetadata?: any;
  images?: string[];
}

const CodeBlock: React.FC<{ content: string; language?: string }> = ({ content, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cleanContent = content.replace(/^\n/, '');

  return (
    <div className="my-4 rounded-lg overflow-hidden border border-line bg-code-bg group shadow-lg">
      <div className="flex items-center justify-between px-4 py-2 bg-card-2 border-b border-line">
        <span className="text-xs font-mono font-bold uppercase text-muted tracking-wide">
          {language || 'TERMINAL OUTPUT'}
        </span>
        <button
          onClick={handleCopy}
          className="text-faint hover:text-accent transition-colors p-1"
          title="Copy"
        >
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="font-mono text-[12px] sm:text-[13px] text-code-ink whitespace-pre leading-relaxed">
          <code>{cleanContent}</code>
        </pre>
      </div>
    </div>
  );
};

// Robust scanner-based parser for inline markdown with nesting support
const parseInline = (text: string): React.ReactNode[] => {
  if (!text) return [];
  
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    // Find next potential markers
    const nextCode = text.indexOf('`', cursor);
    const nextBold = text.indexOf('**', cursor);
    const nextLink = text.indexOf('[', cursor);

    // If no more markers exist
    if (nextCode === -1 && nextBold === -1 && nextLink === -1) {
      nodes.push(text.slice(cursor));
      break;
    }

    // Determine nearest marker
    const indices = [nextCode, nextBold, nextLink].filter(i => i !== -1);
    const firstIndex = Math.min(...indices);

    // Push text before marker
    if (firstIndex > cursor) {
      nodes.push(text.slice(cursor, firstIndex));
    }

    // Handle Code (`...`)
    if (firstIndex === nextCode) {
      const closing = text.indexOf('`', firstIndex + 1);
      if (closing !== -1) {
        const content = text.slice(firstIndex + 1, closing);
        nodes.push(
          <code key={`c-${firstIndex}`} className="text-[13px] font-mono bg-code-bg text-accent px-1.5 py-0.5 rounded border border-line mx-0.5">
            {content}
          </code>
        );
        cursor = closing + 1;
        continue;
      } else {
        // Invalid code block, treat as text
        nodes.push('`');
        cursor = firstIndex + 1;
        continue;
      }
    }

    // Handle Bold (**...**)
    if (firstIndex === nextBold) {
      const closing = text.indexOf('**', firstIndex + 2);
      if (closing !== -1) {
        const content = text.slice(firstIndex + 2, closing);
        nodes.push(
          <strong key={`b-${firstIndex}`} className="text-ink font-bold tracking-wide">
            {parseInline(content)}
          </strong>
        );
        cursor = closing + 2;
        continue;
      } else {
         nodes.push('**');
         cursor = firstIndex + 2;
         continue;
      }
    }

    // Handle Link ([...](...))
    if (firstIndex === nextLink) {
      const remainder = text.slice(firstIndex);
      // Basic link matching - regex handles matching bracket pairs slightly better than indexOf
      const linkMatch = remainder.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
         nodes.push(
          <a key={`l-${firstIndex}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1 font-medium">
            {linkMatch[1]}<ExternalLink size={12} />
          </a>
         );
         cursor = firstIndex + linkMatch[0].length;
         continue;
      } else {
         nodes.push('[');
         cursor = firstIndex + 1;
         continue;
      }
    }
  }

  return nodes;
};

interface ListItem { text: string; isOrdered: boolean; number?: string; level: number; customLabel?: string; }
interface Block { type: 'p' | 'h' | 'li' | 'table'; content?: string; level?: number; items?: ListItem[]; rows?: {cells:string[]}[]; headers?: string[]; }

const FormattedText: React.FC<{ text: string }> = ({ text }) => {
  // Pre-process: Detect patterns like "Q1:" stuck inline and force them to new lines
  // Enhanced to handle bolding like "**Q1:**" or "**Q1**:" or even just "Q1" if it looks like a label start
  const cleanText = text.replace(/([^\n])\s+(\**Q\d+(?:[:.]|(?:\*\*|__)?[:.]))/g, '$1\n$2');

  const blocks: Block[] = [];
  const lines = cleanText.split('\n');
  
  let currentList: ListItem[] | null = null;
  let currentTable: {cells:string[]}[] | null = null;
  let currentP: string[] = [];
  
  const flush = () => {
    if (currentList) { blocks.push({ type: 'li', items: currentList }); currentList = null; }
    if (currentTable) {
       let headers: string[] = [];
       let rows = currentTable;
       const hasSep = rows.length > 1 && rows[1].cells.some(c => c.match(/^[:\-\s]+$/));
       if (hasSep) { headers = rows[0].cells; rows = rows.filter((_, i) => i !== 1).slice(1); } 
       else if (rows.length > 0) { headers = rows[0].cells; rows = rows.slice(1); }
       blocks.push({ type: 'table', headers, rows });
       currentTable = null;
    }
    if (currentP.length > 0) { blocks.push({ type: 'p', content: currentP.join('\n') }); currentP = []; }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const indent = (line.match(/^(\s*)/)?.[1].length || 0) / 2;

    if (!trimmed) { flush(); continue; }

    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      flush();
      blocks.push({ type: 'h', level: headerMatch[1].length, content: headerMatch[2] });
      continue;
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.*)/);
    const olMatch = trimmed.match(/^(\d+\.)\s+(.*)/);
    // Match "Q1: text", "**Q1:** text", "**Q1**: text"
    // Capture group 1: The label (e.g. "**Q1:**")
    // Capture group 2: The content
    const qMatch = trimmed.match(/^(\*{0,2}Q\d+.*?)[:.]\s+(.*)/);

    if (ulMatch || olMatch || qMatch) {
        if (currentTable) flush();
        if (currentP.length > 0) flush();
        if (!currentList) currentList = [];
        
        if (qMatch) {
            currentList.push({ 
              text: qMatch[2], 
              isOrdered: false, 
              level: Math.floor(indent),
              customLabel: qMatch[1].replace(/[*_:]/g, '') // Clean markdown chars from label
            });
        } else {
            currentList.push({ 
                text: ulMatch ? ulMatch[1] : olMatch![2], 
                isOrdered: !!olMatch, 
                number: olMatch?.[1], 
                level: Math.floor(indent) 
            });
        }
        continue;
    }

    if (trimmed.startsWith('|') || (trimmed.includes('|') && trimmed.split('|').length > 2)) {
        if (currentList) flush();
        if (currentP.length > 0) flush();
        const cells = trimmed.split('|').map(c=>c.trim()).filter((c,i,a) => !(i===0 && c==='') && !(i===a.length-1 && c===''));
        if (cells.length > 0) {
            if (!currentTable) currentTable = [];
            currentTable.push({ cells });
            continue;
        }
    }

    if (currentList) flush();
    if (currentTable) flush();
    currentP.push(line);
  }
  flush();

  return (
    <div className="space-y-4 text-ink">
      {blocks.map((b, idx) => {
        if (b.type === 'h') {
          const size = b.level === 1 ? 'text-lg sm:text-xl font-bold text-accent border-b border-line pb-2 mt-5 mb-3 sm:mt-6 sm:mb-4' :
                       b.level === 2 ? 'text-base sm:text-lg font-bold text-accent mt-4 mb-2 sm:mt-5 sm:mb-3' :
                       'text-[15px] sm:text-base font-bold text-ink mt-3 mb-2 sm:mt-4';
          return <div key={idx} className={`${size} tracking-wide uppercase`}>{parseInline(b.content || "")}</div>;
        }
        if (b.type === 'li') {
          return (
            <ul key={idx} className="space-y-2 my-3">
              {b.items?.map((item, i) => (
                <li key={i} className={`flex gap-3 text-[13.5px] leading-6 sm:text-[14.5px] sm:leading-6 ${item.customLabel ? 'bg-card-2 p-3 rounded-lg border border-line hover:border-line transition-colors' : ''}`} style={{ paddingLeft: item.customLabel ? '0.75rem' : `${item.level * 1.5}em` }}>
                  {item.customLabel ? (
                     <span className="shrink-0 font-mono font-bold text-xs bg-card-2 text-accent border border-line rounded px-2 py-1 h-fit ">
                       {item.customLabel}
                     </span>
                  ) : (
                     <span className={`text-accent shrink-0 font-bold ${item.isOrdered?'':'mt-2.5 text-[6px]'}`}>{item.isOrdered?item.number:'●'}</span>
                  )}
                  <span className="text-ink">{parseInline(item.text)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === 'table') {
           return (
             <div key={idx} className="my-4 overflow-x-auto rounded-lg border border-line bg-card-2 shadow-md">
                <table className="w-full text-left text-[12.5px] sm:text-[13px]">
                   {b.headers?.length && <thead className="bg-card-2 text-muted font-bold uppercase tracking-wider"><tr>{b.headers.map((h,i)=><th key={i} className="px-4 py-3 border-b border-line">{parseInline(h)}</th>)}</tr></thead>}
                   <tbody>{b.rows?.map((r,i)=><tr key={i} className="border-b border-line last:border-0 hover:bg-white/5 transition-colors">{r.cells.map((c,j)=><td key={j} className="px-4 py-3 border-r border-line last:border-0 whitespace-pre-wrap">{parseInline(c)}</td>)}</tr>)}</tbody>
                </table>
             </div>
           );
        }
        return <p key={idx} className="text-[13.5px] leading-6 sm:text-[14.5px] sm:leading-6 text-ink">{parseInline(b.content || "")}</p>;
      })}
    </div>
  );
};

const GroundingSources: React.FC<{ metadata: any }> = ({ metadata }) => {
  if (!metadata || !metadata.groundingChunks || metadata.groundingChunks.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-line flex flex-col gap-2">
      <span className="text-[10px] font-bold text-faint uppercase tracking-widest flex items-center gap-1">
         <Globe size={10} /> SOURCES & GROUNDING
      </span>
      <div className="flex flex-wrap gap-2">
        {metadata.groundingChunks.map((chunk: any, index: number) => {
          if (chunk.web?.uri) {
            return (
              <a 
                key={index} 
                href={chunk.web.uri} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-card-2 border border-line rounded-full text-xs text-accent hover:bg-card-2 hover:border-line transition-all max-w-xs truncate"
              >
                <Globe size={12} />
                <span className="truncate">{chunk.web.title || new URL(chunk.web.uri).hostname}</span>
              </a>
            );
          }
          if (chunk.maps?.uri) {
            return (
              <a 
                key={index} 
                href={chunk.maps.uri} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-card-2 border border-line rounded-full text-xs text-amber-400 hover:bg-card-2 hover:border-amber-500/30 transition-all max-w-xs truncate"
              >
                <MapPin size={12} />
                <span className="truncate">{chunk.maps.title || "Google Maps Location"}</span>
              </a>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};

const MessageContent = React.memo<MessageContentProps>(({ text = "", isStreaming, groundingMetadata, images }) => {
  const parts = text.split('```');
  return (
    <div className="font-sans">
      {/* Attached Images */}
      {images && images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img 
                src={img} 
                alt="Attachment" 
                className="max-w-[200px] max-h-[200px] rounded-lg border border-line bg-card-2 object-cover shadow-card hover:border-accent transition-colors" 
              />
            </div>
          ))}
        </div>
      )}

      {/* Text Content */}
      {parts.map((part, index) => {
        if (index % 2 === 0) return <FormattedText key={index} text={part} />;
        const match = part.match(/^([^\n]+)(?:\n|$)/);
        const lang = match ? match[1].trim() : undefined;
        const content = match ? part.slice(match[0].length) : part;
        return <CodeBlock key={index} content={content} language={lang} />;
      })}
      {isStreaming && <span className="inline-block w-2 h-5 bg-accent animate-pulse ml-1 align-middle rounded-sm"></span>}
      
      {/* Display Sources if available */}
      <GroundingSources metadata={groundingMetadata} />
    </div>
  );
});

export default MessageContent;