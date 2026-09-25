#!/bin/sh
set -eu

cd "$(dirname "$0")"
node dist/cli/prestart.js
export HOSTNAME="${HOST-0.0.0.0}"
# Next drains HTTP and after() work before the application shutdown hook.
exec node --import ./dist/cli/logging.js --import ./dist/cli/shutdown.js server.js
