# open -ga XQuartz
# xhost +127.0.0.1
# xhost +localhost
# docker compose up -d
# docker compose run python-sand python sand.py 100 50 
# # xhost -127.0.0.1
# # xhost -localhost

#!/usr/bin/env bash
set -euo pipefail

OS="$(uname -s)"

if [[ "$OS" == "Darwin" ]]; then
  # macOS: use XQuartz
  open -ga XQuartz || true

  # allow local connections (you can tighten this later if you want)
  xhost +127.0.0.1 >/dev/null 2>&1 || true
  xhost +localhost >/dev/null 2>&1 || true

  export DISPLAY="host.docker.internal:0"
else
  # Linux: allow local docker containers to use your X server
  xhost +local:root >/dev/null 2>&1 || true
  export DISPLAY="${DISPLAY:-:0}"
fi

docker compose build
docker compose run --rm maze python maze.py
