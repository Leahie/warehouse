# WareInHouse Text Styling System

## Overview

Consistent text styling across all WareInHouse pages. Uses **three text colors** plus one accent, combined with semantic typography classes from [`design-system.md`](design-system.md).

Adapted from the Evallos Home Page Text Styling System.

## Color System

### Text colors (only three for content)

| Class | Usage | Token |
|-------|-------|-------|
| `text-primary` | Headings, alert reason, table primary cells | `--text-primary` |
| `text-secondary` | AI summaries, descriptions, chat body | `--text-secondary` |
| `text-tertiary` | Timestamps, lot codes, supplier names, helper copy | `--text-tertiary` |

### Special cases

| Class | Usage |
|-------|-------|
| `text-accent` | Interactive links, “Apply filter”, menu item hover |
| `text-on-brand` | Header wordmark and icons on green bar |
| `text-negative` | Alert badge count emphasis, flagged sidebar items, error states |
| `text-warning` | Pending clarification labels |
| `text-positive` | Committed labels |

Do **not** invent one-off text colors per page.

## Typography system

| Class | Size | Weight | Usage |
|-------|------|--------|-------|
| `text-wordmark` | 22px | 600 | Header product name |
| `text-h1-default` | 28px | 600 | Page titles |
| `text-h2-default` | 24px | 600 | Section headers |
| `text-h3-default` | 20px | 600 | Alert reason, chat titles |
| `text-h4-default` | 18px | 600 | Modal titles |
| `text-h5-default` | 16px | 600 | Column headers |
| `text-body1-default` | 16px | 400 | Primary body / AI summary |
| `text-body1-heavy` | 16px | 700 | Emphasized body |
| `text-body2-default` | 14px | 400 | Table cells, chat meta |
| `text-body3-default` | 12px | 400 | Time, lot, supplier |

Start with **Default** variants. Use **Heavy** only for true emphasis.

---

## Page-specific guidelines

### App header

```tsx
<span className="text-wordmark text-on-brand">WareInHouse</span>
```

### Main — Alerts

```tsx
<h1 className="text-h1-default text-primary">Alerts</h1>

{/* Badge */}
<span className="text-body2-heavy text-negative">! {count}</span>
<span className="text-body3-default text-tertiary">last 7 days</span>

{/* Card */}
<h3 className="text-h3-default text-primary">{alertReason}</h3>
<p className="text-body1-default text-secondary">{aiSummary}</p>
<span className="text-body3-default text-tertiary">{time}</span>
<span className="text-body3-default text-tertiary">{lotCode} · {supplier}</span>
```

### Database Visualizer

```tsx
<h1 className="text-h1-default text-primary">Database Visualizer</h1>
<th className="text-h5-default text-primary">Date</th>
<td className="text-body2-default text-primary">{value}</td>
<span className="text-body3-default text-tertiary">Double-click column to filter</span>
```

### Logs

```tsx
<h1 className="text-h1-default text-primary">Logs</h1>
<label className="text-body2-default text-secondary">Time range</label>
<button className="text-body2-heavy text-primary">Multiple</button>
<span className="text-body3-default text-tertiary"># Quantity</span>
```

### Voice Visualizer

```tsx
{/* Agent status chip */}
<span className="text-body2-heavy text-primary">Confirming…</span>

{/* User bubble while speaking */}
<p className="text-body1-default text-tertiary">…</p>

{/* User bubble after parse */}
<p className="text-body1-default text-primary">{parsedText}</p>

{/* Final summary */}
<p className="text-body1-default text-secondary">{summary}</p>

{/* Sidebar item */}
<span className="text-body2-default text-primary">{shortSummary}</span>
```

---

## Best practices

1. Prefer semantic classes over arbitrary Tailwind sizes (`text-[13px]` forbidden in design).  
2. Metadata is always `text-body3` + `text-tertiary`.  
3. One accent color for interaction — brand green, not Evallos blue.  
4. Status colors only on status chips / bar segments / alert sidebar rows.  
5. Never put alert reason and timestamp at the same visual weight.

## Benefits

- Matches Evallos maintainability (token-driven)  
- Keeps green/brown brand consistent across four screens  
- Accessible contrast on sage backgrounds when primary text is `#1C241F`
