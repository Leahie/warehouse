"""Pure match: office papers (PO + BOL) vs what the worker sees (packing slip)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def _norm(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip().casefold()
        return text or None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def _line_for_item(doc: dict[str, Any] | None, item: str | None) -> dict[str, Any] | None:
    if not doc:
        return None
    lines = doc.get("lines") or []
    want = _norm(item)
    if want:
        for line in lines:
            if _norm(line.get("item")) == want:
                return line
    return lines[0] if lines else None


def _cell(a: Any, b: Any) -> str:
    if a is None and b is None:
        return "missing"
    if a is None or b is None:
        return "missing"
    return "match" if _norm(a) == _norm(b) else "mismatch"


def _field(po, bol, slip, voice, name: str) -> dict[str, Any]:
    return {
        "field": name,
        "po": po,
        "bol": bol,
        "slip": slip,
        "voice": voice,
    }


@dataclass
class MatchResult:
    po_id: str | None
    bol_id: str | None
    slip_id: str | None
    item: str | None
    sku: str | None
    unit: str | None
    supplier: str | None
    lot_code: str | None
    quality: str | None
    temperature: dict[str, Any] | None
    quantity_expected: Any
    quantity_received: Any
    po_vs_bol: str
    bol_vs_slip: str
    papers_vs_slip: str
    slip_vs_voice: str
    mismatches: list[dict[str, Any]] = field(default_factory=list)
    suggested_status: str = "committed"
    clarification_kind: str | None = None
    clarification_question: str | None = None
    flag_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "po_id": self.po_id,
            "bol_id": self.bol_id,
            "slip_id": self.slip_id,
            "item": self.item,
            "sku": self.sku,
            "unit": self.unit,
            "supplier": self.supplier,
            "lot_code": self.lot_code,
            "quality": self.quality,
            "temperature": self.temperature,
            "quantity_expected": self.quantity_expected,
            "quantity_received": self.quantity_received,
            "po_vs_bol": self.po_vs_bol,
            "bol_vs_slip": self.bol_vs_slip,
            "papers_vs_slip": self.papers_vs_slip,
            "slip_vs_voice": self.slip_vs_voice,
            "mismatches": self.mismatches,
            "suggested_status": self.suggested_status,
            "clarification_kind": self.clarification_kind,
            "clarification_question": self.clarification_question,
            "flag_reason": self.flag_reason,
        }


# Fallback holding range, used only when the warehouse has not set its own.
# Cold chain is per-commodity and per-site, so the real limits come from
# warehouse settings; this is what a fresh site starts with.
DEFAULT_COLD_CHAIN_F = (33.0, 41.0)


def _to_fahrenheit(value: float, unit: str | None) -> float | None:
    if value is None or not unit:
        return None
    return value if unit.upper() == "F" else value * 9 / 5 + 32


def match_receipt(
    papers: dict[str, dict[str, Any] | None],
    parsed: dict[str, Any] | None,
    temp_limits_f: tuple[float, float] | None = None,
) -> MatchResult:
    po = papers.get("purchase_order")
    bol = papers.get("bill_of_lading")
    slip = papers.get("packing_slip")
    parsed = parsed or {}

    item = parsed.get("item")
    po_line = _line_for_item(po, item)
    bol_line = _line_for_item(bol, item)
    slip_line = _line_for_item(slip, item)

    qty_po = (po_line or {}).get("quantity")
    qty_bol = (bol_line or {}).get("quantity")
    qty_slip = (slip_line or {}).get("quantity")
    qty_voice = parsed.get("quantity")
    # Packing slip is what the worker sees. Voice is them reading it.
    qty_dock = qty_slip if qty_slip is not None else qty_voice

    unit_po = (po_line or {}).get("unit")
    item_po = (po_line or {}).get("item")
    sku = (po_line or {}).get("sku") or (slip_line or {}).get("sku")
    supplier = (po or {}).get("supplier") or parsed.get("supplier")
    lot_slip = (slip_line or {}).get("lot_code")
    lot_voice = parsed.get("lot_code")

    qty_pair_po_bol = _cell(qty_po, qty_bol)
    qty_pair_papers_slip = _cell(qty_po, qty_dock)
    qty_pair_slip_voice = _cell(qty_slip, qty_voice) if qty_slip is not None else _cell(qty_dock, qty_voice)

    item_po_bol = _cell(item_po, (bol_line or {}).get("item"))
    supplier_po_bol = _cell((po or {}).get("supplier"), (bol or {}).get("supplier"))

    mismatches: list[dict[str, Any]] = []
    if qty_pair_po_bol == "mismatch" or qty_pair_papers_slip == "mismatch":
        mismatches.append(_field(qty_po, qty_bol, qty_dock, qty_voice, "quantity"))
    elif qty_pair_slip_voice == "mismatch":
        mismatches.append(_field(qty_po, qty_bol, qty_slip, qty_voice, "quantity"))
    if item_po_bol == "mismatch":
        mismatches.append(
            _field(item_po, (bol_line or {}).get("item"), (slip_line or {}).get("item"), item, "item")
        )
    if supplier_po_bol == "mismatch":
        mismatches.append(
            _field(
                (po or {}).get("supplier"),
                (bol or {}).get("supplier"),
                (slip or {}).get("supplier"),
                parsed.get("supplier"),
                "supplier",
            )
        )
    if lot_slip and lot_voice and _norm(lot_slip) != _norm(lot_voice):
        mismatches.append(_field(None, None, lot_slip, lot_voice, "lot_code"))

    office_broken = qty_pair_po_bol == "mismatch" or item_po_bol == "mismatch" or supplier_po_bol == "mismatch"
    dock_vs_office = qty_pair_papers_slip == "mismatch"
    misread_slip = qty_slip is not None and qty_pair_slip_voice == "mismatch"

    question = None
    kind = None
    status = "committed"
    flag_reason = None
    unit = parsed.get("unit") or unit_po or "units"

    limits = temp_limits_f or DEFAULT_COLD_CHAIN_F
    temp = parsed.get("temperature") or {}
    temp_f = _to_fahrenheit(temp.get("value"), temp.get("unit"))
    quality = parsed.get("quality")
    lot_mismatch = bool(lot_slip and lot_voice and _norm(lot_slip) != _norm(lot_voice))

    if office_broken:
        status = "flagged"
        if item_po_bol == "mismatch":
            flag_reason = "Item substitution on bill of lading"
        elif supplier_po_bol == "mismatch":
            flag_reason = "Supplier mismatch on bill of lading"
        else:
            flag_reason = "Purchase order and bill of lading disagree"
    elif quality == "bad":
        # The worker is looking at the pallet; that beats any document.
        status = "flagged"
        flag_reason = "worker reported the goods as damaged or spoiled"
    elif temp_f is not None and not (limits[0] <= temp_f <= limits[1]):
        status = "flagged"
        flag_reason = (
            f"temperature {temp.get('value')}{temp.get('unit')} is outside this "
            f"warehouse's {limits[0]}-{limits[1]}F holding range"
            + (f" for {item}" if item else "")
        )
    elif lot_mismatch:
        # Never silently adopt the slip's lot code: traceability depends on it.
        status = "pending_clarification"
        kind = "lot_code"
        question = (
            f"You said lot {lot_voice}, the packing slip says {lot_slip}. "
            "Which lot is on the pallet?"
        )
    elif misread_slip:
        status = "pending_clarification"
        kind = "quantity"
        question = (
            f"You said {qty_voice} {unit}, the packing slip shows {qty_slip} — "
            "which number is on the slip?"
        )
    elif dock_vs_office:
        status = "pending_clarification"
        kind = "quantity"
        question = (
            f"Packing slip shows {qty_dock} {unit} of {item or item_po or 'this item'}; "
            f"PO and bill of lading say {qty_po}. Can you confirm the count?"
        )
    elif temp.get("value") is not None and not temp.get("unit"):
        # Only ask when a reading was actually given. The parsed temperature is
        # always a dict, so testing it for truthiness asked every worker to
        # clarify a temperature they never mentioned.
        status = "pending_clarification"
        kind = "temperature_unit"
        question = "Was this temperature in Fahrenheit or Celsius?"

    return MatchResult(
        po_id=(po or {}).get("po_id") or (po or {}).get("doc_id"),
        bol_id=(bol or {}).get("doc_id"),
        slip_id=(slip or {}).get("doc_id"),
        item=item or item_po,
        sku=sku,
        quality=quality,
        temperature=(temp or None) if temp.get("value") is not None else None,
        unit=parsed.get("unit") or unit_po,
        supplier=supplier,
        lot_code=lot_voice or lot_slip,
        quantity_expected=qty_po,
        quantity_received=qty_dock,
        po_vs_bol="mismatch" if qty_pair_po_bol == "mismatch" else qty_pair_po_bol,
        bol_vs_slip="mismatch" if qty_pair_papers_slip == "mismatch" else qty_pair_papers_slip,
        papers_vs_slip="mismatch" if qty_pair_papers_slip == "mismatch" else qty_pair_papers_slip,
        slip_vs_voice="mismatch" if qty_pair_slip_voice == "mismatch" else qty_pair_slip_voice,
        mismatches=mismatches,
        suggested_status=status,
        clarification_kind=kind,
        clarification_question=question,
        flag_reason=flag_reason,
    )
