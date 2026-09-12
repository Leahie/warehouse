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


# A reply to an open clarification is short and has no PO in it, so the receive
# parser cannot recognise it. Detect the two answers the dock actually gives.
_CONFIRM_RE = re.compile(
    r"\b(yes|yeah|yep|yup|correct|that'?s right|thats right|confirmed?|affirmative)\b",
    re.I,
)
_CORRECT_RE = re.compile(
    r"\b(actually|no it'?s|make it|should be|change it to|i meant|scratch that)\b",
    re.I,
)


def answer_intent(utterance: str) -> str | None:
    """confirm_discrepancy / correct_entry / None, from a spoken reply."""
    text = utterance or ""
    if _CORRECT_RE.search(text):
        return "correct_entry"
    if _CONFIRM_RE.search(text):
        return "confirm_discrepancy"
    return None


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


def _reply_text(store: Store, mode: str, order: dict | None, parsed: dict) -> str:
    """What the agent says back to the dock. Spoken by the browser."""
    if mode == "unmatched":
        return (
            "I could not match that to an expected delivery. "
            "Please repeat the quantity, the item, the lot code and the supplier."
        )
    if mode == "clarification_answer":
        if not order:
            return "I lost track of that question. Please say the line again."
        if order.get("status") == "flagged":
            return (
                f"Understood. I flagged {order.get('item')} lot {order.get('lot_code')} "
                f"as a short ship: {order.get('quantity_received')} received against "
                f"{order.get('quantity_expected')} expected. A supervisor alert is open."
            )
        return (
            f"Corrected. {order.get('item')} lot {order.get('lot_code')} is committed at "
            f"{order.get('quantity_received')}."
        )
    if order:
        open_here = [
            c for c in store.list_open_clarifications()
            if c.get("order_id") == order.get("order_id")
        ]
        if open_here:
            return open_here[0].get("question") or "Can you confirm that count?"
        return (
            f"Logged {order.get('quantity_received')} {order.get('item')}, "
            f"lot {order.get('lot_code')}. That matches the paperwork. Committed."
        )
    return "Logged."


def ingest_voice_doc(store: Store, doc: dict) -> dict:
    parsed = doc.get("parsed") or crude_parse(doc.get("utterance") or "")
    if doc.get("in_reply_to") and not parsed.get("in_reply_to"):
        parsed["in_reply_to"] = doc["in_reply_to"]
    doc["parsed"] = parsed
    if not doc.get("event_id"):
        doc["event_id"] = f"EVT-{uuid.uuid4().hex[:8].upper()}"
    store.insert_voice_event(doc, actor=doc.get("actor") or "ingest")
    reply_to = parsed.get("in_reply_to")

    # A browser mic cannot tell us what it is replying to, so if this utterance
    # reads as an answer and exactly one clarification is open, treat it as that
    # answer rather than dropping it as unmatched.
    if not reply_to:
        spoken_intent = answer_intent(doc.get("utterance") or "")
        if spoken_intent:
            open_clqs = store.list_open_clarifications()
            if len(open_clqs) == 1:
                reply_to = open_clqs[0]["clarification_id"]
                parsed["intent"] = spoken_intent
                parsed["in_reply_to"] = reply_to
                doc["parsed"] = parsed

    if reply_to:
        order = store.answer_clarification(reply_to, doc, actor=doc.get("actor") or "ingest")
        return {
            "event_id": doc["event_id"], "order": order, "mode": "clarification_answer",
            "reply": _reply_text(store, "clarification_answer", order, parsed),
        }
    po_id = store.find_po_id(parsed)
    if not po_id:
        return {
            "event_id": doc["event_id"], "order": None, "mode": "unmatched",
            "reply": _reply_text(store, "unmatched", None, parsed),
        }
    papers = store.papers_for_po(po_id)
    result = match_receipt(papers, parsed)
    order = store.apply_match(
        worker_id=doc.get("worker_id") or "W-17",
        voice_event_id=doc["event_id"],
        result=result,
        actor=doc.get("actor") or "ingest",
    )
    return {
        "event_id": doc["event_id"], "order": order, "mode": "receive",
        "reply": _reply_text(store, "receive", order, parsed),
    }


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
