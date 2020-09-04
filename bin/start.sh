#!/usr/bin/env bash
set -eo pipefail

[ -e /tmp/.X99-lock ] && rm /tmp/.X99-lock

# -e /dev/stdout

export ELECTRON_DISABLE_SECURITY_WARNINGS=1

xvfb-run --server-args="-screen 0 ${WINDOW_WIDTH}x${WINDOW_HEIGHT}x24" ./electron --no-sandbox --disable-gpu src/server.js
