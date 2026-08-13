# Tech Assistant (EQNOC-AI)

AI assistant for EQNOC network operations (NOC) and field telecommunications crews — chat-first triage, test-result interpretation, equipment & standards reference, safety guidance, and field/shift reporting. Installable PWA, light + dark.

AI calls are routed through **OpenRouter** via serverless functions so the API key never reaches the browser. Access is gated by a server-side password: the login screen calls `/api/login`, which verifies the password and returns a short-lived signed token that the app sends on every AI request. The `/api/ai` proxy rejects any request without a valid token, fixes the model server-side, and clamps output size — so a leaked page can't be used to spend your OpenRouter credits.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Your OpenRouter API key (server-side only) |
| `APP_PASSWORD` | Yes | Shared login password, verified server-side |
| `OPENROUTER_MODEL` | No | Text model for ordinary chat. Defaults to `x-ai/grok-4.6` (500k context; ~$2/M in, $6/M out). |
| `OPENROUTER_VISION_MODEL` | No | Model used for turns that include an image, and for all ingestion OCR (scanned PDF pages, docx screenshots, reference images). Defaults to `x-ai/grok-4.6` — the same model as chat, so one model handles everything. Set this to a cheaper vision model (e.g. `anthropic/claude-haiku-4.5`) if you'd rather split them. |
| `AUTH_SECRET` | No | HMAC secret for signing auth tokens; falls back to `APP_PASSWORD`. Set a long random value in production. |

See `.env.example` for a template.

## Run locally

Prerequisites: Node.js 20+

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and set `OPENROUTER_API_KEY` and `APP_PASSWORD`
3. Start the API server: `npm run dev:api`
4. In another terminal, start the app: `npm run dev`
5. Open http://localhost:3000 and log in with `APP_PASSWORD`

## Deploy (Vercel)

1. Import the GitHub repo into Vercel (framework preset: Vite — auto-detected).
2. Add `OPENROUTER_API_KEY`, `APP_PASSWORD` (and optionally `OPENROUTER_MODEL`, `AUTH_SECRET`) in Project → Settings → Environment Variables.
3. Deploy. The `api/` directory is picked up automatically as serverless functions.

## Notes

- The former Gemini Live voice mode was removed in the OpenRouter migration.
- All app state (sessions, notes, shift data, reminders) lives in browser localStorage.
