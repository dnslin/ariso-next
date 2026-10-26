#!/usr/bin/env bash
set -euo pipefail

context_dir=$(mktemp -d)
trap 'rm -rf "$context_dir" .env.context-check .data/context-check src/.env.context-check src/context-check.sqlite src/context-check.key' EXIT
mkdir -p .data
touch .env.context-check .data/context-check src/.env.context-check src/context-check.sqlite src/context-check.key
docker build --file - --output "type=local,dest=$context_dir" . <<'DOCKERFILE'
FROM scratch
COPY . /
DOCKERFILE
for path in .env.context-check .data src/.env.context-check src/context-check.sqlite src/context-check.key .git .github docs node_modules .next dist tests/integration integrations/browser-extension/entrypoints integrations/browser-extension/node_modules integrations/picgo/lib; do
  test ! -e "$context_dir/$path"
done
for path in package.json pnpm-lock.yaml pnpm-workspace.yaml integrations/browser-extension/package.json integrations/picgo/package.json src/app/page.tsx drizzle/meta/_journal.json scripts/package-standalone.mjs scripts/build-metadata.mjs scripts/standalone-trace.mjs scripts/verify-image.mjs docker/entrypoint.sh tests/fixtures/runtime/images/sample.jpg tests/fixtures/runtime/images/sample.png; do
  test -s "$context_dir/$path"
done
