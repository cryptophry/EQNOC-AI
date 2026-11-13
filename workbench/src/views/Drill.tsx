import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CornerDownLeft, RotateCcw, X } from 'lucide-react';
import { CATS, GUIDES, P, PLATFORMS } from '../data';
import { advance, buildDeck, Card, grade, Grade, INTERVALS, orderDeck, ProgressMap, stats } from '../lib/drill';
import { useStored } from '../lib/store';
import { useApp } from '../App';
import { CommandText, Rich } from '../components/Rosetta';

const NAME: Record<P, string> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.name])) as never;
const SHORT: Record<P, string> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.short])) as never;
const WAIT = ['now', 'tomorrow', 'in 3 days', 'in a week', 'in 3 weeks'];

export default function Drill({ scope }: { scope?: string }) {
  const { visible, primary, favs, go } = useApp();
  const [prog, setProg] = useStored<ProgressMap>('drill', {});
  const [plats, setPlats] = useStored<P[]>('drillPlats', [primary]);
  const [session, setSession] = useState<Card[] | null>(null);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<Grade | null>(null);
  const [tally, setTally] = useState({ right: 0, wrong: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const active = plats.filter((p) => visible.includes(p));
  const usePlats = active.length ? active : [primary];
  const guide = GUIDES.find((g) => g.id === scope);
  const cat = CATS.find((c) => c.id === scope);
  const ids = guide ? guide.drill : scope === 'saved' ? favs : undefined;
  const deck = useMemo(() => {
    const d = buildDeck(guide?.platform ? [guide.platform] : usePlats, ids);
    return cat ? d.filter((c) => c.entry.cat === cat.id) : d;
  }, [usePlats.join(), scope, favs.length]);
  const st = stats(deck, prog);
  const card = session?.[i];

  const start = () => { setSession(orderDeck(deck, prog)); setI(0); setTyped(''); setResult(null); setTally({ right: 0, wrong: 0 }); };
  useEffect(() => { setSession(null); }, [scope, usePlats.join()]);
  useEffect(() => { if (card && !result) inputRef.current?.focus(); }, [card, result]);

  const submit = (giveUp = false) => {
    if (!card || result) return;
    const g: Grade = giveUp ? 'wrong' : grade(typed, card.answer);
    setResult(g);
    setTally((t) => (g === 'wrong' ? { ...t, wrong: t.wrong + 1 } : { ...t, right: t.right + 1 }));
    setProg((p) => ({ ...p, [card.key]: advance(p[card.key], g !== 'wrong') }));
  };
  const next = () => { setI((n) => n + 1); setTyped(''); setResult(null); };

  useEffect(() => {
    if (!result) return;
    const on = (ev: KeyboardEvent) => { if (ev.key === 'Enter') { ev.preventDefault(); next(); } };
    const t = setTimeout(() => window.addEventListener('keydown', on), 120);
    return () => { clearTimeout(t); window.removeEventListener('keydown', on); };
  }, [result]);

  const scopeName = guide ? guide.title : cat ? cat.name : scope === 'saved' ? 'Saved commands' : 'Whole library';

  // ── Session finished ──
  if (session && i >= session.length) {
    const total = tally.right + tally.wrong;
    return (
      <div className="drill">
        <div className="drill-card done">
          <p className="drill-kicker">{scopeName}</p>
          <h1>{tally.right} of {total} from memory</h1>
          <p className="lede">{tally.wrong === 0 ? 'Clean round. Those cards now wait longer before they return.' : `The ${tally.wrong} you missed go back to the start and will come up first next round.`}</p>
          <div className="drill-actions">
            <button className="btn primary" onClick={start}><RotateCcw size={16} /> Another round</button>
            <button className="btn" onClick={() => setSession(null)}>Change what I drill</button>
          </div>
        </div>
      </div>
    );
  }

  // ── In a session ──
  if (session && card) {
    const box = prog[card.key]?.box ?? 0;
    return (
      <div className="drill">
        <div className="drill-bar">
          <button className="back" onClick={() => setSession(null)}><X size={16} /> End round</button>
          <div className="pips" aria-label={`Card ${i + 1} of ${session.length}`}>{session.map((c, n) => <i key={c.key} className={n < i ? 'past' : n === i ? 'now' : ''} />)}</div>
          <span className="count">{i + 1} / {session.length}</span>
        </div>
        <div className="drill-card" style={{ ['--pc' as string]: `var(--p-${card.p})` }} key={card.key}>
          <p className="drill-plat">{NAME[card.p]}</p>
          <h1>{card.entry.title}</h1>
          <p className="lede">{card.entry.desc}</p>
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <label className={`answer${result ? ` ${result}` : ''}`}>
              <span className="prompt">{PLATFORMS.find((p) => p.id === card.p)!.prompt}</span>
              <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} readOnly={!!result} spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" aria-label="Type the command" placeholder="type the command" />
            </label>
            {!result && (
              <div className="drill-actions">
                <button className="btn primary" type="submit" disabled={!typed.trim()}>Check <CornerDownLeft size={15} /></button>
                <button className="btn ghost" type="button" onClick={() => submit(true)}>I don't know</button>
                <span className="hint">Abbreviations count, as they would on the device. Use any value where the command takes one.</span>
              </div>
            )}
          </form>
          {result && (
            <div className={`verdict ${result}`} role="status">
              <p className="v-head">
                {result === 'wrong' ? <><X size={17} strokeWidth={2.6} /> Not quite. The command is:</> : result === 'abbrev' ? <><Check size={17} strokeWidth={2.6} /> Correct, abbreviated. In full:</> : <><Check size={17} strokeWidth={2.6} /> Correct.</>}
              </p>
              {result !== 'exact' && <pre><CommandText cmd={card.answer} /></pre>}
              {card.entry.notes?.[card.p] && <p className="v-note"><Rich text={card.entry.notes[card.p]!} /></p>}
              <div className="drill-actions">
                <button className="btn primary" onClick={next} autoFocus>Next <CornerDownLeft size={15} /></button>
                <a className="btn ghost" href={`#/c/${card.entry.id}`}>See all platforms</a>
                <span className="hint">Returns {result === 'wrong' ? 'next round' : WAIT[Math.min(box, INTERVALS.length - 1)]}.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Setup ──
  return (
    <div className="drill">
      <div className="drill-card setup">
        <p className="drill-kicker">Drill</p>
        <h1>Type it from memory</h1>
        <p className="lede">You get a task and a platform, and type the command as you would on the device. Commands you get right come back after longer and longer gaps; misses come back straight away.</p>

        {!guide?.platform && (
          <fieldset>
            <legend>Platforms to drill</legend>
            <div className="chipset">
              {visible.map((p) => {
                const on = usePlats.includes(p);
                return <button key={p} className={on ? 'on' : ''} aria-pressed={on} style={{ ['--pc' as string]: `var(--p-${p})` }} onClick={() => setPlats(on ? (usePlats.length > 1 ? usePlats.filter((x) => x !== p) : usePlats) : [...usePlats, p])}>{SHORT[p]}</button>;
              })}
            </div>
          </fieldset>
        )}

        <fieldset>
          <legend>What to drill</legend>
          <div className="chipset">
            <button className={!scope ? 'on' : ''} onClick={() => go('drill')}>Whole library</button>
            {favs.length > 0 && <button className={scope === 'saved' ? 'on' : ''} onClick={() => go('drill/saved')}>Saved</button>}
            {CATS.filter((c) => c.id !== 'config').map((c) => <button key={c.id} className={scope === c.id ? 'on' : ''} onClick={() => go(`drill/${c.id}`)}>{c.name}</button>)}
          </div>
          <div className="chipset guides">
            {GUIDES.map((g) => <button key={g.id} className={scope === g.id ? 'on' : ''} onClick={() => go(`drill/${g.id}`)}>{g.title}</button>)}
          </div>
        </fieldset>

        <div className="mastery" aria-label="Progress">
          <div className="bar"><u className="m" style={{ width: `${deck.length ? (st.mastered / deck.length) * 100 : 0}%` }} /><u className="l" style={{ width: `${deck.length ? (st.learning / deck.length) * 100 : 0}%` }} /></div>
          <dl>
            <div><dt>Mastered</dt><dd>{st.mastered}</dd></div>
            <div><dt>Learning</dt><dd>{st.learning}</dd></div>
            <div><dt>Not yet seen</dt><dd>{st.fresh}</dd></div>
            <div><dt>Due now</dt><dd>{st.due}</dd></div>
          </dl>
        </div>

        <div className="drill-actions">
          <button className="btn primary big" onClick={start} disabled={!deck.length}>Start a round of {Math.min(12, deck.length)}</button>
          {!deck.length && <span className="hint">Nothing to drill in this selection. Pick another platform or scope.</span>}
        </div>
      </div>
    </div>
  );
}
