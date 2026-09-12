"""Build one week of produce receiving CSVs. seed=42."""

from __future__ import annotations

import csv
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from store.ids import order_id_for

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "seed" / "csv"

DAYS = [
    datetime(2026, 9, 7, tzinfo=timezone.utc),
    datetime(2026, 9, 8, tzinfo=timezone.utc),
    datetime(2026, 9, 9, tzinfo=timezone.utc),
    datetime(2026, 9, 10, tzinfo=timezone.utc),
    datetime(2026, 9, 11, tzinfo=timezone.utc),
    datetime(2026, 9, 12, tzinfo=timezone.utc),
]
DAY_WEIGHTS = [1.4, 1.3, 1.2, 1.0, 0.9, 0.6]

ITEMS = [
    ("romaine", "ROM-ICE-24", 18.4),
    ("strawberries", "STR-CLAM-12", 22.1),
    ("spinach", "SPI-BCH-24", 16.5),
    ("kale", "KAL-BCH-12", 14.2),
    ("avocado", "AVO-CS-48", 31.0),
    ("tomatoes", "TOM-VINE-25", 19.8),
    ("iceberg", "ICE-HD-24", 15.1),
    ("blueberries", "BLU-FLAT-12", 28.4),
    ("broccoli", "BRO-CRN-20", 17.6),
    ("carrots", "CAR-BAG-50", 12.0),
    ("celery", "CEL-BCH-30", 13.4),
    ("cucumbers", "CUC-CTN-24", 14.8),
    ("peppers", "PEP-BLST-20", 21.2),
    ("onions", "ONI-SK-50", 11.5),
    ("potatoes", "POT-RUS-50", 10.8),
    ("corn", "CRN-EAR-48", 16.0),
    ("lettuce", "LET-BIB-12", 15.7),
    ("cabbage", "CAB-GRN-20", 12.9),
    ("zucchini", "ZUC-CS-20", 14.1),
    ("squash", "SQU-YLW-20", 13.8),
    ("mushrooms", "MSH-CTN-10", 24.5),
    ("asparagus", "ASP-BCH-11", 29.0),
    ("green beans", "GBN-CTN-20", 18.2),
    ("cauliflower", "CAU-HD-12", 17.0),
    ("radish", "RAD-BCH-24", 11.9),
    ("beets", "BET-BCH-20", 13.2),
    ("herbs", "HRB-MIX-12", 26.0),
    ("lemons", "LMN-CTN-40", 20.4),
    ("limes", "LIM-CTN-40", 19.1),
    ("oranges", "ORG-CTN-40", 18.0),
]

SUPPLIER_STEMS = [
    "Fresh Farms",
    "Berry Grove Co",
    "GreenLeaf Produce",
    "CoolChain Farms",
    "Valley Mist",
    "Pacific Pack",
    "High Desert Growers",
    "Coastal Crisp",
    "Sunridge Organics",
    "North Fork Cold",
    "Red River Produce",
    "Sierra Packing",
    "Blue Mesa Farms",
    "Harbor Greens",
    "Prairie Lot",
]


def _zipf(n: int, s: float = 0.9) -> list[float]:
    raw = [1.0 / ((i + 1) ** s) for i in range(n)]
    total = sum(raw)
    return [x / total for x in raw]


def _pick(rng: random.Random, items: list, weights: list[float]):
    return rng.choices(items, weights=weights, k=1)[0]


def _suppliers() -> list[str]:
    names = list(SUPPLIER_STEMS)
    i = 1
    while len(names) < 100:
        names.append(f"{SUPPLIER_STEMS[i % len(SUPPLIER_STEMS)]} {i // len(SUPPLIER_STEMS) + 2}")
        i += 1
    names[0] = "Fresh Farms"
    names[1] = "Berry Grove Co"
    names[2] = "GreenLeaf Produce"
    names[3] = "CoolChain Farms"
    return names[:100]


