#!/usr/bin/env bash
set -euo pipefail
API="${DOCKCHECK_API:-http://127.0.0.1:8787/api}"
curl -sS -X POST "$API/heartbeat"
echo
