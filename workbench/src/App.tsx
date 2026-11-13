import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Keyboard, ListChecks, Moon, Sparkles, Sun, Target, Terminal, X } from 'lucide-react';
import { P, P_ORDER, PLATFORMS } from './data';
import { VarValues } from './lib/cmd';
import { useHashRoute, useStored } from './lib/store';
import Commands from './views/Commands';
import Playbooks from './views/Playbooks';
import Learn from './views/Learn';
import Drill from './views/Drill';
import Ask from './components/Ask';

export interface AskRequest { prompt?: string; draft?: string; focusId?: string; label?: string; n: number }

interface AppCtx {
  primary: P;
  setPrimary: (p: P) => void;
  visible: P[];
  vars: VarValues;
  setVar: (k: string, v: string) => void;
  favs: string[];
  toggleFav: (id: string) => void;
  copy: (text: string, label: string) => void;
  ask: (req: Omit<AskRequest, 'n'>) => void;
  go: (path: string) => void;
}
const Ctx = createContext<AppCtx>(null!);
export const useApp = () => useContext(Ctx);

type Theme = 'auto' | 'dark' | 'light';

const NAV = [
  { id: '', label: 'Commands', icon: Terminal },
  { id: 'playbooks', label: 'Playbooks', icon: ListChecks },
  { id: 'learn', label: 'Learn', icon: BookOpen },
  { id: 'drill', label: 'Drill', icon: Target },
] as const;

