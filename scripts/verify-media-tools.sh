#!/usr/bin/env bash
set -euo pipefail

image=${1:?Usage: bash scripts/verify-media-tools.sh IMAGE}
test_image="$image-media-tests"

# External-caller tests need curl; keep it out of the production image.
docker build --tag "$test_image" --file - . <<DOCKERFILE
FROM $image
USER root
RUN apt-get update && apt-get install --yes --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
USER node
DOCKERFILE

docker run --rm --network none --read-only \
  --user "$(id -u):$(id -g)" --tmpfs /tmp:rw,exec,size=512m \
  --mount "type=bind,src=$PWD,dst=/workspace" \
  --workdir /workspace --entrypoint node \
  "$test_image" node_modules/vitest/vitest.mjs run --project media-tools \
  --maxWorkers=50% --reporter=default --reporter=junit \
  --outputFile=test-results/media-process.xml
