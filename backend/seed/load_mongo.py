"""Wipe dockcheck Mongo and load the produce-week CSVs through Store."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from ingest.run import ingest_voice_doc
from seed.build_csv import OUT, build
from store.db import Store

WORKERS = [
    {"worker_id": "W-17", "name": "Maria Chen", "role": "receiver", "active": True},
    {"worker_id": "W-18", "name": "Luis Ortega", "role": "receiver", "active": True},
    {"worker_id": "W-19", "name": "Aisha Rahman", "role": "receiver", "active": True},
]
WEEK_START = datetime(2026, 9, 7, tzinfo=timezone.utc)
AGG_PATH = ROOT / "frontend" / "src" / "assets" / "data" / "logs_aggregates.json"


def _as_dt(value) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    text = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle))


def _group(rows: list[dict[str, str]], key: str) -> dict[str, list[dict[str, str]]]:
    out: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        out.setdefault(row[key], []).append(row)
    return out


def _qty(row: dict[str, str], field: str = "quantity") -> int | None:
    raw = (row.get(field) or "").strip()
    if raw == "":
        return None
    return int(float(raw))


def _price(row: dict[str, str]) -> float | None:
    raw = (row.get("unit_price_usd") or "").strip()
    if raw == "":
        return None
    return float(raw)


def _line(row: dict[str, str], *, lot: str | None = None) -> dict:
    lot_code = lot if lot is not None else (row.get("lot_code") or "").strip()
    return {
        "sku": row.get("sku"),
        "item": row.get("item"),
        "quantity": _qty(row),
        "unit": row.get("unit") or "cases",
        "lot_code": lot_code or None,
        "unit_price_usd": _price(row),
    }


def _insert_grouped(
    store: Store,
    *,
    rows: list[dict[str, str]],
    doc_type: str,
    actor: str,
    id_field: str = "doc_id",
    time_field: str = "received_at",
) -> int:
    grouped = _group(rows, id_field)
    for doc_id, lines in grouped.items():
        first = lines[0]
        when = _as_dt(first[time_field] if first.get(time_field) else first.get("created_at") or WEEK_START)
        po_id = first["po_id"]
        store.insert_document(
            {
                "doc_id": doc_id,
                "doc_type": doc_type,
                "po_id": po_id,
                "supplier": first.get("supplier"),
                "source_path": f"data/seed/csv/{doc_type}",
                "lines": [_line(row) for row in lines],
            },
            actor=actor,
        )
        store.set_fields("source_documents", {"doc_id": doc_id}, {"received_at": when})
    return len(grouped)


def _ingest_voice_row(store: Store, row: dict[str, str]) -> dict:
    when = _as_dt(row["time_start"])
    reply = (row.get("in_reply_to") or "").strip() or None
    parsed = {
        "intent": row["intent"],
        "item": row.get("item"),
        "quantity": _qty(row),
        "unit": row.get("unit") or "cases",
        "lot_code": (row.get("lot_code") or "").strip() or None,
        "supplier": row.get("supplier"),
        "in_reply_to": reply,
        "po_id": row.get("po_id"),
    }
    result = ingest_voice_doc(
        store,
        {
            "event_id": row["event_id"],
            "worker_id": row.get("worker_id") or "W-17",
            "time_start": when,
            "time_end": None,
            "utterance": row.get("utterance"),
            "po_id": row.get("po_id"),
            "parsed": parsed,
            "in_reply_to": reply,
            "parse_confidence": 0.9,
            "order_id": None,
            "ingest_channel": "seed",
            "actor": "seed",
        },
    )
    store.set_fields("voice_events", {"event_id": row["event_id"]}, {"time_start": when})
    order = result.get("order") or {}
    order_id = order.get("order_id")
    if not order_id:
        return result
    status = order.get("status")
    if result.get("mode") == "receive":
        fields = {
            "created_at": when,
            "time_process_started": when,
            "updated_at": when,
        }
        if status in {"committed", "flagged"}:
            fields["time_process_finished"] = when
        store.set_fields("orders", {"order_id": order_id}, fields)
        if status == "pending_clarification":
            store.set_fields("clarifications", {"order_id": order_id}, {"asked_at": when})
        if status == "flagged":
            store.set_fields("alerts", {"order_id": order_id}, {"created_at": when})
    elif result.get("mode") == "clarification_answer":
        store.set_fields("orders", {"order_id": order_id}, {
            "updated_at": when,
            "time_process_finished": when,
        })
        store.set_fields("clarifications", {"order_id": order_id}, {"answered_at": when})
        store.set_fields("alerts", {"order_id": order_id}, {"created_at": when})
    return result


def _hour_summary(store: Store, hour_start: datetime, hour_end: datetime) -> str:
    orders = []
    for order in store.list_orders():
        when = order.get("updated_at")
        if not when:
            continue
        when = _as_dt(when)
        if hour_start <= when < hour_end:
            orders.append(order)
    counts: dict[str, int] = {}
    for order in orders:
        status = order.get("status") or "pending_match"
        counts[status] = counts.get(status, 0) + 1
    parts = [
        f"{len(orders)} receipts.",
        (
            f"{counts.get('committed', 0)} committed, {counts.get('flagged', 0)} flagged, "
            f"{counts.get('pending_clarification', 0)} pending clarification, "
            f"{counts.get('pending_match', 0)} pending match."
        ),
    ]
    if any(order.get("po_id") == "PO-4419" for order in orders):
        parts.append("Short-ship flagged (romaine PO-4419, 40 vs 50).")
    return " ".join(parts)


def write_logs_aggregates(store: Store, path: Path = AGG_PATH) -> Path:
    manufacturers: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(lambda: {"pending_clarification": 0, "committed": 0, "flagged": 0})
    )
    for order in store.list_orders():
        status = order.get("status")
        if status not in {"pending_clarification", "committed", "flagged"}:
            continue
        supplier = order.get("supplier") or "Unknown"
        when = order.get("created_at") or order.get("updated_at") or order.get("time_process_started")
        day = _as_dt(when).date().isoformat() if when else "2026-09-07"
        manufacturers[supplier][day][status] += 1
    body = {
        "note": "Aggregated from Mongo produce-week seed (Mon 2026-09-07 .. Sat 2026-09-12).",
        "manufacturers": {
            name: {day: counts for day, counts in sorted(days.items())}
            for name, days in sorted(manufacturers.items())
        },
        "examples": {
            "multiple_single_day": {
                "mode": "multiple",
                "start": "2026-09-12",
                "end": None,
                "manufacturers": ["Fresh Farms", "Berry Grove Co"],
            },
            "multiple_range": {
                "mode": "multiple",
                "start": "2026-09-07",
                "end": "2026-09-12",
                "manufacturers": ["Fresh Farms", "Berry Grove Co"],
            },
            "single_range": {
                "mode": "single",
                "start": "2026-09-07",
                "end": "2026-09-12",
                "manufacturers": ["Fresh Farms"],
            },
        },
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body, indent=2) + "\n")
    return path


def _iso(value) -> str:
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        text = value.isoformat()
        if text.endswith("+00:00"):
            return text.replace("+00:00", "Z")
        tzinfo = getattr(value, "tzinfo", None)
        if tzinfo is None and "T" in text:
            return f"{text}Z"
        return text
    text = str(value)
    if "T" in text and not text.endswith("Z") and "+" not in text[10:] and "-" not in text[11:]:
        return f"{text}Z"
    return text.replace("+00:00", "Z")


def write_alerts_fixture(store: Store, path: Path) -> Path:
    orders = {order["order_id"]: order for order in store.list_orders()}
    cards = []
    alerts = sorted(
        store.list_alerts(),
        key=lambda row: _iso(row.get("created_at") or ""),
        reverse=True,
    )
    for alert in alerts:
        order = orders.get(alert.get("order_id"), {})
        cards.append({
            "alert_id": alert.get("alert_id"),
            "order_id": alert.get("order_id"),
            "item": order.get("item") or alert.get("item") or "",
            "reason": alert.get("reason"),
            "ai_summary": alert.get("ai_summary") or "",
            "created_at": _iso(alert.get("created_at")),
            "lot_code": order.get("lot_code") or alert.get("lot_code") or "",
            "supplier": order.get("supplier") or alert.get("supplier") or "",
            "severity": alert.get("severity") or "warning",
        })
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cards, indent=2) + "\n")
    return path


def load(wipe: bool = True) -> None:
    build()
    headers = _read_csv(OUT / "po_headers.csv")
    po_lines = _read_csv(OUT / "po_lines.csv")
    bols = _read_csv(OUT / "bols.csv")
    slips = _read_csv(OUT / "packing_slips.csv")
    voices = _read_csv(OUT / "voice_events.csv")

    store = Store()
    if wipe:
        store.wipe()
        print("wiped dockcheck collections")

    for worker in WORKERS:
        store.upsert_worker({**worker, "created_at": WEEK_START})

    lines_by_po = _group(po_lines, "po_id")
    bols_by_po = _group(bols, "po_id")
    slips_by_po = _group(slips, "po_id")

    for header in headers:
        po_id = header["po_id"]
        when = _as_dt(header["created_at"])
        store.insert_document(
            {
                "doc_id": po_id,
                "doc_type": "purchase_order",
                "po_id": po_id,
                "supplier": header["supplier"],
                "source_path": "data/seed/csv/po_headers.csv",
                "lines": [_line(row, lot="") for row in lines_by_po.get(po_id, [])],
            },
            actor="office",
        )
        store.set_fields("source_documents", {"doc_id": po_id}, {"received_at": when})
    print(f"inserted {len(headers)} purchase orders")

    n_bol = _insert_grouped(store, rows=bols, doc_type="bill_of_lading", actor="office")
    print(f"inserted {n_bol} bills of lading")
    n_slip = _insert_grouped(store, rows=slips, doc_type="packing_slip", actor="dock")
    print(f"inserted {n_slip} packing slips")

    pending = 0
    for header in headers:
        if header.get("outcome") != "pending_match":
            continue
        po_id = header["po_id"]
        when = _as_dt(header["created_at"])
        worker_id = header.get("worker_id") or "W-17"
        bol_id = (bols_by_po.get(po_id) or [{}])[0].get("doc_id")
        slip_id = (slips_by_po.get(po_id) or [{}])[0].get("doc_id")
        for line in lines_by_po.get(po_id, []):
            item = line.get("item")
            slip_line = next(
                (row for row in slips_by_po.get(po_id, []) if row.get("item") == item),
                (slips_by_po.get(po_id) or [{}])[0],
            )
            order = store.insert_pending_match_order(
                worker_id=worker_id,
                po_id=po_id,
                bol_id=bol_id,
                slip_id=slip_id,
                item=item,
                sku=line.get("sku"),
                quantity_expected=_qty(line),
                quantity_received=_qty(slip_line),
                unit=line.get("unit") or "cases",
                lot_code=(slip_line.get("lot_code") or "").strip() or None,
                supplier=header.get("supplier"),
                actor="seed",
            )
            store.set_fields("orders", {"order_id": order["order_id"]}, {
                "created_at": when,
                "updated_at": when,
                "time_process_started": when,
            })
            pending += 1
    print(f"inserted {pending} pending_match orders")

    receives = [row for row in voices if row.get("intent") == "receive"]
    confirms = [row for row in voices if row.get("intent") == "confirm_discrepancy"]
    receives.sort(key=lambda row: row["time_start"])
    confirms.sort(key=lambda row: row["time_start"])
    unmatched = 0
    for index, row in enumerate(receives + confirms, start=1):
        result = _ingest_voice_row(store, row)
        if result.get("mode") == "unmatched" or not result.get("order"):
            unmatched += 1
        if index % 100 == 0:
            print(f"ingested {index}/{len(voices)} voice events")
    print(f"ingested {len(voices)} voice events ({unmatched} unmatched or missing order)")

    heartbeat_flags = 0
    extra_alerts = 0
    orders_by_po: dict[str, list[dict]] = defaultdict(list)
    for order in store.list_orders():
        po_id = order.get("po_id")
        if po_id:
            orders_by_po[po_id].append(order)

    extra_specs = {
        "flagged_heartbeat": {
            "reason": "Heartbeat stale — no voice confirm",
            "source": "heartbeat",
            "flag": True,
            "summary": (
                "Order sat in pending clarification beyond the shift threshold. "
                "No answering voice event referenced the open clarification."
            ),
        },
        "flagged_lot": {
            "reason": "Lot code missing on slip",
            "source": "docs",
            "flag": True,
            "summary": "Packing slip omitted lot_code while other papers had a lot. Matcher could not complete lot agreement.",
        },
        "quality_damage": {
            "reason": "Quality damage reported",
            "source": "docs",
            "flag": True,
            "summary": "Receiver noted damaged cases. Quantity matched; quality flagged for supervisor review.",
        },
        "info_late": {
            "reason": "Late paperwork — still matched",
            "source": "info",
            "flag": False,
            "summary": "Quantity matched, but the bill of lading arrived after the dock receive.",
        },
        "info_temp": {
            "reason": "Temperature advisory",
            "source": "info",
            "flag": False,
            "summary": "Temperature was near the SOP limit. Receipt still matched; logged for cold-chain review.",
        },
    }

    for header in headers:
        spec = extra_specs.get(header.get("outcome") or "")
        if not spec:
            continue
        when = _as_dt(header["created_at"]) + timedelta(minutes=15)
        for order in orders_by_po.get(header["po_id"], []):
            if header.get("outcome") == "flagged_heartbeat" and order.get("status") != "pending_clarification":
                continue
            order_id = order["order_id"]
            item = order.get("item") or "item"
            supplier = order.get("supplier") or "supplier"
            summary = f"{item} from {supplier}: {spec['summary']}"
            if spec["flag"]:
                store.flag(
                    order_id,
                    reason=spec["reason"],
                    source=spec["source"],
                    actor=spec["source"],
                    created_at=when,
                )
            else:
                store.upsert_alert(
                    order_id=order_id,
                    reason=spec["reason"],
                    source=spec["source"],
                    created_at=when,
                    actor=spec["source"],
                    ai_summary=summary,
                )
            store.set_fields("alerts", {"order_id": order_id}, {
                "created_at": when,
                "ai_summary": summary,
            })
            if spec["flag"]:
                store.set_fields("orders", {"order_id": order_id}, {
                    "updated_at": when,
                    "time_process_finished": when,
                })
            extra_alerts += 1
            if header.get("outcome") == "flagged_heartbeat":
                heartbeat_flags += 1
    print(f"heartbeat-flagged {heartbeat_flags} unanswered clarifications")
    print(f"stamped {extra_alerts} extra issue-type alerts")

    backdated = 0
    orders_by_id = {order["order_id"]: order for order in store.list_orders()}
    for alert in store.list_alerts():
        order = orders_by_id.get(alert.get("order_id") or "") or {}
        when = (
            order.get("time_process_finished")
            or order.get("updated_at")
            or order.get("created_at")
        )
        if not when:
            continue
        store.set_fields("alerts", {"alert_id": alert["alert_id"]}, {"created_at": when})
        backdated += 1
    print(f"backdated {backdated} alert timestamps to their orders")

    store.backdate_pipeline_events()

    hours: set[datetime] = set()
    for order in store.list_orders():
        when = order.get("updated_at")
        if when:
            hours.add(_as_dt(when).replace(minute=0, second=0, microsecond=0))
    for hour_start in sorted(hours):
        hour_end = hour_start + timedelta(hours=1)
        store.compile_shift_log(
            f"LOG-{hour_start:%Y-%m-%d-%H}",
            hour_start,
            hour_end,
            _hour_summary(store, hour_start, hour_end),
        )
    print(f"compiled {len(hours)} shift logs")

    agg = write_logs_aggregates(store)
    fixture_agg = ROOT / "frontend" / "fixtures" / "logs_aggregates.json"
    fixture_agg.write_text(agg.read_text())
    print(f"wrote {agg}")
    print(f"wrote {fixture_agg}")

    alerts_path = ROOT / "frontend" / "src" / "assets" / "data" / "alerts.json"
    write_alerts_fixture(store, alerts_path)
    fixture_alerts = ROOT / "frontend" / "fixtures" / "alerts.json"
    fixture_alerts.write_text(alerts_path.read_text())
    print(f"wrote {alerts_path}")
    print(f"wrote {fixture_alerts}")

    orders = store.list_orders()
    counts: dict[str, int] = {}
    for order in orders:
        status = order.get("status") or "pending_match"
        counts[status] = counts.get(status, 0) + 1
    hero = next((order for order in orders if order.get("po_id") == "PO-4419"), None)
    alerts = store.list_alerts()
    reasons: dict[str, int] = {}
    severities: dict[str, int] = {}
    for alert in alerts:
        reasons[alert.get("reason") or "?"] = reasons.get(alert.get("reason") or "?", 0) + 1
        severities[alert.get("severity") or "?"] = severities.get(alert.get("severity") or "?", 0) + 1
    print(
        f"orders={len(orders)} status={counts} "
        f"alerts={len(alerts)} severity={severities} reasons={reasons} "
        f"hero={None if not hero else hero.get('order_id')}:{hero.get('status') if hero else None}:"
        f"{hero.get('flagged_by') if hero else None} "
        f"hero_id_ok={None if not hero else hero.get('order_id') == 'RCV-4419-ROM'}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Load produce-week CSVs into Mongo")
    parser.add_argument("--wipe", action="store_true", help="Clear dockcheck collections first")
    args = parser.parse_args()
    if not args.wipe:
        sys.exit("refusing to load without --wipe")
    load(wipe=True)


if __name__ == "__main__":
    main()
