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
from match.resolve import decide
from store.db import Store

INBOX = ROOT / "data" / "inbox"
PROCESSED = ROOT / "data" / "processed"


def _read(path: Path) -> dict:
    return json.loads(path.read_text())


# A reply to an open clarification is short and has no PO in it, so the receive
# parser cannot recognise it. Detect the two answers the dock actually gives.
# Note the grouping: confirm(?:s|ed|ing)? -- an earlier `confirmed?` only ever
# matched "confirme"/"confirmed", so a worker saying "I can confirm" was ignored.
_CONFIRM_RE = re.compile(
    r"\b("
    r"yes|yeah|yep|yup|yup|uh[- ]?huh|mm[- ]?hm"
    r"|correct|right|true|accurate"
    r"|that'?s (?:right|correct|it)|thats (?:right|correct|it)"
    r"|confirm(?:s|ed|ing)?|affirmative"
    r"|sure|ok|okay|go ahead|sounds right|looks right"
    r")\b",
    re.I,
)
_CORRECT_RE = re.compile(
    r"\b("
    r"actually|no[, ]+it(?:'?s| is)|no[, ]+its|not quite|nope"
    r"|make it|should be|change it to|correct it to|i meant|scratch that"
    r"|it'?s really|it is really"
    r")\b",
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


_NOT_A_NAME = re.compile(
    r"\b(i|we|you|they|he|she|it|got|have|has|had|think|thinks|thought|is|are|was|were|"
    r"am|be|been|receiving|received|unloading|need|want|say|said|yeah|yes|no|ok|okay|"
    r"this|that|these|those|some|the|a|an|my|here)\b",
    re.I,
)


def _looks_like_name(candidate: str) -> bool:
    words = candidate.split()
    return 1 <= len(words) <= 4 and not _NOT_A_NAME.search(candidate)


# The number has to be anchored to a temperature word, or "24 cases ... 80
# degrees" reads the case count as the temperature.
_TEMP_AFTER = re.compile(
    r"(?P<sign>minus\s+|negative\s+|-)?(?P<value>\d{1,3}(?:\.\d)?)\s*"
    r"(?:°\s*)?(?:(?P<unit>f|c)\b|degrees?\s*(?P<unit2>f|c|fahrenheit|celsius)?|"
    r"(?P<unit3>fahrenheit|celsius))",
    re.I,
)
_TEMP_BEFORE = re.compile(
    r"\btemp(?:erature)?\b[^0-9]{0,24}?(?P<sign>minus\s+|negative\s+|-)?(?P<value>\d{1,3}(?:\.\d)?)"
    r"\s*(?:°\s*)?(?P<unit>f|c|fahrenheit|celsius)?",
    re.I,
)
_TEMP_CONTEXT = re.compile(r"\b(temp|temperature|degrees?|celsius|fahrenheit|thermometer)\b", re.I)


def parse_temperature(text: str) -> dict:
    """Temperature only counts when the number is attached to a temperature word."""
    text = text or ""
    if not _TEMP_CONTEXT.search(text):
        return {"value": None, "unit": None}
    m = _TEMP_AFTER.search(text) or _TEMP_BEFORE.search(text)
    if not m:
        return {"value": None, "unit": None}
    groups = m.groupdict()
    value = float(groups["value"])
    if groups.get("sign"):
        value = -value
    raw_unit = next(
        (groups.get(k) for k in ("unit", "unit2", "unit3") if groups.get(k)), None
    )
    unit = None
    if raw_unit:
        unit = "F" if raw_unit.lower().startswith("f") else "C"
    # Bare "80 degrees" is Fahrenheit on a US dock, but guessing silently is
    # worse than asking, so leave it unset and let the matcher clarify.
    return {"value": value, "unit": unit}


# What a worker actually says about a bad pallet.
_BAD_QUALITY = re.compile(
    r"\b(bad|spoiled|spoilt|rotten|rotting|mold|mould|mouldy|moldy|wilted|wilting|"
    r"damaged|crushed|bruised|leaking|leaked|torn|ripped|smells?|stinks?|"
    r"off|warm|thawed|melted|soggy|slimy|unusable|reject(?:ed)?)\b",
    re.I,
)
# "fresh" is excluded on purpose: it appears in supplier names ("Fresh Farms")
# far more often than as a quality report.
_GOOD_QUALITY = re.compile(
    r"\b(looks good|looks fine|all good|no damage|undamaged|intact|in good shape)\b", re.I
)


def parse_quality(text: str) -> str | None:
    if _BAD_QUALITY.search(text or ""):
        return "bad"
    if _GOOD_QUALITY.search(text or ""):
        return "good"
    return None


def crude_parse(utterance: str) -> dict:
    """Pull what we can out of a spoken line. Every field is best-effort.

    Workers do not speak in a fixed grammar and Whisper drops words, so each
    pattern is written to fire on the shortest plausible phrasing. Anything not
    heard stays None and the resolver scores on whatever remains.
    """
    text = utterance or ""
    qty = re.search(r"(\d+)\s+(cases|case|pallets|pallet|units|unit|boxes|box)", text, re.I)
    # "lot C5217-15", "lot number C5217 15", "lot: C-5217"
    # A lot code is one token, or two when spoken as "C5217 15". Stop before a
    # following clause, or the match swallows "... from Pacific Pack 5".
    lot = re.search(
        r"lot\s*(?:code|number|no\.?|#)?[:\s]\s*"
        r"([A-Za-z0-9][A-Za-z0-9-]*(?:\s+(?!from\b|at\b|in\b|on\b|for\b|of\b)\d[A-Za-z0-9-]*)?)",
        text,
        re.I,
    )
    # "from Pacific Pack 5" -- but also a bare trailing name, as in
    # "42 cases of cauliflower, lot C5217-15, Pacific Pac 5."
    supplier = re.search(r"\bfrom\s+([A-Za-z0-9][A-Za-z0-9 .'&-]+)", text, re.I)
    if not supplier:
        # A trailing proper noun is often the supplier ("..., Pacific Pack 5."),
        # but "Yo, I got some broccoli." fits that shape too. Require something
        # name-shaped: at most four words, and no pronouns or verbs in it.
        tail = re.search(r",\s*([A-Z][A-Za-z0-9 .'&-]{3,})\.?\s*$", text.strip())
        if tail and _looks_like_name(tail.group(1)):
            supplier = tail
    # "PO-5014", "PO5014", "P.O. 5014", "purchase order 5014". The agent reads
    # PO numbers out when it offers a shortlist, so workers answer with one.
    po = re.search(r"\b(?:p\.?\s?o\.?|purchase\s+order)[\s#:-]*(\d{3,6})\b", text, re.I)

    # "receiving 42 cases of cauliflower" and the bare "42 cases of cauliflower"
    item = re.search(r"\d+\s+(?:cases?|pallets?|units?|boxes?|box)\s+of\s+([A-Za-z]+)", text, re.I)
    if not item:
        item = re.search(
            r"(?:receiving|received|got|unloading|here'?s|this is)\s+"
            # "I got some broccoli" -- skip determiners and filler, or the item
            # comes back as "some".
            r"(?:(?:some|a|an|the|my|this|that|these|those|like|just|uh|um)\s+)*"
            r"(?:\d+\s+\w+\s+of\s+)?([A-Za-z]+)",
            text,
            re.I,
        )

    def clean(value: str | None) -> str | None:
        if not value:
            return None
        out = value.strip().strip(".,;:").strip()
        return out or None

    lot_code = clean(lot.group(1) if lot else None)
    if lot_code:
        # "C5217 15" and "C5217-15" are the same code spoken two ways.
        lot_code = re.sub(r"\s+", "-", lot_code)

    return {
        "intent": "receive",
        "item": (clean(item.group(1)).lower() if item and clean(item.group(1)) else None),
        "quantity": int(qty.group(1)) if qty else None,
        "unit": (qty.group(2).lower() if qty else None),
        "lot_code": lot_code,
        "po_id": (f"PO-{po.group(1)}" if po else None),
        "supplier": clean(supplier.group(1)) if supplier else None,
        "temperature": parse_temperature(text),
        "quality": parse_quality(text),
        "in_reply_to": None,
    }


def _mark(path: Path) -> None:
    dest_dir = PROCESSED / path.parent.name
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / path.name
    if dest.exists():
        return
    dest.write_text(path.read_text())


# Fields worth remembering between turns while an order is still unidentified.
CARRY_FIELDS = ("item", "quantity", "unit", "lot_code", "supplier", "sku", "po_id")


def _merge_pending(store: Store, worker_id: str | None, parsed: dict) -> dict:
    """Fold in detail from this worker's recent unresolved utterances.

    A dock worker volunteers one fact at a time -- "I got 60 cases of lemons",
    then "they're from Sunridge Organics". Either alone matches several orders;
    together they are unique. Treating each utterance as a fresh start throws
    away the half of the identification the worker already gave.
    """
    if not worker_id:
        return parsed
    merged = dict(parsed)
    for prior in store.pending_context(worker_id):
        # Naming a different item means the worker moved to another pallet, so
        # its quantity, lot and sku belong to the previous one, not this one.
        same_subject = (
            not merged.get("item")
            or not prior.get("item")
            or merged["item"] == prior["item"]
        )
        fields = CARRY_FIELDS if same_subject else ("supplier",)
        for field in fields:
            if merged.get(field) in (None, "") and prior.get(field) not in (None, ""):
                merged[field] = prior[field]
    return merged


def _offer_text(parsed: dict, candidates: list[dict]) -> str:
    """Read the shortlist back with something the worker can actually pick on."""
    heard = [
        f"{parsed['quantity']} {parsed.get('unit') or 'units'}" if parsed.get("quantity") else None,
        parsed.get("item"),
        f"lot {parsed['lot_code']}" if parsed.get("lot_code") else None,
        f"from {parsed['supplier']}" if parsed.get("supplier") else None,
    ]
    heard_txt = ", ".join(h for h in heard if h) or "that"

    # If every option shares the supplier, repeating it tells the worker nothing;
    # the quantity or lot is what separates them.
    suppliers = {c.get("supplier") for c in candidates[:3]}
    same_supplier = len(suppliers) == 1

    def describe(c: dict) -> str:
        bits = [c["po_id"]]
        if not same_supplier and c.get("supplier"):
            bits.append(f"from {c['supplier']}")
        if c.get("lot_codes"):
            bits.append(f"lot {c['lot_codes'][0]}")
        else:
            line = next(
                (ln for ln in c.get("lines") or [] if ln.get("item") == parsed.get("item")),
                None,
            ) or next(iter(c.get("lines") or []), None)
            if line and line.get("quantity") is not None:
                bits.append(f"{line['quantity']} {line.get('unit') or 'units'}")
        return " ".join(bits)

    options = "; ".join(describe(c) for c in candidates[:3])
    lead = (
        f"All {len(candidates[:3])} are from {candidates[0].get('supplier')}"
        if same_supplier
        else f"I heard {heard_txt}, but I could not tell which delivery you mean"
    )
    return f"{lead}. I have {options}. Which one? A lot code or PO number settles it."


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
        # A flagged receipt must not be read back as a clean one.
        if order.get("status") == "flagged":
            return (
                f"I logged {order.get('quantity_received')} {order.get('item')}, "
                f"lot {order.get('lot_code')}, and flagged it: "
                f"{order.get('flag_reason')}. A supervisor alert is open."
            )
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
            # The browser tells us which conversation is open on screen, which
            # beats inferring it: "yes" is meaningless without that context.
            clq = store.open_clarification_for_order(doc.get("context_order_id"))
            if not clq:
                clq = store.latest_open_clarification(doc.get("worker_id"))
            if clq:
                reply_to = clq["clarification_id"]
                parsed["intent"] = spoken_intent
                parsed["in_reply_to"] = reply_to
                doc["parsed"] = parsed

    if reply_to:
        order = store.answer_clarification(reply_to, doc, actor=doc.get("actor") or "ingest")
        return {
            "event_id": doc["event_id"], "order": order, "mode": "clarification_answer",
            "reply": _reply_text(store, "clarification_answer", order, parsed),
        }
    parsed = _merge_pending(store, doc.get("worker_id"), parsed)
    doc["parsed"] = parsed
    candidates = store.find_candidates(parsed)
    po_id, offer = decide(candidates)
    if not po_id:
        if offer:
            # Enough was heard to narrow it down, just not to settle it.
            return {
                "event_id": doc["event_id"], "order": None, "mode": "ambiguous",
                "candidates": offer,
                "reply": _offer_text(parsed, offer),
            }
        return {
            "event_id": doc["event_id"], "order": None, "mode": "unmatched",
            "reply": _reply_text(store, "unmatched", None, parsed),
        }
    papers = store.papers_for_po(po_id)
    result = match_receipt(papers, parsed, store.temperature_limits(parsed.get("item")))
    order = store.apply_match(
        worker_id=doc.get("worker_id") or "W-17",
        voice_event_id=doc["event_id"],
        result=result,
        actor=doc.get("actor") or "ingest",
    )
    store.clear_pending_context(doc.get("worker_id"))
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
