# Pages Overview

WareInHouse is a **four-screen** product. The whiteboard’s hamburger lists three destinations; the **Main Alerts** screen is the landing page.

| # | Page | Route | Primary job |
|---|------|-------|-------------|
| 1 | [Main — Alerts](01-main-alerts.md) | `/` | Scan this week’s receiving alerts |
| 2 | [Logs](02-logs.md) | `/logs` | Compare manufacturer quantities over time |
| 3 | [Database Visualizer](03-database-visualizer.md) | `/database` | Searchable tabular view of order rows |
| 4 | [Voice Visualizer](04-voice-visualizer.md) | `/voice` | Conversation-style voice → parse → confirm → log |

## Shared chrome

```
┌──────────────────────────────────────────────────────────┐
│  WareInHouse                              [☰]            │  ← brand green bar
└──────────────────────────────────────────────────────────┘
         dropdown: Logs · Database Visualizer · Voice Demo
```

- Wordmark only — **no logo** in v1  
- Menu icon top-right opens dropdown  
- Active route can be indicated lightly in the dropdown (brown-soft highlight)

## Information architecture (Gestalt)

- **Figure–ground**: green header vs sage page  
- **Similarity**: same header on all pages  
- **Continuity**: menu order matches whiteboard (Logs → DB → Voice)  
- **Focal point**: each page has one primary artifact (alert feed / chart / table / chat)

## Fixture files

| Page | Fixture |
|------|---------|
| Main | [`../../fixtures/alerts.json`](../../fixtures/alerts.json) |
| Logs | [`../../fixtures/logs_aggregates.json`](../../fixtures/logs_aggregates.json) |
| Database | [`../../fixtures/orders.json`](../../fixtures/orders.json) |
| Voice | [`../../fixtures/voice_sessions.json`](../../fixtures/voice_sessions.json) |

## Open questions (need your confirmation)

See each page doc; summary:

1. Is the product name casing **WareInHouse** everywhere (vs “WARE IN HOUSE”)?  
2. Should Main alerts be **view-only**, or link into Database / Voice?  
3. Logs: how does the user **name companies** (typeahead from suppliers vs free text)?  
4. Database: is **Quality** free text or an enum?  
5. Voice: fully **demo-scripted** for hackathon, or live mic later?
