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
│   └── api/            # FastAPI
└── console/            # React, three panes
```

## Tracks

1. Data & API — `contracts/`, `backend/store/`, `backend/api/`
2. Core logic — `backend/match/` (`python3 test_matcher.py`)
3. Visualizer — `console/` (`npm run dev`, uses fixture until API is up)
4. Glue & AI — `backend/ingest/`, `backend/investigate/`

## Run

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/python backend/match/test_matcher.py
PYTHONPATH=backend backend/.venv/bin/python backend/ingest/run.py --once
PYTHONPATH=backend backend/.venv/bin/python -m uvicorn api.main:app --port 8787
cd console && npm install && npm run dev
```

Whisper and Qwen are not in this tree. They are `:8001` and `:8000` on the GB10. `backend/ingest/transcribe_wav.py` writes voice JSON into the inbox. `backend/investigate/` calls `OPENAI_BASE_URL` (local vLLM only).
