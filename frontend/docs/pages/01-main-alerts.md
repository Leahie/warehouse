# Page 1 — Main (Alerts)

> Landing screen. Chronological feed of receiving alerts for the **last 7 days**.

Whiteboards: main page layout + alert card anatomy.

---

## Goal

Let a supervisor see **what went wrong recently** without opening the database: reason first, AI context second, identifiers last.

---

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ WareInHouse                                           [☰]   │
├─────────────────────────────────────────────────────────────┤
│ Alerts                                    (!) 3             │
│                                           last 7 days       │
│ ┌─────────────────────────────────────────────────────┐  ▲  │
│ │ Alert reason                              2:14 PM   │  │  │
│ │ AI summary of what mismatched and why…              │  ║  │
│ │                          R2298 · Fresh Farms        │  │  │
│ └─────────────────────────────────────────────────────┘  │  │
│ ┌─────────────────────────────────────────────────────┐  │  │
│ │ …                                                   │  ▼  │
│ └─────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Regions

| Region | Spec |
|--------|------|
| Header | Shared `AppHeader` |
| Title | “Alerts” (`text-h1-default`) left |
| Badge | Under header, top-right: circular `!` + integer count of alerts with `created_at` within **rolling 7 days** |
| Feed | Vertical list, **most recent first** |
| Scroll | Native overflow on the feed column (right-edge scrollbar as in whiteboard) |

---

## Alert card anatomy

| Zone | Content | Style |
|------|---------|-------|
| Top-left | **Alert reason** (primary) | `text-h3-default text-primary` |
| Top-right | **Time of alert** | `text-body3-default text-tertiary` |
| Middle | **AI summary** | `text-body1-default text-secondary` |
| Bottom-right | **Lot code · Supplier name** | `text-body3-default text-tertiary` |

Card chrome: `bg-core-surface`, `rounded-default`, light shadow, `p-3x`.  
Optional left accent bar in `--status-flagged` for critical severity.

### Example reasons (from domain)

- `BoL ≠ packing slip`  
- `Short-ship confirmed: 40 vs 50`  
- `Heartbeat stale — no voice confirm`

---

## Behavior

| Interaction | Behavior |
|-------------|----------|
| Load | Read `fixtures/alerts.json` (later `GET /api/alerts`) |
| Filter window | Fixed **1 week** for v1 (whiteboard “[ period? 1wk? ]” → decided: 1 week) |
| Sort | `created_at` descending |
| Empty state | Centered secondary text: “No alerts in the last 7 days.” |
| Click card | **TBD** — propose navigate to Database Visualizer filtered by `order_id` |
| Badge count | Count of alerts in window; updates when fixture/API data changes |

---

## Gestalt

- **Common region**: one card = one alert  
- **Proximity**: metadata clustered bottom-right; time with the header row  
- **Focal point**: reason is the largest text; badge is the page-level focal accent  
- **Continuity**: scroll implies timeline downward into the past  

---

## View-model (UI)

```ts
type AlertCardVM = {
  alert_id: string;
  order_id: string;
  reason: string;          // main text
  ai_summary: string;      // frontend display field (fixture / investigate later)
  created_at: string;      // ISO; format for display as time or “Mon 2:14 PM”
  lot_code: string;
  supplier: string;
  severity: "critical" | "warning" | "info";
};
```

Backend `alerts` collection is lean (`reason`, `order_id`, …). Fixture **joins** order fields (`lot_code`, `supplier`) and adds `ai_summary` for the demo so the UI matches the whiteboard without waiting on investigate.

---

## Acceptance criteria (design)

- [ ] Header wordmark + menu only (no logo)  
- [ ] Badge shows weekly count with `!`  
- [ ] Cards match four-zone layout  
- [ ] Feed scrolls; newest on top  
- [ ] Green/brown theme tokens only  

---

## Open questions

1. Click-through from alert → Database or Voice?  
2. Show date on older cards (“Tue”) vs time-only for today?  
3. Should acknowledged alerts drop out of the feed?
