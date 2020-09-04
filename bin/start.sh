#!/usr/bin/env bash
set -eo pipefail

[ -e /tmp/.X99-lock ] && rm /tmp/.X99-lock

# -e /dev/stdout

export ELECTRON_DISABLE_SECURITY_WARNINGS=1

xvfb-run -a --server-args="-screen 0 ${WINDOW_WIDTH}x${WINDOW_HEIGHT}x24 -ac +extension GLX +render -noreset" \
  ./electron --js-flags="--max-old-space-size=500" --no-sandbox --disable-gpu src/server.js
