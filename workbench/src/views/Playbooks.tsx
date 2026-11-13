import { useState } from 'react';
import { ArrowLeft, Check, ChevronRight, MessageSquareText } from 'lucide-react';
import { BY_ID, PLATFORMS, PLAYBOOKS } from '../data';
import { useMedia } from '../lib/store';
import { useApp } from '../App';
import Rosetta, { Rich } from '../components/Rosetta';
import PlatPick from '../components/PlatPick';

export default function Playbooks({ id }: { id?: string }) {
  const { primary, visible, ask, go } = useApp();
  const wide = useMedia('(min-width: 980px)');
  const book = PLAYBOOKS.find((b) => b.id === id) ?? (wide ? PLAYBOOKS[0] : undefined);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [all, setAll] = useState(false);
  const plat = PLATFORMS.find((p) => p.id === primary)!;

  return (
    <div className={`split${book && !wide ? ' detail' : ''}`}>
      <aside className="index" aria-label="Playbooks">
        <header className="page-head">
          <h1>Playbooks</h1>
          <p>Fault-finding sequences. Each step gives the command for your platform and what the answer means.</p>
        </header>
        <div className="index-list">
          {PLAYBOOKS.map((b) => (
            <a key={b.id} href={`#/playbooks/${b.id}`} className={book?.id === b.id ? 'on' : ''}>
              <b>{b.title}</b><span>{b.symptom}</span><ChevronRight size={16} />
            </a>
          ))}
        </div>
      </aside>

      {book && (
        <article className="reader" key={book.id}>
          {!wide && <button className="back" onClick={() => go('playbooks')}><ArrowLeft size={17} /> Playbooks</button>}
          <header className="reader-head">
            <h1>{book.title}</h1>
            <p>{book.symptom}</p>
            <div className="reader-tools">
              <PlatPick />
              <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show every platform</label>
            </div>
          </header>
          <ol className="steps">
            {book.steps.map((s, i) => {
              const key = `${book.id}:${i}`;
              const entry = s.entry ? BY_ID[s.entry] : undefined;
              return (
                <li key={key} className={done[key] ? 'done' : ''}>
                  <button className="tick" aria-pressed={!!done[key]} aria-label={done[key] ? 'Mark step not done' : 'Mark step done'} onClick={() => setDone((d) => ({ ...d, [key]: !d[key] }))}>
                    {done[key] ? <Check size={15} strokeWidth={3} /> : i + 1}
                  </button>
                  <div className="step-body">
                    <h2>{s.title}</h2>
                    <p className="why">{s.why}</p>
                    {entry && <Rosetta entry={entry} platforms={all ? visible : [primary]} dense notes={all ? false : true} />}
                    {s.read && <ul className="read">{s.read.map((r) => <li key={r}><Rich text={r} /></li>)}</ul>}
                    {!s.read && entry?.look && <ul className="read">{entry.look.slice(0, 2).map((r) => <li key={r}><Rich text={r} /></li>)}</ul>}
                    {entry && <a className="more" href={`#/c/${entry.id}`}>Open “{entry.title}”</a>}
                  </div>
                </li>
              );
            })}
          </ol>
          <footer className="reader-foot">
            <button className="btn" onClick={() => ask({ label: book.title, draft: `I'm working through "${book.title}" on ${plat.name}. Here is what I have found so far:\n\n` })}>
              <MessageSquareText size={16} /> Talk it through with AI
            </button>
            {Object.keys(done).some((k) => k.startsWith(book.id) && done[k]) && <button className="btn ghost" onClick={() => setDone({})}>Reset ticks</button>}
          </footer>
        </article>
      )}
    </div>
  );
}