export default function App() {
  const [route, go] = useHashRoute();
  const [primary, setPrimary] = useStored<P>('primary', 'ios');
  const [hidden, setHidden] = useStored<P[]>('hidden', []);
  const [vars, setVars] = useStored<VarValues>('vars', {});
  const [favs, setFavs] = useStored<string[]>('favs', []);
  const [theme, setTheme] = useStored<Theme>('theme', 'auto');
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askReq, setAskReq] = useState<AskRequest | null>(null);
  const [panel, setPanel] = useState<'settings' | 'keys' | null>(null);
  const counter = useRef(0);

  const visible = useMemo(() => {
    const v = P_ORDER.filter((p) => !hidden.includes(p) || p === primary);
    return v.length ? v : P_ORDER;
  }, [hidden, primary]);

  useEffect(() => {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  const copy = useCallback((text: string, label: string) => {
    const done = () => setToast({ text: `Copied ${label}`, n: ++counter.current });
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => setToast({ text: 'Copy was blocked by the browser', n: ++counter.current }));
    else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } finally { ta.remove(); }
    }
  }, []);

  const ask = useCallback((req: Omit<AskRequest, 'n'>) => {
    setAskReq({ ...req, n: ++counter.current });
    setAskOpen(true);
  }, []);

  const ctx: AppCtx = useMemo(() => ({
    primary, setPrimary, visible, vars,
    setVar: (k, v) => setVars((prev) => ({ ...prev, [k]: v })),
    favs,
    toggleFav: (id) => setFavs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    copy, ask, go,
  }), [primary, setPrimary, visible, vars, setVars, favs, setFavs, copy, ask, go]);

  // Global shortcuts.
  useEffect(() => {
    const on = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === 'k') {
        ev.preventDefault(); setAskOpen(false); setPanel(null);
        if (route[0] && route[0] !== 'c') go('');
        setTimeout(() => window.dispatchEvent(new Event('rosetta:focus-search')), 30);
      } else if (mod && ev.key.toLowerCase() === 'j') {
        ev.preventDefault(); setAskOpen((o) => !o);
      } else if (ev.key === 'Escape') {
        if (panel) setPanel(null); else if (askOpen) setAskOpen(false);
      } else if (!typing && !mod && !ev.altKey) {
        if (ev.key === '/') { ev.preventDefault(); if (route[0] && route[0] !== 'c') go(''); setTimeout(() => window.dispatchEvent(new Event('rosetta:focus-search')), 30); }
        else if (ev.key === '?') { ev.preventDefault(); setPanel('keys'); }
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [route, go, panel, askOpen]);

  const section = route[0] === 'c' ? '' : route[0] || '';
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <Ctx.Provider value={ctx}>
      <div className={`app${askOpen ? ' ask-open' : ''}`}>
        <nav className="rail" aria-label="Sections">
          <a className="mark" href="#/" aria-label="Rosetta, go to commands">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {P_ORDER.map((p, i) => <rect key={p} x="3" y={3.2 + i * 3.9} width={[18, 12, 15, 9, 13][i]} height="2.2" rx="1.1" fill={`var(--p-${p})`} />)}
            </svg>
          </a>
          <div className="rail-nav">
            {NAV.map((n) => (
              <a key={n.id} href={`#/${n.id}`} className={section === n.id ? 'on' : ''} aria-current={section === n.id ? 'page' : undefined}>
                <n.icon size={19} strokeWidth={1.75} />
                <span>{n.label}</span>
              </a>
            ))}
          </div>
          <div className="rail-foot">
            <button className={askOpen ? 'on' : ''} onClick={() => setAskOpen((o) => !o)} title="Ask AI (Ctrl J)">
              <Sparkles size={19} strokeWidth={1.75} /><span>Ask AI</span>
            </button>
            <button onClick={() => setPanel('keys')} title="Keyboard shortcuts (?)" className="desk-only">
              <Keyboard size={19} strokeWidth={1.75} /><span>Keys</span>
            </button>
            <button onClick={() => setPanel('settings')} title="Platforms and appearance" aria-label="Platforms and appearance">
              {dark ? <Moon size={19} strokeWidth={1.75} /> : <Sun size={19} strokeWidth={1.75} />}<span>Setup</span>
            </button>
          </div>
        </nav>

        <main className="stage">
          {section === '' && <Commands selectedId={route[0] === 'c' ? route[1] : undefined} />}
          {section === 'playbooks' && <Playbooks id={route[1]} />}
          {section === 'learn' && <Learn id={route[1]} />}
          {section === 'drill' && <Drill scope={route[1]} />}
        </main>

        <Ask open={askOpen} request={askReq} onClose={() => setAskOpen(false)} />

        {panel === 'settings' && (
          <div className="scrim" onClick={() => setPanel(null)}>
            <div className="dialog" role="dialog" aria-label="Platforms and appearance" onClick={(e) => e.stopPropagation()}>
              <header><h2>Setup</h2><button className="icon-btn" onClick={() => setPanel(null)} aria-label="Close"><X size={18} /></button></header>
              <h3>Platforms you work on</h3>
              <p className="hint">Hidden platforms drop out of every command view and drill.</p>
              <div className="plat-toggles">
                {PLATFORMS.map((p) => {
                  const on = !hidden.includes(p.id) || p.id === primary;
                  return (
                    <button key={p.id} className={on ? 'on' : ''} style={{ ['--pc' as string]: `var(--p-${p.id})` }} disabled={p.id === primary}
                      onClick={() => setHidden((h) => (h.includes(p.id) ? h.filter((x) => x !== p.id) : [...h, p.id]))}>
                      <i>{on && <Check size={13} strokeWidth={3} />}</i>
                      <b>{p.name}</b><small>{p.vendor}{p.id === primary ? ', your main platform' : ''}</small>
                    </button>
                  );
                })}
              </div>
              <h3>Appearance</h3>
              <div className="seg">
                {(['auto', 'dark', 'light'] as Theme[]).map((t) => (
                  <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>{t === 'auto' ? 'Match system' : t === 'dark' ? 'Dark' : 'Light'}</button>
                ))}
              </div>
              <h3>About the data</h3>
              <p className="hint">Commands are a hand-curated library, not AI output. Syntax varies by release and hardware, so entries marked "confirm with ?" are worth checking on the device. AI answers are always labelled.</p>
            </div>
          </div>
        )}

        {panel === 'keys' && (
          <div className="scrim" onClick={() => setPanel(null)}>
            <div className="dialog" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
              <header><h2>Keyboard shortcuts</h2><button className="icon-btn" onClick={() => setPanel(null)} aria-label="Close"><X size={18} /></button></header>
              <dl className="keys">
                <dt><kbd>/</kbd> or <kbd>Ctrl</kbd><kbd>K</kbd></dt><dd>Search commands</dd>
                <dt><kbd>↑</kbd><kbd>↓</kbd></dt><dd>Move through results</dd>
                <dt><kbd>Enter</kbd></dt><dd>Copy the command for your main platform</dd>
                <dt><kbd>Alt</kbd><kbd>1</kbd>…<kbd>5</kbd></dt><dd>Copy the command for that platform row</dd>
                <dt><kbd>Alt</kbd><kbd>S</kbd></dt><dd>Save or unsave the selected command</dd>
                <dt><kbd>Ctrl</kbd><kbd>J</kbd></dt><dd>Open or close Ask AI</dd>
                <dt><kbd>Esc</kbd></dt><dd>Clear the search, or close a panel</dd>
                <dt><kbd>?</kbd></dt><dd>Show this list</dd>
              </dl>
            </div>
          </div>
        )}

        <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite" key={toast?.n}>
          {toast && <><Check size={15} strokeWidth={2.5} />{toast.text}</>}
        </div>
      </div>
    </Ctx.Provider>
  );
}
