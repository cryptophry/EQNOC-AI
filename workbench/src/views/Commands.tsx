import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CornerDownLeft, FlaskConical, MessageSquareText, ScanText, Search, Star, X } from 'lucide-react';
import { BY_ID, CATS, Cat, Entry, LIBRARY, P, PLATFORMS, PLAYBOOKS, VARS } from '../data';
import { fill, varsIn } from '../lib/cmd';
import { search } from '../lib/search';
import { useMedia, useStored } from '../lib/store';
import { useApp } from '../App';
import Rosetta, { CommandText, Rich } from '../components/Rosetta';

const SHORT: Record<P, string> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.short])) as never;
const FULL: Record<P, string> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.name])) as never;
const CAT: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.id, c.name]));
const EXAMPLES = ['bgp neighbours', 'optical levels', 'sh ip int br', 'show bundle brief', 'find mac', 'save config'];

export default function Commands({ selectedId }: { selectedId?: string }) {
  const { primary, setPrimary, visible, vars, favs, toggleFav, copy, go } = useApp();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useStored<Cat | 'all' | 'fav'>('cat', 'all');
  const [cursor, setCursor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wide = useMedia('(min-width: 980px)');

  const hits = useMemo(() => search(query, { cat: query ? (cat === 'fav' ? 'fav' : 'all') : cat, favs, prefer: primary }), [query, cat, favs, primary]);
  // While searching, results come from the whole library so a category filter never hides the answer.
  const activeId = (wide ? cursor : null) ?? selectedId ?? (wide ? hits[0]?.entry.id : undefined);
  const active: Entry | undefined = activeId ? BY_ID[activeId] : undefined;
  const sheetOpen = !wide && !!selectedId && !!BY_ID[selectedId];

  useEffect(() => { setCursor(null); }, [query, cat]);
  useEffect(() => { if (selectedId) setCursor(selectedId); }, [selectedId]);

  useEffect(() => {
    const on = () => { inputRef.current?.focus(); inputRef.current?.select(); };
    window.addEventListener('rosetta:focus-search', on);
    return () => window.removeEventListener('rosetta:focus-search', on);
  }, []);
  useEffect(() => { if (wide) inputRef.current?.focus(); }, [wide]);

  useEffect(() => {
    if (!activeId) return;
    listRef.current?.querySelector(`[data-id="${activeId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const copyFor = (entry: Entry | undefined, p: P) => {
    const c = entry?.cmds[p];
    if (c) copy(fill(c, vars), `${SHORT[p]} command`);
  };

  useEffect(() => {
    const on = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement;
      const inSearch = el === inputRef.current;
      const typing = !inSearch && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (typing || ev.ctrlKey || ev.metaKey) return;
      if (document.querySelector('.scrim') || document.querySelector('.ask.open')?.contains(el)) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        if (!hits.length) return;
        ev.preventDefault();
        const i = hits.findIndex((h) => h.entry.id === activeId);
        const next = hits[Math.max(0, Math.min(hits.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)))];
        setCursor(next.entry.id);
      } else if (ev.key === 'Enter' && inSearch) {
        ev.preventDefault();
        if (active?.cmds[primary]) copyFor(active, primary);
      } else if (ev.key === 'Escape' && inSearch && query) {
        ev.stopPropagation(); setQuery('');
      } else if (ev.altKey && /^[1-5]$/.test(ev.key)) {
        const p = visible[Number(ev.key) - 1];
        if (p && active) { ev.preventDefault(); copyFor(active, p); }
      } else if (ev.altKey && ev.key.toLowerCase() === 's' && active) {
        ev.preventDefault(); toggleFav(active.id);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const open = (id: string) => { if (wide) setCursor(id); else go(`c/${id}`); };

  return (
    <div className={`commands${sheetOpen ? ' sheet-open' : ''}`}>
      <section className="finder" aria-label="Find a command">
        <div className="finder-head">
          <label className="searchbox">
            <Search size={19} strokeWidth={1.9} aria-hidden="true" />
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} autoComplete="off" autoCapitalize="off"
              placeholder="A task, or a command from any platform" aria-label="Search commands" />
            {query ? <button className="icon-btn" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Clear search"><X size={16} /></button> : <kbd className="desk-only">/</kbd>}
          </label>
          <div className="finder-controls">
            <div className="platpick" role="radiogroup" aria-label="Main platform">
              {visible.map((p) => (
                <button key={p} role="radio" aria-checked={p === primary} className={p === primary ? 'on' : ''} style={{ ['--pc' as string]: `var(--p-${p})` }} onClick={() => setPrimary(p)} title={`Show ${FULL[p]} commands in the list`}>
                  {SHORT[p]}
                </button>
              ))}
            </div>
          </div>
          {!query && (
            <div className="cats" role="tablist" aria-label="Category">
              <button role="tab" aria-selected={cat === 'all'} className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>All <i>{LIBRARY.length}</i></button>
              <button role="tab" aria-selected={cat === 'fav'} className={cat === 'fav' ? 'on' : ''} onClick={() => setCat('fav')}><Star size={12} fill="currentColor" /> Saved <i>{favs.length}</i></button>
              {CATS.map((c) => (
                <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>
              ))}
            </div>
          )}
          {query && (
            <p className="resultline">
              {hits.length ? `${hits.length} ${hits.length === 1 ? 'match' : 'matches'} across the library` : 'No match in the curated library'}
            </p>
          )}
        </div>

        <div className="results" ref={listRef} role="listbox" aria-label="Commands">
          {hits.map((h) => {
            const x = h.entry;
            const c = x.cmds[primary];
            return (
              <button key={x.id} data-id={x.id} role="option" aria-selected={x.id === activeId} className={`result${x.id === activeId ? ' on' : ''}`} onClick={() => open(x.id)}>
                <span className="r-title">
                  {x.title}
                  {favs.includes(x.id) && <Star size={11} fill="currentColor" className="r-fav" />}
                  {x.risk === 'disruptive' && <span className="risk-dot" title="Can interrupt service" />}
                </span>
                <span className="r-cmd">
                  {h.cmdMatch && h.cmdMatch !== primary && <em style={{ ['--pc' as string]: `var(--p-${h.cmdMatch})` }}>matches {SHORT[h.cmdMatch]}</em>}
                  {c ? <code><CommandText cmd={c.split('\n')[0]} />{c.includes('\n') && ' …'}</code> : <code className="na">no {SHORT[primary]} equivalent</code>}
                </span>
              </button>
            );
          })}
          {!hits.length && query && <NoMatch query={query} />}
          {!hits.length && !query && cat === 'fav' && (
            <div className="empty"><Star size={22} /><h3>Nothing saved yet</h3><p>Open any command and press the star, or <kbd>Alt</kbd><kbd>S</kbd>, to keep it here.</p></div>
          )}
        </div>
        {!query && wide && (
          <footer className="finder-foot">Try {EXAMPLES.map((ex, i) => <button key={ex} onClick={() => { setQuery(ex); inputRef.current?.focus(); }}>{ex}{i < EXAMPLES.length - 1 ? '' : ''}</button>)}</footer>
        )}
      </section>

      <section className="inspector" aria-label="Command detail">
        {active ? <Inspector entry={active} onBack={wide ? undefined : () => go('')} /> : (
          <div className="empty big"><Search size={26} /><h3>Pick a command</h3><p>Search by task or paste a command you already know from another platform.</p></div>
        )}
      </section>
    </div>
  );
}

function NoMatch({ query }: { query: string }) {
  const { ask } = useApp();
  return (
    <div className="empty">
      <h3>Not in the curated library</h3>
      <p>Nothing matches “{query}”. You can ask the AI, which will answer for all five platforms and flag anything it is unsure of.</p>
      <button className="btn primary" onClick={() => ask({ prompt: `Give me the command for: ${query}\n\nCover each platform in scope, and say clearly where a platform has no equivalent or you are not certain of the syntax.` })}>
        <MessageSquareText size={16} /> Ask AI about “{query.length > 28 ? query.slice(0, 28) + '…' : query}”
      </button>
    </div>
  );
}

function Inspector({ entry, onBack }: { entry: Entry; onBack?: () => void }) {
  const { visible, primary, vars, setVar, favs, toggleFav, ask } = useApp();
  const used = useMemo(() => {
    const out: string[] = [];
    for (const p of visible) for (const v of varsIn(entry.cmds[p])) if (!out.includes(v)) out.push(v);
    return out;
  }, [entry, visible]);
  const inBooks = useMemo(() => PLAYBOOKS.filter((b) => b.steps.some((s) => s.entry === entry.id)), [entry]);
  const fav = favs.includes(entry.id);
  const main = entry.cmds[primary] ? primary : visible.find((p) => entry.cmds[p]) || primary;
  const mainCmd = entry.cmds[main] ? fill(entry.cmds[main] as string, vars) : '';
  const plat = PLATFORMS.find((p) => p.id === main)!;

  return (
    <article className="insp" key={entry.id}>
      <header className="insp-head">
        {onBack && <button className="back" onClick={onBack}><ArrowLeft size={17} /> Commands</button>}
        <div className="insp-meta">
          <span>{CAT[entry.cat]}</span>
          {entry.risk === 'read' && entry.kind === 'show' && <span className="badge read">Read-only</span>}
          {entry.risk === 'change' && <span className="badge change">Changes configuration</span>}
          {entry.risk === 'disruptive' && <span className="badge danger"><AlertTriangle size={12} strokeWidth={2.4} /> Can interrupt service</span>}
        </div>
        <div className="insp-title">
          <h1>{entry.title}</h1>
          <button className={`star${fav ? ' on' : ''}`} onClick={() => toggleFav(entry.id)} aria-pressed={fav} aria-label={fav ? 'Remove from saved' : 'Save this command'} title="Save (Alt S)">
            <Star size={19} fill={fav ? 'currentColor' : 'none'} />
          </button>
        </div>
        <p className="insp-desc">{entry.desc}</p>
      </header>

      {used.length > 0 && (
        <div className="vars" aria-label="Fill in values">
          {used.map((v) => (
            <label key={v}>
              <span>{VARS[v]?.label || v}</span>
              <input value={vars[v] || ''} onChange={(e) => setVar(v, e.target.value)} placeholder={VARS[v]?.hint} spellCheck={false} autoComplete="off" autoCapitalize="off" />
            </label>
          ))}
        </div>
      )}

      <Rosetta entry={entry} platforms={visible} numbered />
      <p className="ros-hint desk-only"><CornerDownLeft size={13} /> <span><kbd>Enter</kbd> copies {plat.short}. <kbd>Alt</kbd> with a row number copies that platform.</span></p>

      {entry.gotcha && (
        <aside className="gotcha"><AlertTriangle size={17} strokeWidth={2} /><p><Rich text={entry.gotcha} /></p></aside>
      )}

      {entry.look && (
        <section className="look">
          <h2>What to read in the output</h2>
          <ul>{entry.look.map((l) => <li key={l}><Rich text={l} /></li>)}</ul>
        </section>
      )}

      <section className="ai-actions">
        <h2>Go deeper with AI</h2>
        <div>
          {entry.kind !== 'config' && <button className="btn" disabled={!mainCmd} onClick={() => ask({ focusId: entry.id, label: entry.title, prompt: `Simulate the output of \`${mainCmd}\` on ${plat.name} for a typical healthy device, then show how the same output looks when something is wrong.` })}>
            <FlaskConical size={16} /> Simulate {plat.short} output
          </button>}
          <button className="btn" onClick={() => ask({ focusId: entry.id, label: entry.title, prompt: `Explain "${entry.title}" in depth: what each platform's command actually reports, the fields that matter, and the differences between platforms that trip people up.` })}>
            <MessageSquareText size={16} /> Explain in depth
          </button>
          {entry.kind !== 'config' && <button className="btn" disabled={!mainCmd} onClick={() => ask({ focusId: entry.id, label: entry.title, draft: `This is output from \`${mainCmd}\` on ${plat.name}. What does it show, and what should I check next?\n\n` })}>
            <ScanText size={16} /> Interpret my output
          </button>}
        </div>
      </section>

      {inBooks.length > 0 && (
        <section className="usedin">
          <h2>Used in playbooks</h2>
          <div>{inBooks.map((b) => <a key={b.id} href={`#/playbooks/${b.id}`}>{b.title}</a>)}</div>
        </section>
      )}
    </article>
  );
}
