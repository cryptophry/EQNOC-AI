import React, { useEffect, useRef, useState } from 'react';
import { X, BookText, Upload, Trash2, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { listManuals, deleteManual, ingestManual, ManualRecord, IngestProgress } from '../services/manuals';

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

  const refresh = async () => {
    setLoading(true);
    try { setManuals(await listManuals()); setError(''); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') { setError('Please choose a PDF file.'); return; }
    setError('');
    setUploadingName(file.name);
    setProgress({ page: 0, total: 0, ocr: false });
    try {
      await ingestManual(file, (p) => setProgress(p));
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

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[82vh] bg-card border border-line rounded-xl2 shadow-raised flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 sm:p-5 border-b border-line flex items-center gap-3">
          <BookText size={18} className="text-accent" />
          <h2 className="text-[16px] font-bold">Equipment manuals</h2>
          <span className="text-[12px] text-muted">{manuals.length}</span>
          <button onClick={onClose} className="ml-auto text-muted hover:text-ink" aria-label="Close"><X size={20} /></button>
        </div>

        {/* Upload */}
        <div className="p-4 border-b border-line">
          <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!!progress}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-[14px] font-semibold shadow-accent disabled:opacity-60"
            style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 60%, var(--accent-strong))' }}
          >
            {progress ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {progress ? 'Processing…' : 'Upload a manual (PDF)'}
          </button>
          {progress && (
            <div className="mt-3">
              <div className="flex justify-between text-[12px] text-muted mb-1">
                <span className="truncate">{uploadingName}</span>
                <span>{progress.total ? `page ${progress.page}/${progress.total}${progress.ocr ? ' · OCR' : ''}` : 'reading…'}</span>
              </div>
              <div className="h-1.5 bg-card-2 rounded-full overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: progress.total ? `${(progress.page / progress.total) * 100}%` : '10%' }} />
              </div>
            </div>
          )}
          <p className="text-[11.5px] text-faint mt-2">Text and scanned PDFs both work — scanned pages are OCR'd automatically. Keep the tab open while it processes.</p>
        </div>

        {error && <div className="px-4 py-2 text-[13px] text-danger">{error}</div>}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
          {loading ? (
            <div className="flex justify-center py-10 text-faint"><Loader2 size={22} className="animate-spin" /></div>
          ) : manuals.length === 0 ? (
            <div className="text-center py-10 text-faint flex flex-col items-center gap-2">
              <FileText size={30} /><p className="text-[13px]">No manuals yet — upload one to make it searchable.</p>
            </div>
          ) : manuals.map((m) => (
            <div key={m.id} className="bg-card-2 border border-line rounded-xl p-3.5 flex items-center gap-3">
              <FileText size={18} className="text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[14.5px] font-semibold truncate">{m.title}</div>
                <div className="text-[12px] text-muted flex items-center gap-2">
                  <span>{m.pages} pages · {m.chunks} sections</span>
                  {m.status === 'ready'
                    ? <span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 size={12} /> ready</span>
                    : <span className="text-warn">{m.status}</span>}
                </div>
              </div>
              <button onClick={() => handleDelete(m)} className="p-2 text-faint hover:text-danger shrink-0" aria-label="Delete manual"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ManualsModal;
