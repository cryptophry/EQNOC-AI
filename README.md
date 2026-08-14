# Tech Assistant (EQNOC-AI)

AI assistant for EQNOC network operations (NOC) and field telecommunications crews — chat-first triage, test-result interpretation, equipment & standards reference, safety guidance, and field/shift reporting. Installable PWA, light + dark.

AI calls are routed through **OpenRouter** via serverless functions so the API key never reaches the browser. Access is gated by a server-side password: the login screen calls `/api/login`, which verifies the password and sets a short-lived **HttpOnly** session cookie. `/api/ai` rejects any request without a valid session, ignores client-supplied models/tools/system prompts, and always clamps output size.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key (server-side only) |
| `APP_PASSWORD` | Yes | Shared login password, verified server-side |
| `AUTH_SECRET` | Yes in production | HMAC secret for signing session cookies. Generate with `openssl rand -hex 32`. Locally falls back to `APP_PASSWORD` if unset. |
| `OPENROUTER_MODEL` | No | Text model for ordinary chat. Defaults to `x-ai/grok-4.6`. |
| `OPENROUTER_VISION_MODEL` | No | Model used when a turn includes an image, and for ingestion OCR. Defaults to `x-ai/grok-4.6`. Set a cheaper vision model (e.g. `anthropic/claude-haiku-4.5`) to split spend. |
| `UPSTASH_VECTOR_REST_URL` | No | Upstash Vector REST URL. Required for manuals, guides, and reference-image RAG. Without it those features return 503 and chat still works. |
| `UPSTASH_VECTOR_REST_TOKEN` | No | Upstash Vector REST token (pair with the URL). |

See `.env.example` for a template.

## Run locally

Prerequisites: Node.js 20+

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and set `OPENROUTER_API_KEY`, `APP_PASSWORD`, and (recommended) `AUTH_SECRET`
3. Start the API server: `npm run dev:api`
4. In another terminal, start the app: `npm run dev`
5. Open http://localhost:3000 and log in with `APP_PASSWORD`

## Deploy (Vercel)

1. Import the GitHub repo into Vercel (framework preset: Vite — auto-detected).
2. Add `OPENROUTER_API_KEY`, `APP_PASSWORD`, and `AUTH_SECRET` (and optionally the model + Upstash vars) in Project → Settings → Environment Variables.
3. Deploy. The `api/` directory is picked up automatically as serverless functions.

After this deploy, everyone will need to sign in again (session cookies replaced the previous localStorage token).

## Notes

- The former Gemini Live voice mode was removed in the OpenRouter migration.
- Chat history, notes, and reminders live in browser localStorage. The session cookie is HttpOnly and is not readable by page scripts.
- Sign out is in the top bar. Sessions expire after 14 days of inactivity, and cannot be renewed past 90 days from first issue.
