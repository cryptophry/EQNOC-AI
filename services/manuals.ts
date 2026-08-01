// Client-side manual ingestion + management. The browser parses the PDF with
// pdf.js (text extraction, and page-image rendering for scanned pages), and
// streams pages to /api/manuals, which chunks/OCRs/embeds them into Upstash.

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getAuthToken } from './ai';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const API = '/api/manuals';

export interface ManualRecord {
  id: string;
  title: string;
  pages: number;
  chunks: number;
  status: string;
  addedBy?: string | null;
  addedAt?: string;
}

function authHeaders(): Record<string, string> {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export async function listManuals(): Promise<ManualRecord[]> {
  const res = await fetch(API, { headers: authHeaders() });
  if (!res.ok) throw new Error(`List failed (${res.status})`);
  return (await res.json()).manuals || [];
}

export async function deleteManual(manualId: string): Promise<void> {
  const res = await fetch(API, { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ manualId }) });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

const slug = (s: string) => s.toLowerCase().replace(/\.pdf$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export interface IngestProgress {
  page: number;
  total: number;
  ocr: boolean;
}

// Parse a PDF in the browser and stream its pages to the server for ingestion.
export async function ingestManual(
  file: File,
  onProgress?: (p: IngestProgress) => void,
): Promise<{ manualId: string; chunks: number }> {
  const title = file.name.replace(/\.pdf$/i, '');
  const manualId = `${slug(file.name)}-${Date.now().toString(36)}`;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const total = pdf.numPages;

  await post({ action: 'start', manualId, title, total });

  let chunks = 0;
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    let text = tc.items.map((it) => ('str' in it ? it.str : '')).join(' ').trim();
    let image: string | undefined;
    const needsOcr = text.length < 100;
    if (needsOcr) {
      // Render the page and send it as an image for server-side OCR.
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      image = canvas.toDataURL('image/jpeg', 0.8);
      text = '';
    }
    onProgress?.({ page: i, total, ocr: needsOcr });
    const r = await post({ action: 'ingest', manualId, title, page: i, text, image });
    chunks += r?.chunksAdded || 0;
  }

  await post({ action: 'finalize', manualId, chunks });
  return { manualId, chunks };
}

async function post(body: unknown): Promise<{ chunksAdded?: number } & Record<string, unknown>> {
  const res = await fetch(API, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* ignore */ }
    throw new Error(`Ingest failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}
