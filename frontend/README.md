# WareInHouse Frontend

Vite + React + React Router app for WareInHouse. Design docs live in `docs/`. Backend / `console/` are not modified from this track.

## Stack

- Vite + React 19 + TypeScript
- React Router (route folders under `src/routes/`)
- Tailwind CSS v4 + `src/styles/global.css` design tokens
- Local JSON under `src/assets/data/` (no API yet)

## Run

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # if using local Node install
cd "front end"
npm install
npm run dev
```

## Routes

| Path | Page |
|------|------|
| `/` | Main Alerts |
| `/logs` | Logs charts |
| `/database` | Database Visualizer |
| `/voice` | Voice Visualizer |

## Layout

```
src/
├── assets/data/          # alerts, orders, logs, voice JSON
├── components/           # shared UI (layout, alerts, logs, database, voice)
├── constants/
├── routes/               # one folder per route segment
│   ├── main/
│   ├── logs/
│   ├── database/
│   └── voice/
├── styles/global.css     # Tailwind + WareInHouse tokens
└── types/
```
