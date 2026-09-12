# What DockCheck data looks like (search brief)

Use this when hunting for **real** warehouse / produce / freight documents that we can map into our fake inbox. We do **not** need files that already look like our JSON. We need records that contain the **same fields**, so we can convert them.

Canonical fake samples live in `data/inbox/`. Schema examples live in `contracts/mongodb.json`.

---

## The story we need (one receipt = four sources)

DockCheck is a **three-paper check plus voice**. One inbound SKU is valid only when these agree:

| Source | Who creates it | When | What it claims |
|--------|----------------|------|----------------|
| **Purchase order (PO)** | Buyer / office | Before the truck | What we ordered |
| **Bill of lading (BOL)** | Carrier / shipper | In transit | What was loaded |
| **Packing slip** | Supplier, on the pallet | At the dock | What the worker is looking at |
| **Voice utterance** | Dock receiver | At the dock | Worker reading the slip out loud |

Join key across all three papers: **`po_id`** (purchase order number).

Matcher then compares:

1. PO vs BOL (office papers should already agree)
2. Papers vs packing slip (did the pallet match the order?)
3. Packing slip vs voice (did the worker read the slip correctly?)

Demo we already have:

- **Mismatch:** PO-4419 / BOL-8821 say **50** cases romaine; packing slip + voice say **40** (short-ship).
- **Match:** PO-4420 / BOL-8822 / PACK-3302 / voice all say **20** cases strawberries.

Real data is useful if we can build **pairs like that**: some receipts where qty/item/supplier match, some where they don’t.

---

## Minimum fields a real dataset must have

If a dataset cannot fill these, skip it.

| Field | Why it matters | Typical real-world names |
|-------|----------------|--------------------------|
| **PO number** | Join key | `po_number`, `purchase_order`, `PO No.`, EDI 850 `BEG03` |
| **Supplier / vendor name** | Match + UI | `vendor`, `shipper`, `sold_from` |
| **Item name or SKU** | Line identity | `sku`, `item_code`, `commodity`, `description` |
| **Quantity** | The actual check | `qty`, `qty_ordered`, `pieces`, `cases`, `cartons` |
| **Unit** | cases / pallets / lbs | `uom`, `unit_of_measure` |

Strongly preferred (demo + alerts use these):

| Field | Typical real-world names |
|-------|--------------------------|
| **Lot / batch code** | `lot`, `lot_code`, `batch`, `GTIN` + lot, USDA lot |
| **Second quantity** | `qty_received`, `qty_shipped`, `qty_on_bol` vs `qty_ordered` |
| **Document type** | PO vs BOL vs packing list vs ASN |
| **Document id** | BOL number, packing-slip number, PRO number |
| **Timestamp** | receive date, ship date, `eta` |
| **Unit price** | on PO only; optional |

Nice-to-have, not required:

- Temperature (produce cold chain)
- Quality grade (`good` / `fair` / damaged)
- Worker / dock door / warehouse id
- Weight, pallets, SSCC, GS1-128 barcode

---

## Exact JSON we ingest

Drop converted files here. Filenames should match `doc_id` / `event_id`.

```
data/inbox/
  docs/     PO-*.json and BOL-*.json   (office papers, before the truck)
  slips/    PACK-*.json                (packing slip the worker sees)
  voice/    EVT-*.json                 (spoken receipt)
  workers/  W-*.json                   (one dock person)
```

### Shared line item (PO, BOL, packing slip)

```json
{
  "sku": "ROM-ICE-24",
  "item": "romaine",
  "quantity": 50,
  "unit": "cases",
  "lot_code": null,
  "unit_price_usd": 18.4
}
```

| Field | Type | Rules |
|-------|------|--------|
| `sku` | string | Stock code. Can be invented from a real item code. |
| `item` | string | Short **common name**, lowercase (`romaine`, not a paragraph description). Matcher joins lines by this. |
| `quantity` | number | Integer preferred. This is the field we mismatch. |
| `unit` | string | Prefer `cases`. Also ok: `pallets`, `units`, `lbs`. |
| `lot_code` | string or `null` | Usually **null on PO and BOL**; present on packing slip. |
| `unit_price_usd` | number or `null` | PO only. BOL/slip should be `null`. |

