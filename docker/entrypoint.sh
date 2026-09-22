#!/bin/sh
set -eu

cd "$(dirname "$0")"
node dist/cli/prestart.js
export HOSTNAME="${HOST-0.0.0.0}"
# Application shutdown awaits the media queue before closing SQLite.
export NEXT_MANUAL_SIG_HANDLE=1
exec node --import ./dist/cli/logging.js server.js
