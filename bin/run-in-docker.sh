#!/usr/bin/env bash
set -eo pipefail

docker build -t electron-render-services .
docker run --rm -it --shm-size="768m" -e RENDERER_ACCESS_KEY=secret -p 12345:3000 electron-render-services $@