### Purchase order → `data/inbox/docs/PO-4419.json`

```json
{
  "doc_id": "PO-4419",
  "doc_type": "purchase_order",
  "po_id": "PO-4419",
  "supplier": "Fresh Farms",
  "lines": [ { "sku": "ROM-ICE-24", "item": "romaine", "quantity": 50, "unit": "cases", "lot_code": null, "unit_price_usd": 18.4 } ]
}
```

- `doc_id` == `po_id` for POs.
- `doc_type` must be exactly `purchase_order`.

### Bill of lading → `data/inbox/docs/BOL-8821.json`

```json
{
  "doc_id": "BOL-8821",
  "doc_type": "bill_of_lading",
  "po_id": "PO-4419",
  "supplier": "Fresh Farms",
  "lines": [ { "sku": "ROM-ICE-24", "item": "romaine", "quantity": 50, "unit": "cases", "lot_code": null, "unit_price_usd": null } ]
}
```

- `po_id` **must** equal the related PO.
- `doc_type` must be exactly `bill_of_lading`.
- Quantity often matches the PO (office agreement). A PO↔BOL qty fight is an automatic flag.

### Packing slip → `data/inbox/slips/PACK-3301.json`

```json
{
  "doc_id": "PACK-3301",
  "doc_type": "packing_slip",
  "po_id": "PO-4419",
  "supplier": "Fresh Farms",
  "lines": [ { "sku": "ROM-ICE-24", "item": "romaine", "quantity": 40, "unit": "cases", "lot_code": "R2298", "unit_price_usd": null } ]
}
```

- This is **dock truth**: what is on the pallet.
- `lot_code` usually appears here first.
- Short-ship = slip qty **lower** than PO qty (40 vs 50).

### Voice event → `data/inbox/voice/EVT-001.json`

```json
{
  "event_id": "EVT-001",
  "worker_id": "W-17",
  "time_start": "2026-09-12T14:02:11Z",
  "time_end": null,
  "utterance": "receiving 40 cases of romaine, lot R2298, from Fresh Farms",
  "parsed": {
    "intent": "receive",
    "item": "romaine",
    "quantity": 40,
    "unit": "cases",
    "lot_code": "R2298",
    "supplier": "Fresh Farms",
    "temperature": { "value": null, "unit": null },
    "in_reply_to": null
  },
  "parse_confidence": 0.91,
  "order_id": null,
  "ingest_channel": "unspecified"
}
```

Required even if `parsed` is missing: `event_id`, `worker_id`, `time_start`, `utterance`.

`parsed.intent` values:

| intent | Meaning |
|--------|---------|
| `receive` | First count of a pallet |
| `confirm_discrepancy` | Worker agrees the count is short / wrong |
| `correct_entry` | Worker says the first number was a misread |
| `answer_clarification` | Generic reply to an open question |

Utterance pattern the crude parser already understands:

```
receiving {N} cases of {item}, lot {LOT}, from {Supplier}
```

Follow-up example: `"yeah that's right, only 40 on the pallet, not 50"`.

You will almost never find real dock-voice transcripts. Paper + tabular receiving data is enough; we can write utterances from the packing-slip lines.

### Worker → `data/inbox/workers/W-17.json`

```json
{
  "worker_id": "W-17",
  "name": "Maria Chen",
  "role": "receiver",
  "active": true
}
```

Invent this if the dataset has no people.

---

## How a real paper maps into those fields

Real POs / BOLs / packing lists are messy PDFs, EDI, or spreadsheets. Map like this:

| On the paper | Our field |
|--------------|-----------|
| PO # / Purchase Order Number | `po_id`, and `doc_id` if it is a PO |
| BOL # / Bill of Lading / PRO / waybill | `doc_id` on the BOL |
| Packing list # / ASN # / shipment id | `doc_id` on the slip |
| Vendor / ship from / sold by | `supplier` |
| SKU / item # / GTIN / UPC | `lines[].sku` |
| Description (“Romaine Hearts 24ct”) | `lines[].item` → shorten to `romaine` |
| Qty ordered | PO `lines[].quantity` |
| Qty shipped / cartons / pieces | BOL or slip `lines[].quantity` |
| Qty received (WMS) | slip or voice `quantity` |
| UOM (CS, PLT, LB) | `unit` (`CS` → `cases`) |
| Lot / batch / Julian code | `lot_code` |
| Unit price / cost | `unit_price_usd` on PO only |
| Ship date / receive date | later `time_process_*` / `received_at` |

