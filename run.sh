#!/usr/bin/env bash
# Build and run Bitwise.
#
#   ./run.sh            # dev server with hot reload (default)
#   ./run.sh prod       # production build, then serve it
#   PORT=4000 ./run.sh  # choose the port (default 3000)
#
# Both modes rebuild the sandbox runtime first (npm's pre* hooks do this too,
# but we call it explicitly so a bare `next dev/start` can never serve a stale
# public/sandbox-runtime.js).
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3000}"
MODE="${1:-dev}"

# Dependencies must be present before either mode can build.
if [ ! -d node_modules ]; then
  echo "▸ installing dependencies (node_modules missing)…"
  npm install
fi

echo "▸ building the sandbox runtime…"
npm run build:sandbox

case "$MODE" in
  dev)
    echo "▸ dev server on http://localhost:$PORT"
    exec npx next dev -p "$PORT"
    ;;
  prod|start|production)
    echo "▸ production build…"
    npx next build
    echo "▸ serving production build on http://localhost:$PORT"
    exec npx next start -p "$PORT"
    ;;
  *)
    echo "unknown mode: $MODE (use 'dev' or 'prod')" >&2
    exit 2
    ;;
esac
