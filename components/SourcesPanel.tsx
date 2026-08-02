import React, { useMemo, useState } from 'react';
import { ChevronDown, BookText, FileText, ImageIcon, ShieldCheck } from 'lucide-react';
import { SourceExcerpt } from '../types';

// "Verify sources" — the verification strip under an assistant answer.
//
// Collapsed: a slim trust strip showing, at a glance, WHICH documents the
// answer drew on. Expanded: a per-document chip switcher and the verbatim
// excerpts as clean quote blocks, so the tech can compare the answer against
// the original wording. Motion is spring-like and respects reduced-motion.

interface DocGroup {
  title: string;
  kind: SourceExcerpt['kind'];
  items: SourceExcerpt[];
}

const KindIcon: React.FC<{ kind: SourceExcerpt['kind']; size?: number; className?: string }> = ({ kind, size = 13, className }) => {
  const cls = className || 'shrink-0';
  if (kind === 'guide') return <FileText size={size} className={cls} />;
  if (kind === 'image') return <ImageIcon size={size} className={cls} />;
  return <BookText size={size} className={cls} />;
};

const Excerpt: React.FC<{ s: SourceExcerpt; index: number }> = ({ s, index }) => {
  const [open, setOpen] = useState(false);
  const long = s.text.length > 300;
  return (
    <figure
      className="m-0 pl-3.5 border-l-2 animate-source-in"
      style={{ borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)', animationDelay: `${index * 45}ms` }}
    >
      <figcaption className="flex items-center gap-2 mb-1">
        <span className="text-[10.5px] font-mono font-semibold tracking-wide text-accent bg-code-bg border border-line rounded-md px-1.5 py-[1px]">
          {s.label}
        </span>
      </figcaption>
      <blockquote className={`m-0 text-[12.5px] leading-[1.65] text-muted whitespace-pre-wrap ${!open && long ? 'line-clamp-4' : ''}`}>
        {s.text}
      </blockquote>
      {long && (
        <button
          onClick={() => setOpen(!open)}
          className="mt-1 text-[11.5px] font-medium text-accent/90 hover:text-accent transition-colors"
        >
          {open ? 'Less' : 'More'}
        </button>
      )}
    </figure>
  );
};

const SourcesPanel: React.FC<{ sources: SourceExcerpt[] }> = ({ sources }) => {
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);

  // Group excerpts by document, preserving retrieval (relevance) order.
  const groups = useMemo<DocGroup[]>(() => {
    const out: DocGroup[] = [];
    const idx = new Map<string, number>();
    for (const s of sources || []) {
      const key = `${s.kind}|${s.title}`;
      if (idx.has(key)) out[idx.get(key)!].items.push(s);
      else { idx.set(key, out.length); out.push({ title: s.title, kind: s.kind, items: [s] }); }
    }
    return out;
  }, [sources]);

  if (groups.length === 0) return null;
  const activeGroup = groups[Math.min(active, groups.length - 1)];
  const total = sources.length;

  return (
    <div className="mt-3.5">
      {/* Trust strip (always visible) */}
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="group w-full flex items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-2 text-left transition-all duration-200 hover:border-line-strong hover:shadow-card active:scale-[0.995]"
      >
        <span
          className="w-6 h-6 rounded-full grid place-items-center shrink-0"
          style={{ background: 'color-mix(in srgb, var(--ok) 15%, transparent)' }}
        >
          <ShieldCheck size={13} className="text-ok" />
        </span>
        <span className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
          <span className="text-[12.5px] font-semibold shrink-0">Sourced</span>
          <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            {groups.slice(0, 2).map((g, i) => (
              <span key={i} className={`items-center gap-1 min-w-0 bg-card-2 border border-line rounded-full pl-1.5 pr-2 py-[2px] text-[11px] text-muted ${i === 0 ? 'inline-flex' : 'hidden sm:inline-flex'}`}>
                <KindIcon kind={g.kind} size={11} className="shrink-0 text-faint" />
                <span className="truncate max-w-[150px] sm:max-w-[220px]">{g.title}</span>
                {g.items.length > 1 && <span className="text-faint shrink-0">×{g.items.length}</span>}
              </span>
            ))}
            {/* phones show one pill; the counter covers the rest per breakpoint */}
            {groups.length > 1 && <span className="text-[11px] text-faint shrink-0 sm:hidden">+{groups.length - 1}</span>}
            {groups.length > 2 && <span className="text-[11px] text-faint shrink-0 hidden sm:inline">+{groups.length - 2}</span>}
          </span>
        </span>
        <span className="text-[11px] text-faint shrink-0 hidden sm:block">{total} excerpt{total > 1 ? 's' : ''}</span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-faint transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          style={{ transitionTimingFunction: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }}
        />
      </button>

      {/* Animated reveal (grid-rows trick: smooth without height measuring) */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ${expanded ? '[grid-template-rows:1fr]' : '[grid-template-rows:0fr]'}`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="pt-2.5">
            {/* Document switcher (only when several documents) */}
            {groups.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2 -mx-0.5 px-0.5">
                {groups.map((g, i) => {
                  const isActive = i === Math.min(active, groups.length - 1);
                  return (
                    <button
                      key={i}
                      onClick={() => setActive(i)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11.5px] font-medium whitespace-nowrap transition-all duration-200 active:scale-[0.96] ${
                        isActive
                          ? 'border-transparent text-white shadow-accent'
                          : 'border-line bg-card text-muted hover:border-line-strong hover:text-ink'
                      }`}
                      style={isActive ? { background: 'linear-gradient(155deg, var(--accent-2), var(--accent))' } : {}}
                    >
                      <KindIcon kind={g.kind} size={12} className={`shrink-0 ${isActive ? 'text-white/85' : 'text-faint'}`} />
                      <span className="truncate max-w-[160px] sm:max-w-[260px]">{g.title}</span>
                      <span className={`text-[10px] rounded-full px-1.5 py-[1px] ${isActive ? 'bg-white/20 text-white' : 'bg-card-2 text-faint'}`}>
                        {g.items.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Single document: quiet header instead of chips */}
            {groups.length === 1 && (
              <div className="flex items-center gap-1.5 pb-2 text-[11.5px] text-faint min-w-0">
                <KindIcon kind={activeGroup.kind} size={12} className="shrink-0" />
                <span className="truncate font-medium text-muted">{activeGroup.title}</span>
              </div>
            )}

            {/* Verbatim excerpts for the active document */}
            <div key={active} className="space-y-3.5">
              {activeGroup.items.map((s, i) => <Excerpt key={`${active}-${i}`} s={s} index={i} />)}
            </div>

            <p className="mt-2.5 text-[10.5px] text-faint">Exact wording from your library — compare the answer against it.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SourcesPanel;
