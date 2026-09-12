"""Watch data/inbox and drive match → store. No pymongo here."""

from __future__ import annotations

import json
import re
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from match.matcher import match_receipt
from store.db import Store

INBOX = ROOT / "data" / "inbox"
PROCESSED = ROOT / "data" / "processed"


def _read(path: Path) -> dict:
    return json.loads(path.read_text())


def crude_parse(utterance: str) -> dict:
    text = utterance or ""
    qty = re.search(r"(\d+)\s+(cases|case|pallets|pallet|units|unit)", text, re.I)
    lot = re.search(r"lot\s+([A-Za-z0-9-]+)", text, re.I)
    supplier = re.search(r"from\s+([A-Za-z0-9][A-Za-z0-9 .'-]+)", text, re.I)
    item = re.search(r"(?:of|receiving)\s+\d+\s+\w+\s+(?:of\s+)?([a-z]+)", text, re.I)
    return {
        "intent": "receive",
        "item": (item.group(1).strip().lower() if item else None),
        "quantity": int(qty.group(1)) if qty else None,
        "unit": (qty.group(2).lower() if qty else None),
        "lot_code": (lot.group(1) if lot else None),
        "supplier": (supplier.group(1).strip() if supplier else None),
        "temperature": {"value": None, "unit": None},
        "in_reply_to": None,
    }


def _mark(path: Path) -> None:
    dest_dir = PROCESSED / path.parent.name
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / path.name
    if dest.exists():
        return
    dest.write_text(path.read_text())


def ingest_voice_doc(store: Store, doc: dict) -> dict:
    parsed = doc.get("parsed") or crude_parse(doc.get("utterance") or "")
    if doc.get("in_reply_to") and not parsed.get("in_reply_to"):
        parsed["in_reply_to"] = doc["in_reply_to"]
    doc["parsed"] = parsed
    if not doc.get("event_id"):
        doc["event_id"] = f"EVT-{uuid.uuid4().hex[:8].upper()}"
    store.insert_voice_event(doc, actor=doc.get("actor") or "ingest")
    reply_to = parsed.get("in_reply_to")
    if reply_to:
        order = store.answer_clarification(reply_to, doc, actor=doc.get("actor") or "ingest")
        return {"event_id": doc["event_id"], "order": order, "mode": "clarification_answer"}
    po_id = store.find_po_id(parsed)
    if not po_id:
        return {"event_id": doc["event_id"], "order": None, "mode": "unmatched"}
    papers = store.papers_for_po(po_id)
    result = match_receipt(papers, parsed)
    order = store.apply_match(
        worker_id=doc.get("worker_id") or "W-17",
        voice_event_id=doc["event_id"],
        result=result,
        actor=doc.get("actor") or "ingest",
    )
    return {"event_id": doc["event_id"], "order": order, "mode": "receive"}


def ingest_path(store: Store, path: Path) -> None:
    if path.suffix != ".json":
        return
    doc = _read(path)
    if path.parent.name == "workers":
        store.upsert_worker(doc)
        _mark(path)
        return
    if path.parent.name == "docs":
        actor = "dock" if doc.get("doc_type") == "packing_slip" else "office"
        store.insert_document(doc, actor=actor)
        _mark(path)
        return
    if path.parent.name == "slips":
        store.insert_document(doc, actor="dock")
        _mark(path)
        return
    if path.parent.name == "voice":
        ingest_voice_doc(store, doc)
        _mark(path)


def drain_once(store: Store | None = None) -> int:
    store = store or Store()
    count = 0
    for folder in ("workers", "docs", "slips", "voice"):
        directory = INBOX / folder
        if not directory.exists():
            continue
        for path in sorted(directory.glob("*.json")):
            seen = PROCESSED / folder / path.name
            if seen.exists():
                continue
            ingest_path(store, path)
            count += 1
            print(f"ingested {path}")
    return count


def main() -> None:
    store = Store()
    print(f"watching {INBOX}")
    while True:
        drain_once(store)
        time.sleep(1)


if __name__ == "__main__":
    if "--once" in sys.argv:
        print(f"ingested {drain_once()} files")
    else:
        main()
