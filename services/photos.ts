// Client-side "reference images" ingestion + management. The browser downscales the
// image to keep the payload small, then sends it to /api/photos, which runs the
// vision model (transcribe + describe) and embeds the result into Upstash so the
// assistant can answer questions about the photo later.

import { getAuthToken } from './ai';

const API = '/api/photos';

export interface PhotoRecord {
  id: string;
  title: string;
  summary?: string;
  chunks: number;
  status: string;
  addedBy?: string | null;
  addedAt?: string;
}

function authHeaders(): Record<string, string> {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export async function listPhotos(): Promise<PhotoRecord[]> {
  const res = await fetch(API, { headers: authHeaders() });
  if (!res.ok) throw new Error(`List failed (${res.status})`);
  return (await res.json()).photos || [];
}

export async function deletePhoto(photoId: string): Promise<void> {
  const res = await fetch(API, { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ photoId }) });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

const slug = (s: string) =>
  s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';

// Downscale an image file to a data URL (max edge ~1600px, JPEG) for OCR-quality
// transcription without a multi-MB upload.
function toDownscaledDataUrl(file: File, maxEdge = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas unavailable')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

// Ingest one photo. `note` is an optional technician caption ("what is this?").
export async function ingestPhoto(
  file: File,
  note?: string,
): Promise<{ photoId: string; chunks: number; summary?: string }> {
  const dataUrl = await toDownscaledDataUrl(file);
  const photoId = `photo-${slug(note || file.name)}-${Date.now().toString(36)}`;
  const title = (note && note.trim()) || file.name.replace(/\.[a-z0-9]+$/i, '');
  const res = await fetch(API, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ action: 'ingest', photoId, title, image: dataUrl, note: note?.trim() || undefined }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* ignore */ }
    throw new Error(`Upload failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  const j = await res.json();
  return { photoId, chunks: j.chunksAdded || 0, summary: j.summary };
}
