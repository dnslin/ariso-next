#!/bin/sh
set -eu

cd "$(dirname "$0")"
node dist/cli/prestart.js
export HOSTNAME="${HOST-0.0.0.0}"
exec node --import ./dist/cli/logging.js server.js
