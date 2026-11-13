import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ShieldAlert, Sparkles, Square, Trash2, X } from 'lucide-react';
import { ask as askAi, AuthError, isSignedIn, signIn, Turn } from '../lib/ai';
import { AskRequest } from '../App';
import Md from './Md';

const STARTERS = [
  'What is the Junos equivalent of `show ip bgp neighbors x advertised-routes`, and what does it show differently?',
  'An OmniSwitch came back from a power cut without my last changes. Why, and how do I prevent it?',
  'Give me a pre-change snapshot command set for an IOS-XR PE router.',
];

export default function Ask({ open, request, onClose }: { open: boolean; request: AskRequest | null; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needAuth, setNeedAuth] = useState(!isSignedIn());
  const [password, setPassword] = useState('');
  const [signing, setSigning] = useState(false);
  const [focus, setFocus] = useState<{ id?: string; label?: string }>({});
  const pending = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const handled = useRef(0);

  const send = async (text: string, history = turns, focusId = focus.id) => {
    const q = text.trim();
    if (!q || busy) return;
    if (needAuth) { pending.current = q; setDraft(q); return; }
    setError(''); setDraft('');
    const next: Turn[] = [...history, { role: 'user', content: q }];
    setTurns([...next, { role: 'assistant', content: '' }]);
    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const full = await askAi(next, (t) => setTurns([...next, { role: 'assistant', content: t }]), ctl.signal, focusId);
      setTurns([...next, { role: 'assistant', content: full }]);
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError') { setTurns((t) => (t[t.length - 1]?.content ? t : next.slice(0, -1))); if (!ctl.signal.aborted) setError('The request was interrupted. Ask again.'); }
      else if (e instanceof AuthError) { setTurns(history); setNeedAuth(true); pending.current = q; setDraft(q); }
      else { setTurns(history); setDraft(q); setError(e.message); }
    } finally { setBusy(false); abort.current = null; }
  };

  // A request from elsewhere in the app (Explain, Simulate, Interpret…).
  useEffect(() => {
    if (!request || request.n === handled.current) return;
    handled.current = request.n;
    setFocus({ id: request.focusId, label: request.label });
    if (request.prompt) { setTurns([]); void send(request.prompt, [], request.focusId); }
    else if (request.draft != null) { setTurns([]); setDraft(request.draft); setTimeout(() => { box.current?.focus(); box.current?.setSelectionRange(request.draft!.length, request.draft!.length); }, 80); }
  }, [request]);

  useEffect(() => { if (open && !needAuth) setTimeout(() => box.current?.focus(), 80); }, [open, needAuth]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [turns]);

  const doSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || signing) return;
    setSigning(true); setError('');
    try {
      await signIn(password);
      setNeedAuth(false); setPassword('');
    } catch (err) { setError((err as Error).message); } finally { setSigning(false); }
  };
  // send() closes over needAuth; re-run a pending question once it flips.
  useEffect(() => { if (!needAuth && pending.current) { const q = pending.current; pending.current = null; void send(q); } }, [needAuth]);

  return (
    <aside className={`ask${open ? ' open' : ''}`} aria-label="Ask AI" aria-hidden={!open} inert={!open}>
      <header>
        <Sparkles size={17} strokeWidth={1.9} />
        <h2>Ask AI</h2>
        {focus.label && <span className="ask-ctx" title="The AI is given this library entry as context">{focus.label}</span>}
        <span className="grow" />
        {turns.length > 0 && <button className="icon-btn" onClick={() => { abort.current?.abort(); setTurns([]); setFocus({}); setError(''); }} aria-label="Clear conversation" title="Clear conversation"><Trash2 size={16} /></button>}
        <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </header>

      <div className="ask-body" ref={scroller}>
        {turns.length === 0 && !needAuth && (
          <div className="ask-empty">
            <p>Ask anything about these five platforms. Answers are grounded in the curated library where it applies, and the model is told to say when it is unsure instead of guessing.</p>
            {STARTERS.map((s) => <button key={s} onClick={() => void send(s.replace(/`/g, ''))}>{s.replace(/`/g, '')}</button>)}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`turn ${t.role}`}>
            {t.role === 'user' ? <p>{t.content}</p> : t.content ? (
              <>
                <Md text={t.content} />
                {!(busy && i === turns.length - 1) && <p className="ai-flag"><ShieldAlert size={13} /> AI-generated. Confirm syntax with <code>?</code> on the device before relying on it.</p>}
              </>
            ) : <p className="thinking"><i /><i /><i /></p>}
          </div>
        ))}
        {needAuth && (
          <form className="signin" onSubmit={doSignIn}>
            <h3>Sign in to use AI</h3>
            <p>The command library, playbooks and drills work without signing in. AI uses the NOC Assistant team password.</p>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Team password" autoComplete="current-password" aria-label="Team password" />
            <button className="btn primary" disabled={!password || signing}>{signing ? 'Signing in…' : 'Sign in'}</button>
          </form>
        )}
        {error && <p className="ask-error" role="alert">{error}</p>}
      </div>

      <form className="ask-input" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
        <textarea ref={box} value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(8, Math.max(2, draft.split('\n').length))} placeholder="Ask a question, or paste device output to interpret"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); } }} spellCheck={false} />
        {busy
          ? <button type="button" className="send stop" onClick={() => abort.current?.abort()} aria-label="Stop"><Square size={14} fill="currentColor" /></button>
          : <button className="send" disabled={!draft.trim()} aria-label="Send"><ArrowUp size={18} strokeWidth={2.4} /></button>}
      </form>
    </aside>
  );
}
