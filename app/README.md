# Bitwise M0 — the vertical slice

Proves the core loop end to end: **type a concept → the engine authors a React
lesson against the SDK → transpile → mount in an isolated sandbox → self-repair
on error.** Correctness/quality are deferred to M1 (see `../roadmap.md`).

## Run

```bash
npm install
cp .env.example .env.local   # optional — add ANTHROPIC_API_KEY for live generation
npm run dev                  # builds the sandbox bundle, then starts Next
```

Open http://localhost:3000. Without an API key, `/api/generate` serves a
built-in mock lesson so you can still exercise the sandbox and telemetry.

## How it fits together

```
app/page.tsx ──POST /api/generate──▶ Claude (Opus 4.8)         [orchestrator]
     │  postMessage {render, code}
     ▼
public/sandbox.html  (iframe: sandbox="allow-scripts", CSP connect-src 'none')
     │  loads
     ▼
public/sandbox-runtime.js  ← esbuild bundle of sandbox/runtime.tsx + sandbox/sdk.tsx
     │  Babel transpiles the lesson, mounts it against the SDK in an error boundary
     ▼
postMessage {mounted | error | telemetry} ──▶ page.tsx  (self-repair loop, max 3)
```

- **`sandbox/sdk.tsx`** — runtime implementation of the SDK core tier (contract in `../sdk/`).
- **`sandbox/runtime.tsx`** — in-frame transpile + mount + error reporting.
- **`app/api/generate/`** — the authoring prompt and the model call (mock fallback).
- **`scripts/build-sandbox.mjs`** — bundles the sandbox and copies KaTeX assets.

## Known M0 limits (by design)

- Single-shot generation; the multi-stage pipeline + CAS verify + critic land in M1.
- Self-repair covers compile/runtime errors only — answers aren't independently re-checked yet.
- Learner is hard-coded (none); no persistence; core SDK tier only.
- Same-origin sandbox with `allow-scripts` (opaque origin) — production wants a separate origin.
