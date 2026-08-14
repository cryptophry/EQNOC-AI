import React, { useMemo, useState } from 'react';
import { X, Copy, Check, Calculator } from 'lucide-react';
import {
  FIBRE_COLOURS, fibreByNumber, opticalBudget, irRisePct, irAdvice,
  stringVoltage, autonomyHours, fadeCheck,
} from '../utils/fieldKit';

type Tab = 'fibre' | 'optical' | 'dc' | 'radio';

const TABS: { id: Tab; label: string }[] = [
  { id: 'fibre', label: 'Fibre' },
  { id: 'optical', label: 'Optical' },
  { id: 'dc', label: 'DC plant' },
  { id: 'radio', label: 'Radio' },
];

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">{label}</span>
    {children}
  </label>
);

const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};

const inp = 'w-full bg-card-2 border border-line rounded-xl px-3 py-2 text-[14px] text-ink outline-none focus-ring';

const FieldKitModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = useState<Tab>('fibre');
  const [fibreN, setFibreN] = useState('');
  const [copied, setCopied] = useState(false);

  const [tx, setTx] = useState('0');
  const [sens, setSens] = useState('-20');
  const [km, setKm] = useState('10');
  const [wl, setWl] = useState('1310');
  const [conns, setConns] = useState('2');
  const [splices, setSplices] = useState('4');

  const [cells, setCells] = useState('24');
  const [vpc, setVpc] = useState('2.27');
  const [baseIr, setBaseIr] = useState('2.5');
  const [nowIr, setNowIr] = useState('');
  const [ah, setAh] = useState('100');
  const [load, setLoad] = useState('8');

  const [rsl, setRsl] = useState('');
  const [design, setDesign] = useState('');
  const [thr, setThr] = useState('');

  const hit = fibreByNumber(num(fibreN));
  const opt = useMemo(
    () => opticalBudget({
      txPower: num(tx), rxSensitivity: num(sens), distance: num(km),
      wavelength: wl, connectorCount: num(conns), spliceCount: num(splices),
    }),
    [tx, sens, km, wl, conns, splices],
  );
  const optOk = [tx, sens, km].every(v => Number.isFinite(num(v)));
  const rise = irRisePct(num(baseIr), num(nowIr));
  const advice = irAdvice(rise);
  const pack = stringVoltage(num(cells), num(vpc));
  const hours = autonomyHours(num(ah), num(load));
  const radio = fadeCheck(num(rsl), num(design), num(thr));

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* ignore */ }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 sm:p-5 border-b border-line flex items-center gap-3">
          <div className="tool-well"><Calculator size={16} /></div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[16px] font-bold">Field kit</h2>
            <p className="text-[12px] text-muted">Works offline — no model, no signal needed</p>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><X size={16} /></button>
        </div>

        <div className="px-4 pt-3 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${
                tab === t.id ? 'text-white border-transparent' : 'text-muted border-line bg-card-2 hover:text-ink'
              }`}
              style={tab === t.id ? { background: 'linear-gradient(155deg, var(--accent-2), var(--accent))' } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto nice-scroll flex-1 space-y-4">
          {tab === 'fibre' && (
            <>
              <p className="text-[13px] text-muted">TIA-598-C. Tubes and ribbons repeat this order. Fibre 13 is Blue again.</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {FIBRE_COLOURS.map(c => (
                  <div key={c.n} className="rounded-xl overflow-hidden border border-line text-center">
                    <div className="h-9" style={{ background: c.hex }} />
                    <div className="px-1 py-1.5 bg-card-2">
                      <div className="text-[11px] font-bold">{c.n}</div>
                      <div className="text-[10.5px] text-muted truncate">{c.name}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Field label="Look up fibre #">
                <input inputMode="numeric" value={fibreN} onChange={e => setFibreN(e.target.value)} placeholder="e.g. 19" className={inp} />
              </Field>
              {hit && (
                <div className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <div className="w-10 h-10 rounded-lg border border-line" style={{ background: hit.hex }} />
                  <div>
                    <div className="font-semibold">Fibre {fibreN} → {hit.name}</div>
                    <div className="text-[12px] text-faint">Position {(Math.floor(num(fibreN) - 1) % 12) + 1} in the 12-colour cycle</div>
                  </div>
                </div>
              )}
              <div className="text-[12.5px] text-muted rounded-xl border border-line bg-card-2 p-3 leading-relaxed">
                <b className="text-ink">Never mate APC (green) to UPC (blue).</b> APC is 8° angled — mixing them scores the endface.
              </div>
            </>
          )}

          {tab === 'optical' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tx power (dBm)"><input inputMode="decimal" value={tx} onChange={e => setTx(e.target.value)} className={inp} /></Field>
                <Field label="Rx sensitivity (dBm)"><input inputMode="decimal" value={sens} onChange={e => setSens(e.target.value)} className={inp} /></Field>
                <Field label="Distance (km)"><input inputMode="decimal" value={km} onChange={e => setKm(e.target.value)} className={inp} /></Field>
                <Field label="Wavelength">
                  <select value={wl} onChange={e => setWl(e.target.value)} className={inp}>
                    <option value="1310">1310 nm (0.35 dB/km)</option>
                    <option value="1550">1550 nm (0.25 dB/km)</option>
                    <option value="1625">1625 nm (0.22 dB/km)</option>
                    <option value="850">850 nm MMF (3.0 dB/km)</option>
                  </select>
                </Field>
                <Field label="Connectors"><input inputMode="numeric" value={conns} onChange={e => setConns(e.target.value)} className={inp} /></Field>
                <Field label="Splices"><input inputMode="numeric" value={splices} onChange={e => setSplices(e.target.value)} className={inp} /></Field>
              </div>
              {optOk && (
                <div className={`rounded-xl border p-3.5 ${opt.status === 'PASS' ? 'border-ok/30 bg-ok/10' : 'border-danger/30 bg-danger/10'}`}>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Estimate</span>
                    <span className={`text-[13px] font-bold ${opt.status === 'PASS' ? 'text-ok' : 'text-danger'}`}>{opt.status} · {opt.margin} dB margin</span>
                  </div>
                  <ul className="text-[13px] space-y-1 text-ink">
                    <li>Fibre loss {opt.fiberLoss} dB + passives {opt.passiveLoss} dB = <b>{opt.totalLinkLoss} dB</b></li>
                    <li>Est. Rx {opt.estimatedRxPower} dBm (includes 3 dB safety in the margin)</li>
                  </ul>
                  <button
                    className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent"
                    onClick={() => copyText(`Optical budget ${wl} nm, ${km} km: loss ${opt.totalLinkLoss} dB, est Rx ${opt.estimatedRxPower} dBm, margin ${opt.margin} dB → ${opt.status}`)}
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />} Copy for the job note
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'dc' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cells in string"><input inputMode="numeric" value={cells} onChange={e => setCells(e.target.value)} className={inp} /></Field>
                <Field label="V / cell (float)"><input inputMode="decimal" value={vpc} onChange={e => setVpc(e.target.value)} className={inp} /></Field>
                <Field label="Baseline IR (mΩ)"><input inputMode="decimal" value={baseIr} onChange={e => setBaseIr(e.target.value)} className={inp} /></Field>
                <Field label="This reading (mΩ)"><input inputMode="decimal" value={nowIr} onChange={e => setNowIr(e.target.value)} placeholder="e.g. 3.5" className={inp} /></Field>
                <Field label="Usable Ah"><input inputMode="decimal" value={ah} onChange={e => setAh(e.target.value)} className={inp} /></Field>
                <Field label="Load (A)"><input inputMode="decimal" value={load} onChange={e => setLoad(e.target.value)} className={inp} /></Field>
              </div>
              <div className="rounded-xl border border-line bg-card-2 p-3.5 space-y-2 text-[13.5px]">
                {pack != null && <div>Float string voltage ≈ <b>{pack} V</b> ({cells} × {vpc})</div>}
                {hours != null && <div>Autonomy ≈ <b>{hours} h</b> at {load} A (usable Ah ÷ load)</div>}
                {rise != null && (
                  <div>
                    IR rise <b>{rise}%</b> — <span className={advice.tone === 'danger' ? 'text-danger font-semibold' : advice.tone === 'warn' ? 'text-warn font-semibold' : 'text-ok'}>{advice.label}</span>
                  </div>
                )}
              </div>
              <p className="text-[12px] text-faint leading-relaxed">Screening only. Confirm remaining runtime with a capacity test; compare cells in the same string, not just the number.</p>
            </>
          )}

          {tab === 'radio' && (
            <>
              <div className="grid grid-cols-1 gap-3">
                <Field label="Measured RSL (dBm)"><input inputMode="decimal" value={rsl} onChange={e => setRsl(e.target.value)} placeholder="e.g. −48" className={inp} /></Field>
                <Field label="Design / expected RSL (dBm)"><input inputMode="decimal" value={design} onChange={e => setDesign(e.target.value)} placeholder="e.g. −44" className={inp} /></Field>
                <Field label="Receiver threshold (dBm)"><input inputMode="decimal" value={thr} onChange={e => setThr(e.target.value)} placeholder="e.g. −70" className={inp} /></Field>
              </div>
              {radio && (
                <div className="rounded-xl border border-line bg-card-2 p-3.5 space-y-1.5 text-[13.5px]">
                  <div>Vs design: <b>{radio.vsDesign > 0 ? '+' : ''}{radio.vsDesign} dB</b> — {radio.alignment}</div>
                  <div>Fade margin: <b>{radio.fadeMargin} dB</b> — {radio.fade}</div>
                </div>
              )}
              <p className="text-[12px] text-faint">Sweep through the main lobe — a side lobe is a lower false peak. Return loss &gt;14 dB (VSWR &lt;1.5) is generally good on the feeder.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FieldKitModal;
