import React, { useMemo, useState } from 'react';
import { COMMAND_LIBRARY } from '../constants';
import { CommandRef } from '../types';
import { Search, X, Copy, Check, Star, HelpCircle, Play } from 'lucide-react';

interface Props {
  onClose: () => void;
  onExplainCommand: (cmd: string, context: string) => void;
  onSimulateCommand: (cmd: string, context: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  phys: 'Physical', l2: 'Layer 2', l3: 'Layer 3', bgp: 'BGP', ospf: 'OSPF', isis: 'IS-IS',
  mpls: 'MPLS', qos: 'QoS', mcast: 'Multicast', sec: 'Security', sys: 'System', opt: 'Optical',
};
const label = (c: string) => CATEGORY_LABELS[c] || c.toUpperCase();

const CommandLibraryModal: React.FC<Props> = ({ onClose, onExplainCommand, onSimulateCommand }) => {
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('ALL');
  const [copied, setCopied] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('eqnoc_cmd_favorites') || '[]'); } catch { return []; }
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    COMMAND_LIBRARY.forEach(c => c.category?.forEach(cat => set.add(cat)));
    return ['ALL', ...Array.from(set)];
  }, []);

  const toggleFav = (title: string) => {
    setFavorites(prev => {
      const next = prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title];
      try { localStorage.setItem('eqnoc_cmd_favorites', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return COMMAND_LIBRARY
      .filter(c => activeCat === 'ALL' || c.category?.includes(activeCat))
      .filter(c => !q || c.title.toLowerCase().includes(q) || c.cisco.toLowerCase().includes(q) || c.juniper.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
      .sort((a, b) => (favorites.includes(b.title) ? 1 : 0) - (favorites.includes(a.title) ? 1 : 0));
  }, [query, activeCat, favorites]);

  const Cmd = ({ vendor, value, context }: { vendor: string; value: string; context: string }) => (
    <div className="flex items-center gap-2 bg-code-bg border border-line rounded-lg px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-faint w-14 shrink-0">{vendor}</span>
      <code className="flex-1 font-mono text-[13px] text-code-ink truncate">{value}</code>
      <button onClick={() => copy(value)} className="text-faint hover:text-accent shrink-0" aria-label={`Copy ${vendor} command`}>
        {copied === value ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
      </button>
      <button onClick={() => onSimulateCommand(value, context)} className="text-faint hover:text-accent shrink-0" title="Simulate output" aria-label="Simulate output"><Play size={13} /></button>
      <button onClick={() => onExplainCommand(value, context)} className="text-faint hover:text-accent shrink-0" title="Explain" aria-label="Explain command"><HelpCircle size={14} /></button>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet w-full max-w-2xl h-[82vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-line flex items-center gap-3">
          <h2 className="text-[16px] font-bold">Command library</h2>
          <span className="text-[12px] text-muted">{filtered.length} commands</span>
          <button onClick={onClose} className="ml-auto text-muted hover:text-ink" aria-label="Close"><X size={20} /></button>
        </div>

        {/* Search + categories */}
        <div className="p-4 border-b border-line space-y-3">
          <div className="flex items-center gap-2 bg-card-2 border border-line rounded-xl px-3 py-2 focus-ring transition-shadow">
            <Search size={16} className="text-faint" />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search commands…"
              className="flex-1 bg-transparent outline-none text-[14px] text-ink placeholder:text-faint" />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCat(cat)}
                className={`text-[12px] px-3 py-1.5 rounded-full border transition-colors ${
                  activeCat === cat ? 'bg-accent text-white border-transparent' : 'bg-card-2 text-muted border-line hover:border-line-strong'
                }`}>
                {cat === 'ALL' ? 'All' : label(cat)}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
          {filtered.length === 0 && <p className="text-center text-faint text-[13px] py-10">No commands match.</p>}
          {filtered.map((c: CommandRef) => (
            <div key={c.title} className="bg-card-2 border border-line rounded-xl p-3.5">
              <div className="flex items-start gap-2 mb-2">
                <div className="flex-1">
                  <div className="text-[14.5px] font-semibold">{c.title}</div>
                  <div className="text-[12.5px] text-muted">{c.desc}</div>
                </div>
                <button onClick={() => toggleFav(c.title)} className="shrink-0" aria-label="Favorite">
                  <Star size={16} className={favorites.includes(c.title) ? 'text-warn fill-current' : 'text-faint'} />
                </button>
              </div>
              <div className="space-y-1.5">
                <Cmd vendor="Cisco" value={c.cisco} context="Cisco" />
                <Cmd vendor="Juniper" value={c.juniper} context="Juniper" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommandLibraryModal;
