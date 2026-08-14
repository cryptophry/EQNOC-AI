// Shared OpenRouter vision calls (OCR / photo describe) with retries.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_MODEL = () => process.env.OPENROUTER_VISION_MODEL || 'x-ai/grok-4.6';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callVision(content) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const payload = JSON.stringify({
    model: VISION_MODEL(),
    messages: [{ role: 'user', content }],
  });
  let lastErr = 'Vision error';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(600 * attempt);
    let res;
    try {
      res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: payload,
      });
    } catch (e) {
      lastErr = e.message;
      continue;
    }
    if (res.ok) {
      const j = await res.json();
      return j.choices?.[0]?.message?.content || '';
    }
    lastErr = `Vision ${res.status}`;
    if (res.status !== 429 && res.status < 500) break;
  }
  throw new Error(lastErr);
}

export function ocrImage(dataUrl) {
  return callVision([
    { type: 'text', text: 'This is a page or embedded screenshot from an equipment manual or a team guide. Transcribe ALL visible text and tables accurately as clean plain text (keep tables readable, one row per line). If the image is a screenshot, diagram or photo rather than a page of text, ALSO add a short line describing what it shows (e.g. which screen/menu/dialog, or what a diagram depicts). Output only the transcription and that description.' },
    { type: 'image_url', image_url: { url: dataUrl } },
  ]);
}

export function describeImage(dataUrl, note) {
  const hint = note ? `\n\nThe technician's note about this photo: "${note}". Use it for context.` : '';
  return callVision([
    { type: 'text', text: 'This is a reference image saved by a telecom technician — it may be a photo (e.g. a nameplate, fault display or label), a wiring/circuit diagram, or a hand sketch. Do two things in plain text:\n1) TRANSCRIPTION: transcribe ALL visible text exactly — nameplate/rating-plate data, model and part numbers, serial numbers, meter/display readings, labels, warnings, connector/port/pin markings, and any callouts or annotations on a diagram.\n2) DESCRIPTION: briefly and factually describe what the image shows. For a photo: equipment type, make/model if identifiable, visible condition, indicator/LED states. For a diagram or sketch: what it depicts (e.g. alarm circuit wiring), and each labelled component and how things connect (from/to, terminal/pin numbers, wire colours).\nDo not speculate beyond what is visible. Output only the transcription and description.' + hint },
    { type: 'image_url', image_url: { url: dataUrl } },
  ]);
}
