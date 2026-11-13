import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Entry, P, PLATFORMS } from '../data';
import { fill, segments } from '../lib/cmd';
import { useApp } from '../App';

const NAME: Record<P, { name: string; short: string }> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p])) as never;

/** Inline text with `code` spans. */
export function Rich({ text }: { text: string }) {
  const { vars } = useApp();
  const parts = fill(text, vars).split(/(`[^`]+`)/g);
  return <>{parts.map((s, i) => (s.startsWith('`') && s.endsWith('`') ? <code key={i}>{s.slice(1, -1)}</code> : <span key={i}>{s}</span>))}</>;
}

export function CommandText({ cmd }: { cmd: string }) {
  const { vars } = useApp();
  return (
    <>
      {segments(cmd, vars).map((s, i) => (s.kind === 'text' ? <span key={i}>{s.text}</span> : <span key={i} className={s.kind === 'var' ? 'tok' : 'tok filled'}>{s.text}</span>))}
    </>
  );
}

/**
 * The signature element: one intent, every platform's dialect, aligned.
 * Clicking a row copies that platform's command.
 */
export default function Rosetta({ entry, platforms, numbered = false, notes = true, dense = false }: {
  entry: Entry; platforms: P[]; numbered?: boolean; notes?: boolean; dense?: boolean;
}) {
  const { vars, copy, primary } = useApp();
  const [flash, setFlash] = useState<P | null>(null);

  const doCopy = (p: P) => {
    const c = entry.cmds[p];
    if (!c) return;
    copy(fill(c, vars), `${NAME[p].short} command`);
    setFlash(p);
    setTimeout(() => setFlash((f) => (f === p ? null : f)), 900);
  };

  return (
    <div className={`rosetta${dense ? ' dense' : ''}`}>
      {platforms.map((p, i) => {
        const c = entry.cmds[p];
        const note = entry.notes?.[p];
        const check = entry.check?.includes(p);
        return (
          <div key={p} className={`ros-row${c ? '' : ' none'}${flash === p ? ' flash' : ''}${p === primary ? ' main' : ''}`} style={{ ['--pc' as string]: `var(--p-${p})` }}>
            <div className="ros-tab">
              <span className="ros-name">{NAME[p].short}</span>
              {numbered && c && <kbd title={`Alt ${i + 1} copies this`}>{i + 1}</kbd>}
            </div>
            <div className="ros-body">
              {c ? (
                <button className="ros-cmd" onClick={() => doCopy(p)} aria-label={`Copy ${NAME[p].name} command`}>
                  <pre><CommandText cmd={c} /></pre>
                  <span className="ros-copy">{flash === p ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} />}</span>
                </button>
              ) : (
                <div className="ros-na">No equivalent</div>
              )}
              {notes && (note || check) && (
                <p className="ros-note">
                  {check && <span className="confirm" title="Syntax varies by release. Confirm with ? on the device.">confirm with ?</span>}
                  {note && <Rich text={note} />}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
