#!/usr/bin/env bash
set -euo pipefail
API="${DOCKCHECK_API:-http://127.0.0.1:8787/api}"
export UTTERANCE="${1:?usage: voice-event.sh <utterance> [worker_id]}"
export WORKER="${2:-W-17}"
curl -sS -X POST "$API/voice-events" \
  -H 'Content-Type: application/json' \
  -d "$(python3 - <<'PY'
import json, os
print(json.dumps({
    "utterance": os.environ["UTTERANCE"],
    "worker_id": os.environ["WORKER"],
}))
PY
)"
echo
