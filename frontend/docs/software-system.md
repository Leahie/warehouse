# WareInHouse Frontend – Software System Guide

> **Scope (future)**: `front end/src/*`  
> **Hard rule**: Never modify `backend/`, `contracts/`, `data/`, or `console/` from this track.

This document defines the canonical architecture for the WareInHouse frontend **when implementation is approved**. Until then, only `docs/` and `fixtures/` exist.

---

## 1. Isolation from backend work

| Area | Ownership |
|------|-----------|
| `backend/` | Backend track only |
| `console/` | Existing DockCheck three-pane prototype — leave alone |
| `front end/` | WareInHouse UI track (this design + future app) |
| `contracts/` | Shared read-only reference for field names |

v1 UI ships against **fixtures**. Later, swap data adapters to `http://127.0.0.1:8787/api` without changing Mongo or matcher logic. Frontend never `$set`s status; flagging (if exposed later) must go through `POST /orders/:id/flag`.

---

## 2. Code placement cheatsheet

| Want to define… | Put it in | File naming |
|-----------------|-----------|-------------|
| Global enum / literal map | `constants/<domain>/…` | `statuses.ts`, `routes.ts` |
| Reusable TS interface | `types/<domain>/…` | `alert.ts`, `order.ts` |
| Shared React hook | `hooks/<domain>/useThing.ts` | `useAlerts.ts` |
| Pure UI building block | `components/<domain>/Thing.tsx` | `AlertCard.tsx` |
| Page logic bound to route | `routes/<segment>/Page.tsx` | `MainAlertsPage.tsx` |
| Static asset | `assets/img/<domain>/…` | (logo deferred) |
| Design token / global style | `styles/…` | `colors.css` |
| Fake data | `fixtures/…` | `alerts.json` |

---

## 3. Naming & path conventions

* Folders: **snake_case**  
* React/TS files: **CamelCase**  
* Hooks: prefix `use…`  
* Tests: `*.test.tsx` co-located  

---

## 4. Proposed route map

| Route | Page | Menu |
|-------|------|------|
| `/` | Main Alerts | — (home) |
| `/logs` | Logs | Dropdown |
| `/database` | Database Visualizer | Dropdown |
| `/voice` | Voice Visualizer | Dropdown |

Shared chrome: `AppHeader` on every route.

---

## 5. Data layer (design intent)

```
fixtures/*.json  →  adapters/*  →  hooks  →  pages
                         ↑ later
                   GET /api/alerts, /api/orders, /api/events
```

Adapters normalize backend field names to UI view-models (e.g. `pending_clarification` → display label + yellow token).

---

## 6. Status vocabulary (UI ↔ backend)

| UI label | Backend `status` | Color |
|----------|------------------|-------|
| Pending clarification | `pending_clarification` | Yellow |
| Committed | `committed` | Green |
| Flagged by heartbeat | `flagged` (often `flagged_by: "heartbeat"`) | Red |

Also tolerate `pending_match` in fixtures as a fourth state if needed (muted grey) — not drawn on Logs stacked bars unless product confirms.

---

## 7. Stack recommendation (for later approval)

| Choice | Recommendation | Rationale |
|--------|----------------|-----------|
| Bundler | Vite | Matches existing `console/` familiarity |
| UI | React + TypeScript | Same |
| Routing | React Router | Four pages |
| Charts | Recharts or Chart.js | Stacked bars + tooltips |
| Styling | CSS variables + utility classes (Evallos pattern) | Token discipline |

No implementation until design sign-off.

---

© 2026 WareInHouse / DockCheck frontend track
