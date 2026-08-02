import React, { useState } from 'react';
import { ChevronDown, ChevronRight, BookText, FileText, ImageIcon, ShieldCheck } from 'lucide-react';
import { SourceExcerpt } from '../types';

// Collapsible verification panel under an assistant answer: shows the VERBATIM
// excerpts retrieved from manuals / guides / reference images so the technician
// can check the answer against the original wording.

const KindIcon: React.FC<{ kind: SourceExcerpt['kind'] }> = ({ kind }) => {
  if (kind === 'guide') return <FileText size={13} className="text-muted shrink-0" />;
  if (kind === 'image') return <ImageIcon size={13} className="text-muted shrink-0" />;
  return <BookText size={13} className="text-muted shrink-0" />;
};

const SourceItem: React.FC<{ s: SourceExcerpt }> = ({ s }) => {
  const [open, setOpen] = useState(false);
  const long = s.text.length > 280;
  return (
    <div className="bg-card border border-line rounded-lg p-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <KindIcon kind={s.kind} />
        <span className="text-[12.5px] font-semibold truncate">{s.title}</span>
        <span className="text-[11px] font-mono text-accent bg-code-bg border border-line rounded px-1.5 py-0.5 shrink-0">{s.label}</span>
      </div>
      <div className={`mt-1.5 text-[12px] leading-5 text-muted whitespace-pre-wrap ${!open && long ? 'line-clamp-4' : ''}`}>
        {s.text}
      </div>
      {long && (
        <button onClick={() => setOpen(!open)} className="mt-1 text-[11.5px] text-accent hover:underline">
          {open ? 'Show less' : 'Show full excerpt'}
        </button>
      )}
    </div>
  );
};

const SourcesPanel: React.FC<{ sources: SourceExcerpt[] }> = ({ sources }) => {
  const [expanded, setExpanded] = useState(false);
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3 pt-2.5 border-t border-line">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-accent transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <ShieldCheck size={13} className="text-accent" />
        Verify sources
        <span className="text-faint font-normal">· {sources.length} excerpt{sources.length > 1 ? 's' : ''} retrieved</span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          <p className="text-[11.5px] text-faint">Exact wording retrieved from your manuals, guides and reference images for this question — compare the answer against it.</p>
          {sources.map((s, i) => <SourceItem key={i} s={s} />)}
        </div>
      )}
    </div>
  );
};

export default SourcesPanel;
