# WareInHouse Design System v0.1

> **The complete design system specification for WareInHouse**  
> Modeled on the Evallos Design System structure. Theme direction: **green + brown** (dock / produce / cardboard), not Evallos blue.

This is the **single source of truth** for visual tokens before any UI code is written.

---

## Quick Reference

```html
<!-- Typography -->
<h1 className="text-h1-default">WareInHouse</h1>
<h2 className="text-h2-default">Alerts</h2>
<p className="text-body1-default">Primary content</p>
<p className="text-body2-default">Secondary content</p>
<p className="text-body3-default">Metadata (time, lot, supplier)</p>

<!-- Surfaces -->
<div className="bg-core-root text-primary">Page</div>
<div className="bg-core-surface card">Alert card / panel</div>

<!-- Status (Logs + Database) -->
<span className="status-pending">pending clarification</span>
<span className="status-committed">committed</span>
<span className="status-flagged">flagged by heartbeat</span>
```

---

## Brand & Theme

| Principle | Decision |
|-----------|----------|
| Product name | **WareInHouse** (wordmark only for v1 — **no logo mark yet**) |
| Mood | Calm warehouse floor: paper, kraft, leafy greens |
| Light mode | Default for v1 (dock screens, readability) |
| Dark mode | Token slots reserved; not required for first build |
| Accents | Green for healthy/committed; brown for chrome/nav; red only for alerts & flagged |

### Fonts

Avoid default UI stacks (Inter / Roboto / Arial / system-ui).

| Role | Family | Why |
|------|--------|-----|
| Display / wordmark | **Fraunces** | Soft serif with warehouse warmth; brand-forward in the header |
| UI / body | **Source Sans 3** | Clear at 14–16px for tables, alerts, chat |

Load via `@fontsource` or equivalent when implementing — not Google CDN if offline demos matter.

---

## Colors

### Core Surfaces

| CSS Variable | Utility | Hex | Usage |
|--------------|---------|-----|-------|
| `--core-root` | `bg-core-root` | `#F3F6F2` | Page background (cool sage mist — not cream) |
| `--core-surface` | `bg-core-surface` | `#FFFFFF` | Cards, panels, table rows |
| `--core-surface-ii` | `bg-core-surface-ii` | `#E8EEE6` | Hover / selected / nested panels |
| `--core-border` | `border-core` | `#D5DDD0` | Default borders |
| `--core-border-ii` | `border-core-ii` | `#A8B5A4` | Stronger borders / focus rings |

### Brand Chrome (green + brown)

| CSS Variable | Utility | Hex | Usage |
|--------------|---------|-----|-------|
| `--brand-green` | `bg-brand-green` / `text-brand-green` | `#2F5D4A` | Header bar, primary CTAs, committed emphasis |
| `--brand-green-soft` | `bg-brand-green-soft` | `#DCEADF` | Soft fills, selected nav rows |
| `--brand-brown` | `bg-brand-brown` / `text-brand-brown` | `#6E4B35` | Secondary chrome, menu icon, kraft accents |
| `--brand-brown-soft` | `bg-brand-brown-soft` | `#EFE6DF` | Soft brown fills, chat agent bubbles |

### Text

| CSS Variable | Utility | Hex | Usage |
|--------------|---------|-----|-------|
| `--text-primary` | `text-primary` | `#1C241F` | Titles, alert reason |
| `--text-secondary` | `text-secondary` | `#5A675E` | AI summary, body |
| `--text-tertiary` | `text-tertiary` | `#7E8B82` | Time, lot, supplier metadata |
| `--text-on-brand` | `text-on-brand` | `#F7FAF6` | Text on green header |
| `--text-accent` | `text-accent` | `#2F5D4A` | Links, interactive text (green, not blue) |

### Status (domain-critical)

Aligned with backend `status_enum` / whiteboard:

| Status | Token | Hex | Bar / chip |
|--------|-------|-----|------------|
| Pending clarification | `--status-pending` | `#E6B422` | Yellow |
| Committed | `--status-committed` | `#2F7A4A` | Green |
| Flagged (heartbeat / mismatch) | `--status-flagged` | `#C43C3C` | Red |

| Semantic text | Token | Hex |
|---------------|-------|-----|
| Positive | `--text-positive` | `#2F7A4A` |
| Warning | `--text-warning` | `#C98900` |
| Negative | `--text-negative` | `#C43C3C` |

### Voice conversation states

| State | Surface | Notes |
|-------|---------|-------|
| Parsing (speaking) | grey bubble `#E5E8E4`, ellipsis `...` | User turn in progress |
| Parsed | blue-tint bubble `#D6E6F5` | Temporary parse success (whiteboard: grey → blue) |
| Agent status | brown-soft bubble | Parsing / Confirming / Correction / Logging data |
| Alert log in sidebar | red left border / tint `#F8E8E8` | Conversation produced an alert |

---

## Typography

Same semantic scale as Evallos (sizes/weights), remapped to WareInHouse fonts.

> Body text (medium) is the default. For headings, start with the **Default** variant.

