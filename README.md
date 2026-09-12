# DockCheck

On-prem receiving clerk. Backend writes Mongo. Frontend paints it. Coupling is `contracts/api.json`.

## Split

- `contracts/` — shared. Change only with the team.
- `backend/` — ingest, matcher, store, heartbeat, investigate, FastAPI.
- `console/` — one app, three panes: voice, database+red alerts, forensic search.
- `data/` — fixtures.

Frontend never imports pymongo. Matcher never imports FastAPI. Search never upserts orders. Alerts are a red CSS class on the database pane.

See `contracts/split.json` and `contracts/pipeline.json`.