EDI names if you find X12 dumps:

| EDI | Document | Maps to |
|-----|----------|---------|
| **850** | Purchase order | `purchase_order` |
| **211 / 214 / 404** | Freight / BOL-ish | `bill_of_lading` |
| **856** | ASN / packing list | `packing_slip` |
| **861** | Receiving advice | qty received (voice/slip stand-in) |

---

## What to search for

Prioritize **structured tables** over pretty PDF templates.

### Good search phrases

```
warehouse receiving dataset csv quantity ordered quantity received
purchase order packing list bill of lading sample data
three-way match accounts payable dataset
EDI 850 856 dataset
ASN packing slip sku lot quantity
inbound shipment WMS qty_ordered qty_received supplier
produce lot code cases purchase order
USDA AMS shipping point inspection lot
food traceability lot code packing list
short shipment receiving discrepancy
Kaggle warehouse inventory purchase orders
```

### Accept a dataset if it has at least one of these shapes

1. **Receiving table** with `po_number`, `sku`/`item`, `qty_ordered`, `qty_received`, `vendor`  
   → synthesize PO (ordered), slip (received), BOL (copy ordered unless a ship qty exists).

2. **Two or three related docs** for the same PO (PO + invoice, PO + ASN, PO + BOL).

3. **Line-item produce / grocery inbound** with cases + lot/batch + supplier.

4. **EDI 850 + 856** pairs.

### Reject or deprioritize

- Inventory snapshots with on-hand qty only (no PO, no inbound)
- Retail checkout / POS
- Route-optimization lat/long with no line items
- Carrier rate tables
- Documents with descriptions but **no quantities**
- Single-document templates with no second source to match against

### Domain that fits the demo

Produce / cold-chain / grocery DC is ideal (romaine, berries, cases, lots). Industrial parts also work if they have PO + qty + lot/sku (the GB10 bundle uses parts POs).

---

## How much data we actually need

For the matcher and demo, **2–10 complete receipts** beat 100k sparse rows.

Each complete receipt should be:

```
1 PO  +  1 BOL  +  1 packing slip  +  1 receive utterance
```

all sharing the same `po_id`, `supplier`, and `item`.

Aim for a mix:

| Kind | Count | What differs |
|------|-------|----------------|
| Clean commit | ≥1 | All four quantities match |
| Short-ship | ≥1 | Slip/voice qty < PO/BOL qty |
| Optional extra | 0–2 | Missing lot, PO≠BOL, temperature |

Multi-line POs are ok (several SKUs). Matcher currently matches **one item per voice event** (the spoken item, or the first line).

---

## Frontend fixtures (separate from inbox)

If you are filling the WareInHouse UI without running ingest, these are denormalized views — **do not hunt for datasets that look like this**. They are derived.

| File | Shape |
|------|--------|
| `frontend/fixtures/orders.json` | one row per SKU: `order_id`, `date`, `item`, `quantity_received`, `quantity_expected`, `quality`, `supplier`, `lot_code`, `status` |
| `frontend/fixtures/alerts.json` | `reason`, `ai_summary`, `lot_code`, `supplier`, `severity` |
| `frontend/fixtures/logs_aggregates.json` | supplier → day → `{pending_clarification, committed, flagged}` counts |

Statuses: `pending_match` \| `pending_clarification` \| `committed` \| `flagged`.

---

## Conversion checklist

When you find a candidate file, fill this:

- [ ] There is a PO number we can use as `po_id`
- [ ] There is a supplier name
- [ ] There is at least one line with item/SKU + quantity + unit
- [ ] We can produce a **second** quantity (shipped or received) for the same line
- [ ] We can invent or copy a BOL if the set only has PO + received qty
- [ ] Lot code exists **or** we can leave it `null` on papers and set it on the slip
- [ ] We can write one English sentence: `receiving {qty} {unit} of {item}, lot {lot}, from {supplier}`

Then write JSON into `data/inbox/` using the templates above. Ingest does the rest.
