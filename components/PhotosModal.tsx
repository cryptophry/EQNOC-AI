import React, { useEffect, useRef, useState } from 'react';
import { X, Upload, Trash2, Loader2, ImageIcon, CheckCircle2 } from 'lucide-react';
import { listPhotos, deletePhoto, ingestPhoto, PhotoRecord } from '../services/photos';

interface Props {
  onClose: () => void;
}

const PhotosModal: React.FC<Props> = ({ onClose }) => {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    try { setPhotos(await listPhotos()); setError(''); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = '';
    if (!files.length) return;
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) { setError('Please choose image files (JPG, PNG, HEIC, etc.).'); return; }
    setError('');
    try {
      for (let i = 0; i < images.length; i++) {
        setBusy({ done: i, total: images.length, name: images[i].name });
        // One shared note for the batch; add an index when there are several.
        const perNote = note.trim() && images.length > 1 ? `${note.trim()} (${i + 1})` : note.trim() || undefined;
        await ingestPhoto(images[i], perNote);
      }
      setNote('');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (p: PhotoRecord) => {
    try { await deletePhoto(p.id); setPhotos((prev) => prev.filter((x) => x.id !== p.id)); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[82vh] bg-card border border-line rounded-xl2 shadow-raised flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 sm:p-5 border-b border-line flex items-center gap-3">
          <ImageIcon size={18} className="text-accent" />
          <h2 className="text-[16px] font-bold">Reference images</h2>
          <span className="text-[12px] text-muted">{photos.length}</span>
          <button onClick={onClose} className="ml-auto text-muted hover:text-ink" aria-label="Close"><X size={20} /></button>
        </div>

        {/* Upload */}
        <div className="p-4 border-b border-line">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={!!busy}
            placeholder="What is this? e.g. Alarm circuit wiring, or rectifier nameplate (optional)"
            className="w-full mb-2.5 px-3 py-2.5 rounded-xl bg-card-2 border border-line text-[14px] placeholder:text-faint focus:outline-none focus:border-accent disabled:opacity-60"
          />
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!!busy}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-[14px] font-semibold shadow-accent disabled:opacity-60"
            style={{ background: 'linear-gradient(155deg, var(--accent-2), var(--accent) 60%, var(--accent-strong))' }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {busy ? 'Reading image…' : 'Upload image(s)'}
          </button>
          {busy && (
            <div className="mt-3">
              <div className="flex justify-between text-[12px] text-muted mb-1">
                <span className="truncate">{busy.name}</span>
                <span>{busy.total > 1 ? `${busy.done + 1}/${busy.total}` : 'reading…'}</span>
              </div>
              <div className="h-1.5 bg-card-2 rounded-full overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${((busy.done + 0.5) / busy.total) * 100}%` }} />
              </div>
            </div>
          )}
          <p className="text-[11.5px] text-faint mt-2">Add a photo, wiring diagram, sketch or nameplate. It's read for text and detail, then remembered — ask about it in any chat later.</p>
        </div>

        {error && <div className="px-4 py-2 text-[13px] text-danger">{error}</div>}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
          {loading ? (
            <div className="flex justify-center py-10 text-faint"><Loader2 size={22} className="animate-spin" /></div>
          ) : photos.length === 0 ? (
            <div className="text-center py-10 text-faint flex flex-col items-center gap-2">
              <ImageIcon size={30} /><p className="text-[13px]">No reference images yet — upload one to make it searchable.</p>
            </div>
          ) : photos.map((p) => (
            <div key={p.id} className="bg-card-2 border border-line rounded-xl p-3.5 flex items-start gap-3">
              <ImageIcon size={18} className="text-muted shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[14.5px] font-semibold truncate">{p.title}</div>
                {p.summary && <div className="text-[12px] text-muted line-clamp-2 mt-0.5">{p.summary}</div>}
                <div className="text-[12px] text-muted flex items-center gap-2 mt-1">
                  <span>{p.chunks} sections</span>
                  {p.status === 'ready'
                    ? <span className="inline-flex items-center gap-1 text-ok"><CheckCircle2 size={12} /> ready</span>
                    : <span className="text-warn">{p.status}</span>}
                </div>
              </div>
              <button onClick={() => handleDelete(p)} className="p-2 text-faint hover:text-danger shrink-0" aria-label="Delete photo"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PhotosModal;
