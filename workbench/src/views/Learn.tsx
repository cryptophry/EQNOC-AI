import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Clock, Target } from 'lucide-react';
import { BY_ID, GUIDES, PLATFORMS } from '../data';
import { buildDeck, stats, ProgressMap } from '../lib/drill';
import { load, useMedia } from '../lib/store';
import { useApp } from '../App';
import Rosetta, { Rich } from '../components/Rosetta';

export default function Learn({ id }: { id?: string }) {
  const { visible, primary, go } = useApp();
  const wide = useMedia('(min-width: 980px)');
  const guide = GUIDES.find((g) => g.id === id) ?? (wide ? GUIDES[0] : undefined);
  const [allPlat, setAllPlat] = useState(false);
  const prog = useMemo(() => load<ProgressMap>('drill', {}), [id]);

  const shown = guide?.platform && !allPlat ? [guide.platform] : visible;

  return (
    <div className={`split${guide && !wide ? ' detail' : ''}`}>
      <aside className="index" aria-label="Guides">
        <header className="page-head">
          <h1>Learn</h1>
          <p>Short field guides that explain how each CLI thinks, then drills that make the commands stick.</p>
        </header>
        <div className="index-list">
          {GUIDES.map((g) => {
            const deck = buildDeck(g.platform ? [g.platform] : [primary], g.drill);
            const s = stats(deck, prog);
            const pct = deck.length ? Math.round((s.mastered / deck.length) * 100) : 0;
            return (
              <a key={g.id} href={`#/learn/${g.id}`} className={guide?.id === g.id ? 'on' : ''} style={g.platform ? { ['--pc' as string]: `var(--p-${g.platform})` } : undefined}>
                <b>{g.platform && <i className="pdot" />}{g.title}</b>
                <span><Rich text={g.summary} /></span>
                <span className="meter" title={`${s.mastered} of ${deck.length} drill commands mastered`}><u style={{ width: `${pct}%` }} /></span>
                <ChevronRight size={16} />
              </a>
            );
          })}
        </div>
      </aside>

      {guide && (
        <article className="reader prose" key={guide.id}>
          {!wide && <button className="back" onClick={() => go('learn')}><ArrowLeft size={17} /> Guides</button>}
          <header className="reader-head">
            {guide.platform && <span className="plat-label" style={{ ['--pc' as string]: `var(--p-${guide.platform})` }}>{PLATFORMS.find((p) => p.id === guide.platform)!.vendor} {PLATFORMS.find((p) => p.id === guide.platform)!.name}</span>}
            <h1>{guide.title}</h1>
            <p><Rich text={guide.summary} /></p>
            <div className="reader-tools">
              <span className="mins"><Clock size={14} /> {guide.minutes} min read</span>
              {guide.platform && <label className="check"><input type="checkbox" checked={allPlat} onChange={(e) => setAllPlat(e.target.checked)} /> Compare with other platforms</label>}
            </div>
          </header>
          {guide.blocks.map((b, i) => {
            if (b.t === 'p') return <p key={i}><Rich text={b.text} /></p>;
            if (b.t === 'h') return <h2 key={i}>{b.text}</h2>;
            if (b.t === 'tip') return <aside key={i} className="tip"><Rich text={b.text} /></aside>;
            if (b.t === 'table') return (
              <div key={i} className="tablewrap">
                <table>
                  <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => (k === 0 ? <th key={k} scope="row"><Rich text={c} /></th> : <td key={k}><Rich text={c} /></td>))}</tr>)}</tbody>
                </table>
              </div>
            );
            return (
              <div key={i} className="entryset">
                {b.ids.map((eid) => BY_ID[eid]).filter(Boolean).map((entry) => (
                  <div key={entry.id} className="entrycard">
                    <a href={`#/c/${entry.id}`}>{entry.title}</a>
                    <Rosetta entry={entry} platforms={shown} dense notes={shown.length === 1} />
                  </div>
                ))}
              </div>
            );
          })}
          <footer className="reader-foot">
            <a className="btn primary" href={`#/drill/${guide.id}`}><Target size={16} /> Drill this guide</a>
            <span className="hint">{guide.drill.length} commands, typed from memory, repeated until they stick.</span>
          </footer>
        </article>
      )}
    </div>
  );
}
