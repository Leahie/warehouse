# 3-minute demo (no second typed prompt)

Goal: 1 short-ship caught (40 vs 50 romaine). Heartbeat keeps working after you walk away.

## Speak this

**0:00 — Setup (already running on this box)**
Mongo `:27017`. DockCheck API `:8787`. Console `:5173`. Local Qwen `:8000` / proxy `:8080`. Whisper `:8001`. OpenClaw skill curls `http://127.0.0.1:8787/api` only.

**0:20 — Receive**
Mongo already has PO-4419 (50 romaine) and BOL-8821 (50). The worker looks at the packing slip: 40 cases. They say: "receiving 40 cases of romaine, lot R2298, from Fresh Farms."
Matcher compares on-file PO + BOL against the packing slip, not a fourth invented number. Console shows on-file 50/50 and dock 40/50 pending clarification.

**0:50 — Confirm, then leave**
Worker: "yeah that's right, only 40 on the pallet, not 50."
API `POST /clarifications/CLQ-RCV-4419-ROM/answer` with `confirm_discrepancy`. Dock row turns red. Alert `ALT-RCV-4419-ROM` appears. Strawberries packing slip matches PO-4420 / BOL-8822 (20/20) so that line stays committed.

**1:20 — Walk away**
Do not type a second prompt. OpenClaw heartbeat `GET /work` then `POST /heartbeat` every few minutes. Stale unanswered clarifications become alerts. Shift log compiles item/qty vectors.

**2:00 — Show the buyer**
Console polls `GET /alerts` (red), `GET /orders` (object + quantity), `GET /events` (log stream). Search pane can ask "where did the romaine count go wrong?" — Qwen reads Mongo through the API, not ChatGPT.

**2:40 — Close**
Lot codes and supplier prices never left this GB10. The clerk is OpenClaw. The filing cabinet is local Mongo. The brain is local Qwen.

## Live rehearsal (no OpenClaw required)

```bash
export DOCKCHECK_API=http://127.0.0.1:8787/api
curl -sS "$DOCKCHECK_API/orders"
curl -sS "$DOCKCHECK_API/alerts"
curl -sS -X POST "$DOCKCHECK_API/heartbeat"
curl -sS "$DOCKCHECK_API/work"
```
