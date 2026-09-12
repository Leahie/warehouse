# Page 3 — Database Visualizer

> Filterable table of receiving orders. Modeled after Evallos-style database visualizers: dense, column-first, search-in-place.

Whiteboard + user spec: columns with **double-click → filter popover**.

---

## Goal

Let supervisors **find a specific receipt** by date, item, supplier/lot, or status without leaving the table.

---

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ WareInHouse                                           [☰]   │
├─────────────────────────────────────────────────────────────┤
│ Database Visualizer                                         │
│ Active filters: [Date: 2026-09-11 ×] [Status: flagged ×]    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Date │ Time fin. │ Item │ Qty │ Quality │ Supplier/Lot │ Status │
│ ├──────┼───────────┼──────┼─────┼─────────┼──────────────┼────────┤
│ │ …    │ …         │ …    │ …   │ …       │ …            │ …      │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- Table fills the content width  
- Sticky header row  
- Horizontal scroll allowed on narrow viewports  
- Row zebra optional via `--core-surface-ii`  

---

## Columns

| Column | UI key | Source fields | Notes |
|--------|--------|---------------|-------|
| Date | `date` | `time_process_finished` (date part) | Local calendar date |
| Time Process Finished | `time_process_finished` | `time_process_finished` | Time portion or full timestamp |
| Item | `item` | `item` | e.g. romaine |
| Quantity | `quantity` | `quantity_received` (show `received / expected` optional) | Prefer received; display both if space |
| Quality | `quality` | `quality` | May be null in backend today |
| Supplier name / lot code | `supplier_lot` | `supplier`, `lot_code` | Combined cell: `Fresh Farms · R2298` |
| Status | `status` | `status` (+ `flagged_by` for subtitle) | Chip: pending / committed / flagged |

Status display labels:

| Backend | Chip |
|---------|------|
| `pending_clarification` | Pending clarification (yellow) |
| `committed` | Committed (green) |
| `flagged` | Flagged by heartbeat / worker / etc. (red) — prefer `flagged_by` wording when `heartbeat` |

---

## Column search / filter (double-click)

**Interaction:** Double-click a column header → open a **popover modal** anchored to that column (`rounded-large`, `bg-core-surface`).

| Column | Filter UI |
|--------|-----------|
| Date | Date picker or specific-date list (“Orders on specific dates”) |
| Time Process Finished | Time range within day, or “before / after” |
| Item | Text contains / exact match |
| Quantity | Equals / min–max |
| Quality | Text contains or enum select if enum exists |
| Supplier / lot | Text contains (matches either field) |
| Status | Multi-select checkboxes for the three primary statuses |

### Popover actions

- Apply  
- Clear column filter  
- Esc / click-outside closes without apply (or with apply — **propose: Esc discards draft**)

### Active filters bar

Chips above the table; each chip removable. Clearing all restores full fixture/API set.

**AND** logic across columns (narrows rows).

---

## Row presentation

- Default white row  
- `flagged` → light red wash (`#F8E8E8`) — matches DockCheck “red paint” idea without making Main Alerts obsolete  
- Click row (**optional v1.1**): detail drawer with match strip / documents — not required for first design sign-off  

---

## Behavior

| Event | Behavior |
|-------|----------|
| Load | `fixtures/orders.json` → later `GET /api/orders` |
| Double-click header | Open filter popover for that column |
| Apply filters | Client-side filter for fixture phase |
| Empty | “No rows match these filters.” |

---

## Gestalt

- **Similarity**: status chips reuse Logs colors  
- **Common region**: table is one panel; popover is a temporary region  
- **Proximity**: supplier + lot in one cell (whiteboard / user request)  
- **Focal point**: filter popover when open; otherwise status chips on flagged rows  

---

## View-model

```ts
type OrderRowVM = {
  order_id: string;
  date: string;                   // YYYY-MM-DD
  time_process_finished: string;  // ISO or HH:mm
  item: string;
  quantity_received: number;
  quantity_expected: number;
  quality: string | null;
  supplier: string;
  lot_code: string;
  status: "pending_clarification" | "committed" | "flagged" | "pending_match";
  flagged_by?: string | null;
};

type ColumnFilter =
  | { column: "date"; dates: string[] }
  | { column: "time_process_finished"; from?: string; to?: string }
  | { column: "item"; query: string }
  | { column: "quantity"; min?: number; max?: number; equals?: number }
  | { column: "quality"; query: string }
  | { column: "supplier_lot"; query: string }
  | { column: "status"; statuses: OrderRowVM["status"][] };
```

---

## Acceptance criteria (design)

- [ ] All seven columns present  
- [ ] Double-click filter popovers per column  
- [ ] Combined supplier/lot cell  
- [ ] Status color chips  
- [ ] Evallos-like dense but readable table rhythm  

---

## Open questions

1. Show `order_id` as an 8th column or only on row expand? (**Proposal: omit from main grid; show in tooltip**)  
2. Quality enum values?  
3. Should supervisor **Flag** action appear here (exists in `console/` + API) or stay out of WareInHouse v1?
