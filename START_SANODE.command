#!/bin/zsh
set -e
cd "$(dirname "$0")"
export PATH="/Users/dakshghelani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export npm_config_store_dir="/Users/dakshghelani/Library/pnpm/store/v11"

echo "Starting Sanode Operations..."
if command -v docker >/dev/null 2>&1; then
  docker compose up -d
  pnpm db:deploy
  pnpm --filter api prisma:seed
else
  echo "Docker Desktop is not installed or not running."
  echo "The dashboard will open in preview mode; install Docker to enable login and live inventory."
fi

open "http://localhost:3000"
pnpm dev
