# Page 2 — Logs

> Manufacturer quantity charts with stacked status colors. Blank until the user sets a time range and mode.

Whiteboard: Logs multi/single manufacturer views, `+` add company, hover ratios, yellow/green/red segments.

---

## Goal

Answer: **Whose receiving volume looks healthy vs flagged over a chosen window?**

---

## Initial state

On entry the chart area is **empty** (axes drawn, no bars). Controls sit below / bottom-right per whiteboard:

```
Time range: [ YYYY-MM-DD ] – [ YYYY-MM-DD ]    ( Multiple | Single )
```

- End date optional  
- Mode toggle: **Multiple** vs **Single** (mutually exclusive)  
- Chart title: “Logs”  
- Y-axis: `# Quantity`  
- X-axis: depends on mode  

---

## Shared status encoding

Stacked bar segments (similarity across modes):

| Segment | Color token | Backend status |
|---------|-------------|----------------|
| Pending clarification | `--status-pending` `#E6B422` | `pending_clarification` |
| Committed | `--status-committed` `#2F7A4A` | `committed` |
| Flagged by heartbeat | `--status-flagged` `#C43C3C` | `flagged` |

### Hover tooltip

Show **exact counts and percentages** of each segment for that bar:

```
Fresh Farms · Sep 10–12
Committed     120  (60%)
Pending         40  (20%)
Flagged         40  (20%)
Total          200
```

---

## Mode A — Multiple manufacturers

### Controls after choosing Multiple

1. Time range (start required; end optional)  
2. Manufacturer name inputs — start with **two** slots (A and B), matching whiteboard  
3. Chart renders when names resolve against fixture/API  

### Time range rules

| Input | Behavior |
|-------|----------|
| Start only | Aggregate **that single day** per manufacturer |
| Start + end | Aggregate **total quantity combined** over the inclusive range per manufacturer |

### Chart

- X-axis: **Manufacturer name**  
- One stacked bar per selected manufacturer  
- **`+` control** to the right of the last bar — adds manufacturer C, D, … (same range)  
- No per-day split in this mode  

### Add manufacturer (`+`)

- Opens a small name field / typeahead  
- New bar animates in  
- Same color semantics and hover behavior  

---

## Mode B — Single manufacturer

### Controls

1. Time range  
2. **One** manufacturer name  
3. **No `+` control** (cannot compare companies)

### Time range rules

| Input | Behavior |
|-------|----------|
| Start only (one day) | **One** stacked bar for that day |
| Start + end (>1 day) | **One stacked bar per calendar day** in the range |

- X-axis: **time / dates**  
- Y-axis: `# Quantity`  
- Stack + hover identical to Multiple  

---

## Layout wire

```
┌─────────────────────────────────────────────────────────────┐
│ WareInHouse                                           [☰]   │
├─────────────────────────────────────────────────────────────┤
│ Logs                                                        │
│                                                             │
│  # Quantity                                                 │
│  │     █                                                    │
│  │     █ █                                                  │
│  │     █ █      [+]                                         │
│  └────────────────────                                      │
│    A   B                                                    │
│                                                             │
│              Time range [____] – [____]  (Multiple|Single)  │
└─────────────────────────────────────────────────────────────┘
```

---

## Empty / error states

| State | Copy |
|-------|------|
| No query yet | “Set a time range and choose Multiple or Single to load logs.” |
| Unknown manufacturer | “No orders found for {name} in this range.” |
| Invalid range (end < start) | Inline validation on the inputs |

---

## Gestalt

- **Similarity**: color always means the same status  
- **Proximity**: controls grouped bottom-right as one control cluster  
- **Focal point**: bars; tooltip on hover is temporary figure  
- **Common region**: chart sits in one large rounded panel  

---

## View-model

```ts
type StatusBreakdown = {
  pending_clarification: number;
  committed: number;
  flagged: number;
};

type LogsBar = {
  key: string;              // manufacturer name or ISO date
  label: string;
  quantities: StatusBreakdown;
};

type LogsQuery = {
  mode: "multiple" | "single";
  start: string;            // YYYY-MM-DD
  end: string | null;
  manufacturers: string[];  // length 1 for single; 2+ for multiple
};
```

Fixture: `fixtures/logs_aggregates.json` pre-aggregates demo bars so charts work offline.

---

## Acceptance criteria (design)

- [ ] Blank chart until query  
- [ ] Multiple vs Single rules as above  
- [ ] Stacked Y/G/R + hover ratios  
- [ ] `+` only in Multiple  
- [ ] Single mode expands to per-day bars when range > 1 day  

---

## Open questions

1. Manufacturer matching: exact supplier string, or fuzzy?  
2. Is quantity `quantity_received` or `quantity_expected`? (**Proposal: received**)  
3. Max manufacturers in Multiple (propose **6** for readability)?