def _write(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _morning(rng: random.Random, day: datetime) -> datetime:
    # 07:00–15:30 UTC = 03:00–11:30 America/New_York
    minute = rng.randint(7 * 60, 15 * 60 + 30)
    return day + timedelta(minutes=minute, seconds=rng.randint(0, 59))


def build(seed: int = 42) -> Path:
    rng = random.Random(seed)
    suppliers = _suppliers()
    sup_w = _zipf(len(suppliers))
    item_w = _zipf(len(ITEMS), s=0.7)
    day_w = [w / sum(DAY_WEIGHTS) for w in DAY_WEIGHTS]

    supplier_rows = [
        {"supplier_id": f"S-{i+1:03d}", "supplier": name}
        for i, name in enumerate(suppliers)
    ]
    item_rows = [
        {
            "sku": sku,
            "item": item,
            "unit": "cases",
            "unit_price_usd": price,
        }
        for item, sku, price in ITEMS
    ]

    po_headers: list[dict] = []
    po_lines: list[dict] = []
    bols: list[dict] = []
    slips: list[dict] = []
    voices: list[dict] = []
    evt = 100

    def add_line(
        *,
        po_id: str,
        bol_id: str,
        slip_id: str,
        supplier: str,
        item: str,
        sku: str,
        price: float,
        qty_po: int,
        qty_slip: int,
        lot: str,
        outcome: str,
        when: datetime,
        worker: str,
        hero: bool = False,
        voice_at: datetime | None = None,
        confirm_at: datetime | None = None,
        qty_bol: int | None = None,
        bol_item: str | None = None,
    ) -> None:
        nonlocal evt
        po_lines.append({
            "po_id": po_id,
            "sku": sku,
            "item": item,
            "quantity": qty_po,
            "unit": "cases",
            "lot_code": "",
            "unit_price_usd": price,
        })
        bols.append({
            "doc_id": bol_id,
            "po_id": po_id,
            "supplier": supplier,
            "sku": sku,
            "item": bol_item or item,
            "quantity": qty_po if qty_bol is None else qty_bol,
            "unit": "cases",
            "received_at": when.isoformat(),
        })
        slips.append({
            "doc_id": slip_id,
            "po_id": po_id,
            "supplier": supplier,
            "sku": sku,
            "item": item,
            "quantity": qty_slip,
            "unit": "cases",
            "lot_code": lot,
            "received_at": (when + timedelta(minutes=8)).isoformat(),
        })
        if outcome == "pending_match":
            return
        receive_id = "EVT-001" if hero else f"EVT-S{evt:04d}"
        evt += 1
        t_voice = voice_at or (when + timedelta(minutes=12))
        utterance = (
            f"receiving {qty_slip} cases of {item}, lot {lot}, from {supplier}"
            if lot
            else f"receiving {qty_slip} cases of {item} from {supplier}, slip has no lot code"
        )
        voices.append({
            "event_id": receive_id,
            "po_id": po_id,
            "worker_id": worker,
            "time_start": t_voice.isoformat(),
            "intent": "receive",
            "item": item,
            "quantity": qty_slip,
            "unit": "cases",
            "lot_code": lot,
            "supplier": supplier,
            "in_reply_to": "",
            "utterance": utterance,
        })
        if outcome in {"flagged", "flagged_over"}:
            confirm_id = "EVT-002" if hero else f"EVT-S{evt:04d}"
            evt += 1
            order_id = order_id_for(po_id, item)
            t_confirm = confirm_at or (t_voice + timedelta(minutes=3))
            if outcome == "flagged_over":
                confirm_line = f"yeah that's right, {qty_slip} on the pallet, PO only called for {qty_po}"
            else:
                confirm_line = f"yeah that's right, only {qty_slip} on the pallet, not {qty_po}"
            voices.append({
                "event_id": confirm_id,
                "po_id": po_id,
                "worker_id": worker,
                "time_start": t_confirm.isoformat(),
                "intent": "confirm_discrepancy",
                "item": item,
                "quantity": qty_slip,
                "unit": "cases",
                "lot_code": lot,
                "supplier": supplier,
                "in_reply_to": f"CLQ-{order_id}",
                "utterance": confirm_line,
            })

    # Hero short-ship first so it is never dropped.
    hero_papers = datetime(2026, 9, 12, 13, 50, 0, tzinfo=timezone.utc)
    hero_voice = datetime(2026, 9, 12, 14, 2, 11, tzinfo=timezone.utc)
    hero_confirm = datetime(2026, 9, 12, 14, 4, 40, tzinfo=timezone.utc)
    po_headers.append({
        "po_id": "PO-4419",
        "supplier": "Fresh Farms",
        "created_at": hero_papers.isoformat(),
        "worker_id": "W-17",
        "outcome": "flagged",
    })
    add_line(
        po_id="PO-4419",
        bol_id="BOL-8821",
        slip_id="PACK-3301",
        supplier="Fresh Farms",
        item="romaine",
        sku="ROM-ICE-24",
        price=18.4,
        qty_po=50,
        qty_slip=40,
        lot="R2298",
        outcome="flagged",
        when=hero_papers,
        worker="W-17",
        hero=True,
        voice_at=hero_voice,
        confirm_at=hero_confirm,
    )

    ui_demos = [
        {
            "po_id": "PO-4421", "bol_id": "BOL-4421", "slip_id": "PACK-4421",
            "supplier": "Berry Grove Co", "item": "strawberries", "sku": "STR-CLAM-12",
            "price": 22.1, "qty_po": 24, "qty_slip": 20, "lot": "S4410",
            "outcome": "flagged_heartbeat",
            "when": datetime(2026, 9, 11, 17, 50, 0, tzinfo=timezone.utc),
            "worker": "W-18",
        },
        {
            "po_id": "PO-4420", "bol_id": "BOL-4420", "slip_id": "PACK-4420",
            "supplier": "GreenLeaf Produce", "item": "spinach", "sku": "SPI-BCH-24",
            "price": 16.5, "qty_po": 30, "qty_slip": 30, "lot": "P1188",
            "outcome": "committed",
            "when": datetime(2026, 9, 11, 15, 18, 0, tzinfo=timezone.utc),
            "worker": "W-17",
        },
        {
            "po_id": "PO-4418", "bol_id": "BOL-4418", "slip_id": "PACK-4418",
            "supplier": "Fresh Farms", "item": "kale", "sku": "KAL-BCH-12",
            "price": 14.2, "qty_po": 12, "qty_slip": 12, "lot": "K3302",
            "outcome": "committed",
            "when": datetime(2026, 9, 10, 19, 58, 0, tzinfo=timezone.utc),
            "worker": "W-17",
        },
        {
            "po_id": "PO-4415", "bol_id": "BOL-4415", "slip_id": "PACK-4415",
            "supplier": "Berry Grove Co", "item": "avocado", "sku": "AVO-CS-48",
            "price": 31.0, "qty_po": 100, "qty_slip": 100, "lot": "A8801",
            "outcome": "committed",
            "when": datetime(2026, 9, 10, 11, 48, 0, tzinfo=timezone.utc),
            "worker": "W-19",
        },
        {
            "po_id": "PO-4412", "bol_id": "BOL-4412", "slip_id": "PACK-4412",
            "supplier": "CoolChain Farms", "item": "tomatoes", "sku": "TOM-VINE-25",
            "price": 19.8, "qty_po": 60, "qty_slip": 48, "lot": "T5510",
            "outcome": "office_flag", "qty_bol": 48,
            "when": datetime(2026, 9, 9, 17, 30, 0, tzinfo=timezone.utc),
            "worker": "W-18",
        },
        {
            "po_id": "PO-4410", "bol_id": "BOL-4410", "slip_id": "PACK-4410",
            "supplier": "GreenLeaf Produce", "item": "spinach", "sku": "SPI-BCH-24",
            "price": 16.5, "qty_po": 18, "qty_slip": 18, "lot": "P1170",
            "outcome": "committed",
            "when": datetime(2026, 9, 8, 9, 28, 0, tzinfo=timezone.utc),
            "worker": "W-17",
        },
        {
            "po_id": "PO-4408", "bol_id": "BOL-4408", "slip_id": "PACK-4408",
            "supplier": "Fresh Farms", "item": "romaine", "sku": "ROM-ICE-24",
            "price": 18.4, "qty_po": 50, "qty_slip": 50, "lot": "R2201",
            "outcome": "committed",
            "when": datetime(2026, 9, 8, 11, 3, 0, tzinfo=timezone.utc),
            "worker": "W-19",
        },
        {
            "po_id": "PO-4402", "bol_id": "BOL-4402", "slip_id": "PACK-4402",
            "supplier": "Fresh Farms", "item": "avocado", "sku": "AVO-CS-48",
            "price": 31.0, "qty_po": 40, "qty_slip": 40, "lot": "",
            "outcome": "flagged_lot",
            "when": datetime(2026, 9, 8, 15, 53, 0, tzinfo=timezone.utc),
            "worker": "W-18",
        },
        {
            "po_id": "PO-4399", "bol_id": "BOL-4399", "slip_id": "PACK-4399",
            "supplier": "CoolChain Farms", "item": "mixed greens", "sku": "MIX-GRN-12",
            "price": 21.0, "qty_po": 20, "qty_slip": 20, "lot": "M7701",
            "outcome": "info_temp",
            "when": datetime(2026, 9, 5, 10, 43, 0, tzinfo=timezone.utc),
            "worker": "W-17",
        },
        {
            "po_id": "PO-4406", "bol_id": "BOL-4406", "slip_id": "PACK-4406",
            "supplier": "Valley Mist", "item": "blueberries", "sku": "BLU-FLAT-12",
            "price": 28.4, "qty_po": 24, "qty_slip": 30, "lot": "B4406",
            "outcome": "flagged_over",
            "when": datetime(2026, 9, 12, 10, 22, 0, tzinfo=timezone.utc),
            "worker": "W-19",
        },
        {
            "po_id": "PO-4404", "bol_id": "BOL-4404", "slip_id": "PACK-4404",
            "supplier": "Pacific Pack", "item": "tomatoes", "sku": "TOM-VINE-25",
            "price": 19.8, "qty_po": 40, "qty_slip": 40, "lot": "T4404",
            "outcome": "quality_damage",
            "when": datetime(2026, 9, 11, 12, 5, 0, tzinfo=timezone.utc),
            "worker": "W-18",
        },
        {
            "po_id": "PO-4403", "bol_id": "BOL-4403", "slip_id": "PACK-4403",
            "supplier": "Harbor Greens", "item": "kale", "sku": "KAL-BCH-12",
            "price": 14.2, "qty_po": 16, "qty_slip": 16, "lot": "K4403",
            "outcome": "info_late",
            "when": datetime(2026, 9, 10, 8, 12, 0, tzinfo=timezone.utc),
            "worker": "W-17",
        },
        {
            "po_id": "PO-4398", "bol_id": "BOL-4398", "slip_id": "PACK-4398",
            "supplier": "Sierra Packing", "item": "romaine", "sku": "ROM-ICE-24",
            "price": 18.4, "qty_po": 30, "qty_slip": 30, "lot": "R4398",
            "outcome": "flagged_item", "bol_item": "iceberg",
            "when": datetime(2026, 9, 9, 13, 40, 0, tzinfo=timezone.utc),
            "worker": "W-19",
        },
    ]
    for demo in ui_demos:
        po_headers.append({
            "po_id": demo["po_id"],
            "supplier": demo["supplier"],
            "created_at": demo["when"].isoformat(),
            "worker_id": demo["worker"],
            "outcome": demo["outcome"],
        })
        add_line(
            po_id=demo["po_id"],
            bol_id=demo["bol_id"],
            slip_id=demo["slip_id"],
            supplier=demo["supplier"],
            item=demo["item"],
            sku=demo["sku"],
            price=demo["price"],
            qty_po=demo["qty_po"],
            qty_slip=demo["qty_slip"],
            lot=demo["lot"],
            outcome=demo["outcome"],
            when=demo["when"],
            worker=demo["worker"],
            qty_bol=demo.get("qty_bol"),
            bol_item=demo.get("bol_item"),
        )

    n_other = 600 - len(po_headers)
    seq = 5001
    n_flagged = round(0.045 * n_other)
    n_flagged_over = round(0.02 * n_other)
    n_office_flag = round(0.025 * n_other)
    n_flagged_heartbeat = round(0.02 * n_other)
    n_flagged_lot = round(0.015 * n_other)
    n_flagged_item = round(0.015 * n_other)
    n_quality = round(0.015 * n_other)
    n_info_late = round(0.025 * n_other)
    n_info_temp = round(0.02 * n_other)
    n_pending_clq = round(0.05 * n_other)
    n_pending_match = round(0.02 * n_other)
    n_committed = n_other - (
        n_flagged
        + n_flagged_over
        + n_office_flag
        + n_flagged_heartbeat
        + n_flagged_lot
        + n_flagged_item
        + n_quality
        + n_info_late
        + n_info_temp
        + n_pending_clq
        + n_pending_match
    )
    outcomes = (
        ["committed"] * n_committed
        + ["flagged"] * n_flagged
        + ["flagged_over"] * n_flagged_over
        + ["office_flag"] * n_office_flag
        + ["flagged_heartbeat"] * n_flagged_heartbeat
        + ["flagged_lot"] * n_flagged_lot
        + ["flagged_item"] * n_flagged_item
        + ["quality_damage"] * n_quality
        + ["info_late"] * n_info_late
        + ["info_temp"] * n_info_temp
        + ["pending_clarification"] * n_pending_clq
        + ["pending_match"] * n_pending_match
    )
    rng.shuffle(outcomes)

    for i, outcome in enumerate(outcomes):
        po_id = f"PO-{seq}"
        bol_id = f"BOL-{seq}"
        slip_id = f"PACK-{seq}"
        seq += 1
        day = _pick(rng, DAYS, day_w)
        when = _morning(rng, day)
        supplier = _pick(rng, suppliers, sup_w)
        worker = rng.choice(["W-17", "W-18", "W-19"])
        n_lines = 2 if rng.random() < 0.15 else 1
        po_headers.append({
            "po_id": po_id,
            "supplier": supplier,
            "created_at": when.isoformat(),
            "worker_id": worker,
            "outcome": outcome,
        })
        used_items: set[str] = set()
        for _ in range(n_lines):
            item = sku = price = None
            for _attempt in range(12):
                item, sku, price = _pick(rng, ITEMS, item_w)
                if item not in used_items:
                    break
            if item in used_items:
                continue
            used_items.add(item)
            qty_po = rng.choice([12, 16, 20, 24, 30, 40, 48, 50, 60])
            qty_bol = None
            bol_item = None
            if outcome in {"flagged", "pending_clarification", "flagged_heartbeat"}:
                qty_slip = max(1, qty_po - rng.choice([4, 6, 8, 10]))
            elif outcome == "flagged_over":
                qty_slip = qty_po + rng.choice([4, 6, 8])
            elif outcome == "office_flag":
                qty_bol = max(1, qty_po - rng.choice([4, 6, 8]))
                qty_slip = qty_bol
            elif outcome == "flagged_item":
                qty_slip = qty_po
                other_items = [row[0] for row in ITEMS if row[0] != item]
                bol_item = rng.choice(other_items)
            else:
                qty_slip = qty_po
            lot = (
                ""
                if outcome == "flagged_lot"
                else f"{item.strip().upper()[:1]}{po_id.replace('PO-', '')}-{rng.randint(10, 99)}"
            )
            add_line(
                po_id=po_id,
                bol_id=bol_id,
                slip_id=slip_id,
                supplier=supplier,
                item=item,
                sku=sku,
                price=price,
                qty_po=qty_po,
                qty_slip=qty_slip,
                lot=lot,
                outcome=outcome,
                when=when,
                worker=worker,
                qty_bol=qty_bol,
                bol_item=bol_item,
            )

    _write(OUT / "suppliers.csv", ["supplier_id", "supplier"], supplier_rows)
    _write(OUT / "items.csv", ["sku", "item", "unit", "unit_price_usd"], item_rows)
    _write(
        OUT / "po_headers.csv",
        ["po_id", "supplier", "created_at", "worker_id", "outcome"],
        po_headers,
    )
    _write(
        OUT / "po_lines.csv",
        ["po_id", "sku", "item", "quantity", "unit", "lot_code", "unit_price_usd"],
        po_lines,
    )
    _write(
        OUT / "bols.csv",
        ["doc_id", "po_id", "supplier", "sku", "item", "quantity", "unit", "received_at"],
        bols,
    )
    _write(
        OUT / "packing_slips.csv",
        ["doc_id", "po_id", "supplier", "sku", "item", "quantity", "unit", "lot_code", "received_at"],
        slips,
    )
    _write(
        OUT / "voice_events.csv",
        [
            "event_id",
            "po_id",
            "worker_id",
            "time_start",
            "intent",
            "item",
            "quantity",
            "unit",
            "lot_code",
            "supplier",
            "in_reply_to",
            "utterance",
        ],
        voices,
    )
    print(
        f"wrote {OUT}: {len(po_headers)} POs, {len(po_lines)} lines, "
        f"{len({row['doc_id'] for row in bols})} BOLs, "
        f"{len({row['doc_id'] for row in slips})} slips, "
        f"{len(suppliers)} suppliers, {len(voices)} voice events"
    )
    return OUT


if __name__ == "__main__":
    build()
