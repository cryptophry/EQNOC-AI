// Strip anything a client must not be allowed to send to the model.
// System prompts are injected server-side; tools are server-owned.

import { TOOL_NAMES } from './chatTools.js';

const ALLOWED_ROLES = new Set(['user', 'assistant', 'tool']);
const DATA_IMAGE = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/i;
const MAX_TEXT = 32_000;
const MAX_IMAGES = 4;

function clipText(s) {
  return String(s ?? '').slice(0, MAX_TEXT);
}

function sanitizeImageUrl(url) {
  if (typeof url !== 'string') return null;
  if (!DATA_IMAGE.test(url)) return null;
  if (url.length > 2_500_000) return null; // ~1.8MB binary after base64
  return url;
}

function sanitizeUserContent(content) {
  if (typeof content === 'string') return clipText(content);
  if (!Array.isArray(content)) return '';
  const out = [];
  let images = 0;
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'text' && part.text) {
      out.push({ type: 'text', text: clipText(part.text) });
    } else if (part.type === 'image_url' && images < MAX_IMAGES) {
      const url = sanitizeImageUrl(part.image_url?.url);
      if (url) {
        out.push({ type: 'image_url', image_url: { url } });
        images++;
      }
    }
  }
  return out.length ? out : '';
}

function sanitizeToolCalls(raw) {
  if (!Array.isArray(raw)) return undefined;
  const out = [];
  for (const tc of raw) {
    const name = tc?.function?.name;
    if (!TOOL_NAMES.has(name)) continue;
    out.push({
      id: String(tc.id || `call_${out.length}`).slice(0, 80),
      type: 'function',
      function: {
        name,
        arguments: clipText(tc.function?.arguments || '{}'),
      },
    });
  }
  return out.length ? out : undefined;
}

export function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw) {
    if (!m || !ALLOWED_ROLES.has(m.role)) continue;
    if (m.role === 'user') {
      const content = sanitizeUserContent(m.content);
      if (content === '' || (Array.isArray(content) && content.length === 0)) continue;
      out.push({ role: 'user', content });
    } else if (m.role === 'assistant') {
      const msg = { role: 'assistant', content: m.content == null ? null : clipText(m.content) };
      const toolCalls = sanitizeToolCalls(m.tool_calls);
      if (toolCalls) msg.tool_calls = toolCalls;
      out.push(msg);
    } else if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: String(m.tool_call_id || m.name || 'tool').slice(0, 80),
        content: clipText(m.content),
      });
    }
  }
  return out;
}
