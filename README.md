# NOC Assistant (EQNOC-AI)

AI-powered network triage assistant for EQNOC L2/L3 services with a Jarvis-style interface.

AI calls are routed through **OpenRouter** via a serverless proxy (`api/ai.js`) so the API key never reaches the browser. The model is configurable via an environment variable.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Your OpenRouter API key (server-side only) |
| `OPENROUTER_MODEL` | No | Model slug, defaults to `anthropic/claude-sonnet-4.5` |

## Run locally

Prerequisites: Node.js 20+

1. Install dependencies: `npm install`
2. Create `.env.local` with `OPENROUTER_API_KEY=sk-or-...`
3. Start the API proxy: `npm run dev:api`
4. In another terminal, start the app: `npm run dev`
5. Open http://localhost:3000

## Deploy (Vercel)

1. Import the GitHub repo into Vercel (framework preset: Vite — auto-detected).
2. Add `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`) in Project → Settings → Environment Variables.
3. Deploy. The `api/` directory is picked up automatically as serverless functions.

## Notes

- The former Gemini Live voice mode was removed in the OpenRouter migration.
- All app state (sessions, notes, shift data, reminders) lives in browser localStorage.
