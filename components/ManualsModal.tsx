import React, { useEffect, useRef, useState } from 'react';
import { X, BookText, Upload, Trash2, Loader2, FileText, CheckCircle2, Pencil, Check, Download, Search, WifiOff, ShieldCheck, ClipboardList, Gauge, FileSpreadsheet } from 'lucide-react';
import { listManuals, deleteManual, renameManual, downloadManualForOffline, ManualRecord, IngestProgress, ingestManual, CATEGORIES, categoryLabel } from '../services/manuals';
import { getOfflineIds, listOfflineManuals, removeOfflineManual, searchOffline, OfflineHit } from '../utils/offlineLibrary';

const CAT_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  equipment: BookText,
  datasheets: FileSpreadsheet,
  safety: ShieldCheck,
  procedures: ClipboardList,
  testing: Gauge,
  other: FileText,
};

const CatIcon: React.FC<{ cat?: string; size?: number; className?: string }> = ({ cat, size = 14, className }) => {
  const Icon = CAT_ICONS[cat || 'other'] || FileText;
  return <Icon size={size} className={className} />;
};

const normCat = (c?: string) => (CATEGORIES.some((x) => x.key === c) ? (c as string) : 'other');

interface Props {
  onClose: () => void;
}

const ManualsModal: React.FC<Props> = ({ onClose }) => {
  const [manuals, setManuals] = useState<ManualRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [uploadingName, setUploadingName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Offline library
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [offlineMode, setOfflineMode] = useState(false);
  const [dl, setDl] = useState<{ id: string; fetched: number } | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<OfflineHit[]>([]);

  // Categories
  const [uploadCategory, setUploadCategory] = useState('equipment');
  const [catFilter, setCatFilter] = useState('');
  const [catEditId, setCatEditId] = useState<string | null>(null);

  const setCategory = async (m: ManualRecord, key: string) => {
    setCatEditId(null);
    if (key === normCat(m.category)) return;
    const prev = manuals;
    setManuals((list) => list.map((x) => (x.id === m.id ? { ...x, category: key } : x))); // optimistic
    try { await renameManual(m.id, undefined, key); }
    catch (e) { setManuals(prev); setError((e as Error).message); }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      setManuals(await listManuals());
      setOfflineMode(false);
      setError('');
    } catch (e) {
      // No network (or server error): fall back to the device's offline copies.
      const saved = await listOfflineManuals();
      if (saved.length > 0) {
        setManuals(saved.map((s) => ({ id: s.id, title: s.title, pages: s.pages, chunks: 0, status: 'ready', type: s.type, category: s.category })));
        setOfflineMode(true);
        setError('');
      } else {
        setError((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); getOfflineIds().then(setOfflineIds); }, []);

  // Offline keyword search over downloaded items (works with no network).
  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits([]); return; }
    const t = setTimeout(() => { searchOffline(q).then(setHits); }, 180);
    return () => clearTimeout(t);
  }, [query]);

  const toggleOffline = async (m: ManualRecord) => {
    setError('');
    if (offlineIds.has(m.id)) {
      await removeOfflineManual(m.id);
      setOfflineIds((prev) => { const n = new Set(prev); n.delete(m.id); return n; });
      return;
    }
    setDl({ id: m.id, fetched: 0 });
    try {
      await downloadManualForOffline(m, (fetched) => setDl({ id: m.id, fetched }));
      setOfflineIds((prev) => new Set(prev).add(m.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDl(null);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    const okPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const okDocx = /\.docx$/i.test(file.name) || file.type.includes('wordprocessingml');
    if (!okPdf && !okDocx) { setError('Please choose a PDF or Word (.docx) file.'); return; }
    setError('');
    setUploadingName(file.name);
    setProgress({ page: 0, total: 0, ocr: false });
    try {
      await ingestManual(file, (p) => setProgress(p), uploadCategory);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress(null);
      setUploadingName('');
    }
  };

  const handleDelete = async (m: ManualRecord) => {
    try { await deleteManual(m.id); setManuals((prev) => prev.filter((x) => x.id !== m.id)); }
    catch (e) { setError((e as Error).message); }
  };

  // Inline rename
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const startEdit = (m: ManualRecord) => { setEditingId(m.id); setEditTitle(m.title); };
  const saveEdit = async () => {
    const id = editingId, title = editTitle.trim();
    setEditingId(null);
    if (!id || !title) return;
    const prev = manuals;
    setManuals((list) => list.map((x) => (x.id === id ? { ...x, title } : x))); // optimistic
    try { await renameManual(id, title); }
    catch (e) { setManuals(prev); setError((e as Error).message); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet w-full max-w-2xl max-h-[82vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 sm:p-5 border-b border-line flex items-center gap-3">
          <BookText size={18} className="text-accent" />
          <h2 className="text-[16px] font-bold">Manuals &amp; guides</h2>
          <span className="text-[12px] text-muted">{manuals.length}</span>
          <button onClick={onClose} className="ml-auto text-muted hover:text-ink" aria-label="Close"><X size={20} /></button>
        </div>

        {/* Upload */}
        <div className="p-4 border-b border-line">
          {/* Category for the next upload */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
            <span className="text-[11px] text-faint shrink-0 mr-0.5">File under</span>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setUploadCategory(c.key)}
                disabled={!!progress}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11.5px] font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${
                  uploadCategory === c.key ? 'border-accent text-accent bg-code-bg' : 'border-line text-muted hover:text-ink'
                }`}
              >
                <CatIcon cat={c.key} size={11} /> {c.label}
              </button>
            ))}
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!!progress}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-[14px] font-semibold shadow-accent disabled:opacity-60"
            style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 60%, var(--accent-strong))' }}
          >
            {progress ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {progress ? 'Processing…' : 'Upload a manual or guide (PDF / Word)'}
          </button>
          {progress && (
            <div className="mt-3">
              <div className="flex justify-between text-[12px] text-muted mb-1">
                <span className="truncate">{uploadingName}</span>
                <span>{progress.total ? `${progress.unit === 'section' ? 'section' : 'page'} ${progress.page}/${progress.total}${progress.ocr ? ' · OCR' : ''}` : 'reading…'}</span>
              </div>
              <div className="h-1.5 bg-card-2 rounded-full overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: progress.total ? `${(progress.page / progress.total) * 100}%` : '10%' }} />
              </div>
            </div>
          )}
          <p className="text-[11.5px] text-faint mt-2">Equipment manuals (PDF, incl. scanned — OCR'd automatically) and team-written guides (Word .docx) both work. Keep the tab open while it processes.</p>
        </div>

        {error && <div className="px-4 py-2 text-[13px] text-danger">{error}</div>}

        {/* Offline search — works with no signal over downloaded items */}
        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 bg-card-2 border border-line rounded-xl px-3 py-2 focus-ring">
            <Search size={15} className="text-faint shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={offlineIds.size ? 'Search offline library (works with no signal)…' : 'Search — download an item for offline first'}
              className="flex-1 bg-transparent border-0 outline-none text-[13.5px] placeholder:text-faint"
              aria-label="Search offline library"
            />
            {query && <button onClick={() => setQuery('')} className="text-faint hover:text-ink" aria-label="Clear search"><X size={14} /></button>}
          </div>
          {offlineMode && (
            <div className="mt-2 flex items-center gap-2 text-[12px] text-warn">
              <WifiOff size={13} /> No connection — showing items saved on this device.
            </div>
          )}
        </div>

        {/* List / search results */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
          {query.trim() ? (
            hits.length === 0 ? (
              <div className="text-center py-10 text-faint flex flex-col items-center gap-2">
                <Search size={26} /><p className="text-[13px]">{offlineIds.size ? 'No matches in your downloaded items.' : 'Nothing downloaded yet — tap the download icon on an item first.'}</p>
              </div>
            ) : hits.map((h, i) => (
              <div key={i} className="bg-card-2 border border-line rounded-xl p-3.5">
                <div className="flex items-center gap-2 mb-1 min-w-0">
                  <FileText size={14} className="text-muted shrink-0" />
                  <span className="text-[13px] font-semibold truncate">{h.title}</span>
                  <span className="text-[10.5px] font-mono font-semibold text-accent bg-code-bg border border-line rounded-md px-1.5 py-[1px] shrink-0">
                    {h.unit === 'section' ? `§${h.page}` : `p.${h.page}`}
                  </span>
                </div>
                <p className="text-[12.5px] leading-[1.6] text-muted whitespace-pre-wrap line-clamp-5 m-0">{h.text}</p>
              </div>
            ))
          ) : loading ? (
            <div className="flex justify-center py-10 text-faint"><Loader2 size={22} className="animate-spin" /></div>
          ) : manuals.length === 0 ? (
            <div className="text-center py-10 text-faint flex flex-col items-center gap-2">
              <FileText size={30} /><p className="text-[13px]">No manuals or guides yet — upload one to make it searchable.</p>
            </div>
          ) : (
            <>
              {/* Category filter — instant inventory of what's uploaded */}
              {(() => {
                const counts = manuals.reduce<Record<string, number>>((acc, m) => {
                  const k = normCat(m.category); acc[k] = (acc[k] || 0) + 1; return acc;
                }, {});
                const present = CATEGORIES.filter((c) => counts[c.key]);
                if (present.length < 2) return null;
                return (
                  <div className="flex flex-wrap gap-1.5 pb-1">
                    <button onClick={() => setCatFilter('')} className={`px-2.5 py-1 rounded-full border text-[11.5px] font-medium whitespace-nowrap transition-colors ${!catFilter ? 'border-accent text-accent bg-code-bg' : 'border-line text-muted hover:text-ink'}`}>
                      All · {manuals.length}
                    </button>
                    {present.map((c) => (
                      <button key={c.key} onClick={() => setCatFilter(catFilter === c.key ? '' : c.key)} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11.5px] font-medium whitespace-nowrap transition-colors ${catFilter === c.key ? 'border-accent text-accent bg-code-bg' : 'border-line text-muted hover:text-ink'}`}>
                        <CatIcon cat={c.key} size={11} /> {c.label} · {counts[c.key]}
                      </button>
                    ))}
                  </div>
                );
              })()}

              {/* Grouped by category, A→Z within each group */}
              {CATEGORIES.filter((c) => !catFilter || c.key === catFilter).map((c) => {
                const items = manuals
                  .filter((m) => normCat(m.category) === c.key)
                  .sort((a, b) => a.title.localeCompare(b.title));
                if (items.length === 0) return null;
                return (
                  <div key={c.key}>
                    <div className="flex items-center gap-2 px-1 pt-3 pb-1.5">
                      <CatIcon cat={c.key} size={13} className="text-accent" />
                      <span className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-muted">{c.label}</span>
                      <span className="text-[11px] text-faint">{items.length}</span>
                      <div className="flex-1 h-px bg-line ml-1" style={{ background: 'var(--line)' }} />
                    </div>
                    <div className="space-y-2">
                      {items.map((m) => (
                        <div key={m.id} className="bg-card-2 border border-line rounded-xl p-3.5 flex items-center gap-3">
                          <CatIcon cat={c.key} size={18} className="text-muted shrink-0" />
                          <div className="flex-1 min-w-0">
                            {editingId === m.id ? (
                              <input
                                autoFocus
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                                onBlur={saveEdit}
                                className="w-full text-[14.5px] font-semibold bg-card border border-accent rounded-md px-2 py-1 outline-none"
                                aria-label="New name"
                              />
                            ) : (
                              <div className="text-[14.5px] font-semibold truncate">{m.title}</div>
                            )}
                            <div className="text-[12px] text-muted flex items-center gap-2 flex-wrap">
                              {catEditId === m.id ? (
                                <select
                                  autoFocus
                                  defaultValue={normCat(m.category)}
                                  onChange={(e) => setCategory(m, e.target.value)}
                                  onBlur={() => setCatEditId(null)}
                                  className="text-[11.5px] bg-card border border-accent rounded-md px-1 py-0.5 outline-none text-ink"
                                  aria-label="Category"
                                >
                                  {CATEGORIES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                                </select>
                              ) : (
                                <button
                                  onClick={() => !offlineMode && setCatEditId(m.id)}
                                  className="inline-flex items-center gap-1 text-[11px] text-accent bg-code-bg border border-line rounded-full px-2 py-[1px] hover:border-accent transition-colors"
                                  title="Change category"
                                >
                                  <CatIcon cat={normCat(m.category)} size={10} /> {categoryLabel(m.category)}
                                </button>
                              )}
                              <span>{m.type === 'docx' ? `Guide · ${m.chunks} sections` : `${m.pages} pages · ${m.chunks} sections`}</span>
                              {m.status === 'ready'
                                ? <span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 size={12} /> ready</span>
                                : <span className="text-warn">{m.status}</span>}
                              {offlineIds.has(m.id) && <span className="inline-flex items-center gap-1 text-accent"><Download size={11} /> offline</span>}
                            </div>
                          </div>
                          {dl?.id === m.id ? (
                            <span className="p-2 shrink-0 flex items-center gap-1 text-[11px] text-accent"><Loader2 size={14} className="animate-spin" />{dl.fetched > 0 ? dl.fetched : ''}</span>
                          ) : (
                            <button
                              onClick={() => toggleOffline(m)}
                              disabled={offlineMode}
                              className={`p-2 shrink-0 transition-colors disabled:opacity-40 ${offlineIds.has(m.id) ? 'text-accent hover:text-danger' : 'text-faint hover:text-accent'}`}
                              aria-label={offlineIds.has(m.id) ? 'Remove offline copy' : 'Keep offline'}
                              title={offlineIds.has(m.id) ? 'Available offline — tap to remove' : 'Keep offline'}
                            >
                              {offlineIds.has(m.id) ? <CheckCircle2 size={16} /> : <Download size={16} />}
                            </button>
                          )}
                          {editingId === m.id ? (
                            <button onMouseDown={(e) => { e.preventDefault(); saveEdit(); }} className="p-2 text-accent shrink-0" aria-label="Save name"><Check size={16} /></button>
                          ) : (
                            <button onClick={() => startEdit(m)} disabled={offlineMode} className="p-2 text-faint hover:text-accent shrink-0 disabled:opacity-40" aria-label="Rename"><Pencil size={15} /></button>
                          )}
                          <button onClick={() => handleDelete(m)} disabled={offlineMode} className="p-2 text-faint hover:text-danger shrink-0 disabled:opacity-40" aria-label="Delete manual"><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManualsModal;
