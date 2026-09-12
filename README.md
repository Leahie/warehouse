# DockCheck

Strict separation by who may write. Runtime (Whisper, Qwen, NemoClaw) stays in `/home/dell/dellxnvidia_hackathon`. This repo is the product.

```
dockcheck-repo/
├── contracts/
├── data/inbox/
├── backend/
│   ├── store/          # only pymongo
│   ├── match/          # pure function
│   ├── ingest/         # inbox → match → store
│   ├── heartbeat/      # stale flags + shift_logs
│   ├── investigate/    # HTTP to inference.local, then store
│   └── api/            # FastAPI :8787
├── console/            # React, three panes
└── openclaw/skills/dockcheck/   # curl :8787 only; no Mongo URI
```

## Tracks

1. Data & API — `contracts/`, `backend/store/`, `backend/api/`
2. Core logic — `backend/match/` (`python3 test_matcher.py`)
3. Visualizer — `console/` (`npm run dev`, polls `/api/orders`, `/api/alerts`, `/api/events`)
4. Glue & AI — `backend/ingest/`, `backend/investigate/`

OpenClaw is the employee. It thinks via local Qwen (`OPENAI_BASE_URL=http://127.0.0.1:8080/v1`). It works via `DOCKCHECK_API=http://127.0.0.1:8787/api`.

The GB10 has no microphone. Record on your laptop: SSH-tunnel or Cursor-forward `:5173`, open `http://127.0.0.1:5173`, hit **Record packing slip**. Audio POSTs to `/api/audio`, Whisper on `:8001` transcribes, the matcher compares that to the on-file PO + BOL, and the Voice pane updates.

Office papers (purchase orders and bills of lading) are already in Mongo. At the dock the worker reads the packing slip; the matcher compares that slip to the on-file PO + BOL.

## Run

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/python backend/match/test_matcher.py
PYTHONPATH=backend backend/.venv/bin/python backend/ingest/run.py --once
PYTHONPATH=backend backend/.venv/bin/python -m uvicorn api.main:app --port 8787 --host 127.0.0.1
cd console && npm install && npm run dev
```

Demo script: [DEMO.md](DEMO.md). Skill draft: [openclaw/skills/dockcheck/SKILL.md](openclaw/skills/dockcheck/SKILL.md).

Whisper and Qwen are not in this tree. They are `:8001` and `:8000` on the GB10. `backend/ingest/transcribe_wav.py` writes voice JSON into the inbox. `backend/investigate/` calls `OPENAI_BASE_URL` (local vLLM only).