### Weights

| Name | Weight | Use |
|------|--------|-----|
| Heavy | 700 | Focal emphasis |
| Default | 600 | Headers (start here) |
| Subtle | 500 | De-emphasized headers |
| Body Default | 450 / 400* | Body (*Source Sans 3 may map 450 → 400) |
| Body Subtle | 400 | Metadata |

### Scale

| Class | Size | Weight | Line height | Usage |
|-------|------|--------|-------------|-------|
| `text-h1-default` | 28px | 600 | 32px | Page titles (“Alerts”, “Logs”) |
| `text-h2-default` | 24px | 600 | 28px | Section headers |
| `text-h3-default` | 20px | 600 | 24px | Alert reason (card title) |
| `text-h4-default` | 18px | 600 | 24px | Modal / filter titles |
| `text-h5-default` | 16px | 600 | 24px | Column headers |
| `text-body1-default` | 16px | 400 | 24px | AI summary, chat body |
| `text-body2-default` | 14px | 400 | 20px | Secondary / table cells |
| `text-body3-default` | 12px | 400 | 16px | Time, lot, supplier |
| `text-wordmark` | 22px | 600 | 28px | Header “WareInHouse” (Fraunces) |

---

## Spacing (8pt scale)

Identical philosophy to Evallos:

| Token | rem | px | Typical use |
|-------|-----|----|-------------| 
| `half` | 0.25 | 4 | Icon gaps |
| `1x` | 0.5 | 8 | Tight stacks |
| `2x` | 1 | 16 | Card internal padding (compact) |
| `3x` | 1.5 | 24 | Card padding (default) |
| `4x` | 2 | 32 | Page gutters |
| `5x` | 2.5 | 40 | Section gaps |
| `6x` | 3 | 48 | Large section gaps |
| `8x` | 4 | 64 | Rare |

### Patterns

- **Alert cards**: `p-3x`, vertical stack `gap-2x` between cards  
- **Header bar**: height 56–64px, horizontal `px-4x`  
- **Page content**: `px-4x py-3x` under header  

---

## Border Radius

Whiteboard uses soft rounded alert boxes. Keep friendly but not pill-heavy.

| Class | Value | Usage |
|-------|-------|-------|
| `rounded-small` | 4px | Inputs, buttons, column filter chips |
| `rounded-default` | 10px | Alert cards, chat bubbles, graph container |
| `rounded-large` | 14px | Modals (column filter popovers) |
| `rounded-full` | 999px | Alert count badge only |

---

## Elevation & Motion

| Token | Value | Use |
|-------|-------|-----|
| Shadow card | `0 1px 2px rgba(28,36,31,0.06), 0 4px 12px rgba(28,36,31,0.04)` | Alert cards, dropdown |
| Motion short | 150–200ms ease-out | Dropdown open, bubble color change |
| Motion medium | 250–300ms | Sidebar log insert, new chat |

Intentional motions for v1 (min 2–3):

1. Menu dropdown fade/slide  
2. Alert card enter (subtle translate-y)  
3. Voice bubble grey → blue on parse  

---

## Gestalt application (product-wide)

| Principle | Where it shows up |
|-----------|-------------------|
| **Proximity** | Time sits with alert reason (same card corner group); lot + supplier grouped bottom-right |
| **Common region** | Each alert is one rounded card; each chat turn is one bubble |
| **Similarity** | All alert cards share layout; all status colors mean the same everywhere |
| **Continuity** | Alerts scroll newest → oldest; voice statuses flow Parsing → Confirming → Correction → Logging |
| **Figure–ground** | Green header as figure; sage page as ground; white cards elevate content |
| **Focal point** | Alert reason is largest text; `! N` badge draws the eye under the header |

---

## Component tokens (planned)

| Component | Spec |
|-----------|------|
| `AppHeader` | Full-width green bar; wordmark left; hamburger right; no logo |
| `MenuDropdown` | Logs · Database Visualizer · Voice Demo |
| `AlertBadge` | `!` + count of alerts in last 7 days |
| `AlertCard` | Reason / AI summary / time / lot+supplier |
| `FilterableTable` | DB visualizer with per-column double-click filters |
| `LogsChart` | Stacked bars + hover ratios + `+` add manufacturer |
| `VoiceThread` | Conversation UI + left sidebar history |

---

## File structure (when implementing)

```
front end/
├── docs/                 # this design system
├── fixtures/             # fake JSON
└── src/                  # NOT YET — wait for design sign-off
    ├── styles/
    │   ├── colors.css
    │   ├── typography.css
    │   ├── spacing.css
    │   ├── radius.css
    │   └── utilities.css
    ├── components/
    ├── routes/
    ├── hooks/
    ├── types/
    └── constants/
```

---

## Out of scope for design system v0.1

- Logo / box icon (whiteboard has a placeholder — **do not ship**)
- Dark mode polish  
- Marketing landing page  

**Version**: 0.1 — Design only  
**Status**: Awaiting confirmation before code  
**Last updated**: 2026-09-12
