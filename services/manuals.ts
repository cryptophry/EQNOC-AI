// Client-side manual ingestion + management. The browser parses the PDF with
// pdf.js (text extraction, and page-image rendering for scanned pages), and
// streams pages to /api/manuals, which chunks/OCRs/embeds them into Upstash.

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getAuthToken, clearAuth } from './ai';
import { downscaleImage } from '../utils/image';

// An expired session means every call here 401s. Rather than surfacing raw
// errors in the modal, drop the stale token and reload — the app lands on the
// login screen.
function handleAuthFailure(res: Response): void {
  if (res.status === 401) {
    clearAuth();
    window.location.reload();
    throw new Error('Session expired — signing you out.');
  }
}

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
  handleAuthFailure(res);
  if (!res.ok) throw new Error(`List failed (${res.status})`);
  return (await res.json()).manuals || [];
}

export async function deleteManual(manualId: string): Promise<void> {
  const res = await fetch(API, { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ manualId }) });
  handleAuthFailure(res);
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

export async function renameManual(manualId: string, title: string): Promise<void> {
  const res = await fetch(API, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'rename', manualId, title }) });
  handleAuthFailure(res);
  if (!res.ok) throw new Error(`Rename failed (${res.status})`);
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

// --- .docx guides ---
// Guides are often screenshot-heavy and contain tables, so we render the docx to
// HTML (mammoth, images inlined as data URLs) and walk it IN READING ORDER into
// "sections": text runs, tables converted to markdown, and each embedded image
// as its own section that the server OCRs/describes with the vision model.

type DocxBlock = { kind: 'text'; text: string } | { kind: 'image'; dataUrl: string; caption: string };

function tableToMarkdown(table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (!rows.length) return '';
  const lines: string[] = [];
  rows.forEach((r, i) => {
    const cells = Array.from(r.querySelectorAll('th,td')).map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim());
    if (!cells.length) return;
    lines.push('| ' + cells.join(' | ') + ' |');
    if (i === 0) lines.push('| ' + cells.map(() => '---').join(' | ') + ' |');
  });
  return lines.join('\n');
}

// Split an over-long text run so no single section is huge (server re-chunks too).
function splitWords(text: string, per = 450): string[] {
  const t = text.trim();
  if (!t) return [];
  const w = t.split(/\s+/);
  if (w.length <= per) return [t];
  const out: string[] = [];
  for (let i = 0; i < w.length; i += per) out.push(w.slice(i, i + per).join(' '));
  return out;
}

function htmlToBlocks(html: string): DocxBlock[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: DocxBlock[] = [];
  let textBuf: string[] = [];
  let lastHeading = '';
  const flush = () => {
    const t = textBuf.join('\n\n').trim();
    textBuf = [];
    for (const seg of splitWords(t)) blocks.push({ kind: 'text', text: seg });
  };
  const pushImg = (el: Element) => {
    const src = el.getAttribute('src') || '';
    if (src.startsWith('data:image')) { flush(); blocks.push({ kind: 'image', dataUrl: src, caption: lastHeading }); }
  };
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'img') pushImg(child);
      else if (tag === 'table') { const md = tableToMarkdown(child); if (md) textBuf.push(md); }
      else if (/^h[1-6]$/.test(tag)) { const t = (child.textContent || '').trim(); if (t) { lastHeading = t; textBuf.push(t); } }
      else if (tag === 'p' || tag === 'li') {
        const t = (child.textContent || '').trim();
        if (t) textBuf.push(t);
        child.querySelectorAll('img').forEach((im) => pushImg(im));
      }
      else if (['ul', 'ol', 'div', 'section', 'article', 'header', 'footer', 'body'].includes(tag)) walk(child);
      else { const t = (child.textContent || '').trim(); if (t) textBuf.push(t); }
    }
  };
  walk(doc.body);
  flush();
  return blocks;
}

async function ingestDocx(
  buf: ArrayBuffer,
  manualId: string,
  title: string,
  onProgress?: (p: IngestProgress) => void,
): Promise<{ manualId: string; chunks: number }> {
  const mammoth = (await import('mammoth/mammoth.browser')).default;
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
  const blocks = htmlToBlocks(html);
  if (blocks.length === 0) throw new Error('No readable content found in this document.');

  const total = blocks.length;
  await post({ action: 'start', manualId, title, total, unit: 'section' });

  let chunks = 0;
  for (let i = 0; i < total; i++) {
    const b = blocks[i];
    const page = i + 1;
    if (b.kind === 'image') {
      onProgress?.({ page, total, ocr: true, unit: 'section' });
      let image: string | undefined;
      try { image = await downscaleImage(b.dataUrl); } catch { image = undefined; }
      if (!image) continue; // unreadable format (e.g. EMF/WMF) — skip this image
      const r = await post({ action: 'ingest', manualId, title, page, text: b.caption, image, unit: 'section' });
      chunks += r?.chunksAdded || 0;
    } else {
      onProgress?.({ page, total, ocr: false, unit: 'section' });
      const r = await post({ action: 'ingest', manualId, title, page, text: b.text, unit: 'section' });
      chunks += r?.chunksAdded || 0;
    }
  }

  await post({ action: 'finalize', manualId, chunks });
  return { manualId, chunks };
}

async function post(body: unknown): Promise<{ chunksAdded?: number } & Record<string, unknown>> {
  const res = await fetch(API, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  handleAuthFailure(res);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* ignore */ }
    throw new Error(`Ingest failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}
