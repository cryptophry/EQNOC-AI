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
  type?: string; // 'pdf' | 'docx'
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

const slug = (s: string) => s.toLowerCase().replace(/\.(pdf|docx?)$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export interface IngestProgress {
  page: number;
  total: number;
  ocr: boolean;
  unit?: 'page' | 'section';
}

// Parse a PDF in the browser and stream its pages to the server for ingestion.
export async function ingestManual(
  file: File,
  onProgress?: (p: IngestProgress) => void,
): Promise<{ manualId: string; chunks: number }> {
  const isDocx = /\.docx$/i.test(file.name) || file.type.includes('wordprocessingml');
  const title = file.name.replace(/\.(pdf|docx?)$/i, '');
  const manualId = `${slug(file.name)}-${Date.now().toString(36)}`;
  const buf = await file.arrayBuffer();
  if (isDocx) return ingestDocx(buf, manualId, title, onProgress);

  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const total = pdf.numPages;

  await post({ action: 'start', manualId, title, total, unit: 'page' });

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
    onProgress?.({ page: i, total, ocr: needsOcr, unit: 'page' });
    const r = await post({ action: 'ingest', manualId, title, page: i, text, image, unit: 'page' });
    chunks += r?.chunksAdded || 0;
  }

  await post({ action: 'finalize', manualId, chunks });
  return { manualId, chunks };
}

// Parse a .docx guide in the browser (mammoth) and stream it to the server in
// word-bounded "sections" (docx has no pages), reusing the manual ingest path.
async function ingestDocx(
  buf: ArrayBuffer,
  manualId: string,
  title: string,
  onProgress?: (p: IngestProgress) => void,
): Promise<{ manualId: string; chunks: number }> {
  const mammoth = (await import('mammoth/mammoth.browser')).default;
  const { value: raw } = await mammoth.extractRawText({ arrayBuffer: buf });
  const words = (raw || '').split(/\s+/).filter(Boolean);
  if (words.length === 0) throw new Error('No readable text found in this document.');

  const PER = 450; // words per section — server re-chunks each into ~150-word pieces
  const total = Math.max(1, Math.ceil(words.length / PER));
  await post({ action: 'start', manualId, title, total, unit: 'section' });

  let chunks = 0;
  for (let i = 0; i < total; i++) {
    const seg = words.slice(i * PER, (i + 1) * PER).join(' ');
    onProgress?.({ page: i + 1, total, ocr: false, unit: 'section' });
    const r = await post({ action: 'ingest', manualId, title, page: i + 1, text: seg, unit: 'section' });
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
