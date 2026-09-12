"""Rank candidate purchase orders against what the dock actually heard.

Pure scoring, no IO -- the store supplies documents, this decides which of them
the worker probably meant.

Speech arrives partial and mangled: "Pacific Pac 5." for "Pacific Pack 5", no
supplier at all when the worker omits "from", no item when the sentence does not
start with "receiving". Requiring every field to match exactly throws away a
usable identification. Scoring lets any subset of signals identify an order, and
surfaces the runners-up so the agent can ask instead of guessing.
"""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any

# Lot codes are unique per receipt, so hearing one is effectively decisive.
W_PO = 120
W_LOT = 100
W_SKU = 60
W_ITEM = 25
W_SUPPLIER = 25
W_QUANTITY = 10

# A candidate must clear this to be worth offering at all.
MIN_SCORE = 20
# Below this gap between first and second, ask the worker rather than assume.
DECISIVE_GAP = 25


# The catalogue is in English; a worker may not be. Mapping at the edge keeps
# one set of documents and one matcher, rather than a translated copy of both.
# Keys are accent-stripped and lowercased before lookup, so "brocoli" and
# "brócoli" both land.
COMMODITY_ES = {
    "esparragos": "asparagus", "aguacate": "avocado", "aguacates": "avocado",
    "palta": "avocado", "betabel": "beets", "remolacha": "beets",
    "arandanos": "blueberries", "brocoli": "broccoli", "col": "cabbage",
    "repollo": "cabbage", "zanahoria": "carrots", "zanahorias": "carrots",
    "coliflor": "cauliflower", "apio": "celery", "maiz": "corn",
    "elote": "corn", "pepino": "cucumbers", "pepinos": "cucumbers",
    "ejotes": "green beans", "judias": "green beans", "hierbas": "herbs",
    "lechuga iceberg": "iceberg", "col rizada": "kale", "limon": "lemons",
    "limones": "lemons", "lechuga": "lettuce", "lima": "limes", "limas": "limes",
    "mezcla de verduras": "mixed greens", "champinones": "mushrooms",
    "hongos": "mushrooms", "setas": "mushrooms", "cebolla": "onions",
    "cebollas": "onions", "naranja": "oranges", "naranjas": "oranges",
    "pimiento": "peppers", "pimientos": "peppers", "chiles": "peppers",
    "papa": "potatoes", "papas": "potatoes", "patata": "potatoes",
    "patatas": "potatoes", "rabano": "radish", "rabanos": "radish",
    "romana": "romaine", "lechuga romana": "romaine", "espinaca": "spinach",
    "espinacas": "spinach", "calabaza": "squash", "fresa": "strawberries",
    "fresas": "strawberries", "frutilla": "strawberries",
    "frutillas": "strawberries", "jitomate": "tomatoes",
    "jitomates": "tomatoes", "tomate": "tomatoes", "tomates": "tomatoes",
    "calabacin": "zucchini", "calabacita": "zucchini",
}


def strip_accents(text: str | None) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", text or "")
        if unicodedata.category(ch) != "Mn"
    )


def to_catalogue_item(item: str | None) -> str | None:
    """Map a spoken commodity onto the name the documents use."""
    if not item:
        return None
    key = strip_accents(item).strip().casefold()
    return COMMODITY_ES.get(key, item)


# One preferred Spanish word per commodity, for speaking back. The lookup above
# is many-to-one (fresa, fresas, frutilla all mean strawberries); this picks the
# one the agent says.
COMMODITY_EN_TO_ES = {
    "asparagus": "esp\u00e1rragos", "avocado": "aguacate", "beets": "betabel",
    "blueberries": "ar\u00e1ndanos", "broccoli": "br\u00f3coli", "cabbage": "repollo",
    "carrots": "zanahorias", "cauliflower": "coliflor", "celery": "apio",
    "corn": "ma\u00edz", "cucumbers": "pepinos", "green beans": "ejotes",
    "herbs": "hierbas", "iceberg": "lechuga iceberg", "kale": "col rizada",
    "lemons": "limones", "lettuce": "lechuga", "limes": "limas",
    "mixed greens": "mezcla de verduras", "mushrooms": "champi\u00f1ones",
    "onions": "cebollas", "oranges": "naranjas", "peppers": "pimientos",
    "potatoes": "papas", "radish": "r\u00e1banos", "romaine": "lechuga romana",
    "spinach": "espinacas", "squash": "calabaza", "strawberries": "fresas",
    "tomatoes": "tomates", "zucchini": "calabac\u00edn",
}


def spoken_item(item: str | None, lang: str = "en") -> str:
    """The commodity name to say back, in the worker's language."""
    if not item:
        return ""
    if lang != "es":
        return item
    return COMMODITY_EN_TO_ES.get(item.strip().casefold(), item)


def norm(text: str | None) -> str:
    """Casefold, drop punctuation, collapse whitespace."""
    return re.sub(r"[^a-z0-9 ]+", " ", (text or "").casefold()).strip()


def norm_code(text: str | None) -> str:
    """Lot codes and SKUs: keep alphanumerics only, so 'C5217 15' == 'C5217-15'."""
    return re.sub(r"[^a-z0-9]+", "", (text or "").casefold())


def similar(a: str | None, b: str | None) -> float:
    """0..1 similarity, tolerant of the ways speech-to-text mangles names."""
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    ta, tb = set(na.split()), set(nb.split())
    # "pacific pac 5" vs "pacific pack 5": most tokens land exactly.
    overlap = len(ta & tb) / max(len(ta), len(tb))
    return max(SequenceMatcher(None, na, nb).ratio(), overlap)


def score_document(parsed: dict[str, Any], doc: dict[str, Any]) -> tuple[int, list[str]]:
    """Score one source document against a parsed utterance. Returns (score, why)."""
    score = 0
    why: list[str] = []

    heard_po = norm_code(parsed.get("po_id"))
    if heard_po and norm_code(doc.get("po_id")) == heard_po:
        score += W_PO
        why.append(f"po {doc.get('po_id')}")

    heard_lot = norm_code(parsed.get("lot_code"))
    heard_item = norm(parsed.get("item"))
    heard_qty = parsed.get("quantity")
    heard_sku = norm_code(parsed.get("sku"))

    for line in doc.get("lines") or []:
        if heard_lot and norm_code(line.get("lot_code")) == heard_lot:
            score += W_LOT
            why.append(f"lot {line.get('lot_code')}")
        if heard_sku and norm_code(line.get("sku")) == heard_sku:
            score += W_SKU
            why.append(f"sku {line.get('sku')}")
        if heard_item:
            ratio = similar(heard_item, line.get("item"))
            if ratio >= 0.8:
                score += int(W_ITEM * ratio)
                why.append(f"item {line.get('item')}")
        if heard_qty is not None and line.get("quantity") == heard_qty:
            score += W_QUANTITY
            why.append(f"qty {heard_qty}")

    if parsed.get("supplier"):
        ratio = similar(parsed.get("supplier"), doc.get("supplier"))
        if ratio >= 0.6:
            score += int(W_SUPPLIER * ratio)
            why.append(f"supplier {doc.get('supplier')}")

    return score, why


def rank(parsed: dict[str, Any], docs: list[dict[str, Any]], limit: int = 4) -> list[dict[str, Any]]:
    """Best candidates first. Each carries the po_id, score and why it scored."""
    scored = []
    for doc in docs:
        score, why = score_document(parsed, doc)
        if score < MIN_SCORE:
            continue
        scored.append({
            "po_id": doc.get("po_id") or doc.get("doc_id"),
            "supplier": doc.get("supplier"),
            "score": score,
            "why": why,
            "items": [ln.get("item") for ln in (doc.get("lines") or [])],
            "lines": [
                {"item": ln.get("item"), "quantity": ln.get("quantity"), "unit": ln.get("unit")}
                for ln in (doc.get("lines") or [])
            ],
            "lot_codes": [ln.get("lot_code") for ln in (doc.get("lines") or []) if ln.get("lot_code")],
        })
    scored.sort(key=lambda c: (-c["score"], str(c["po_id"])))

    # Several documents (PO, BOL, slip) share a po_id; keep the best per order.
    seen: dict[str, dict[str, Any]] = {}
    for c in scored:
        if c["po_id"] and c["po_id"] not in seen:
            seen[c["po_id"]] = c
    return list(seen.values())[:limit]


def decide(candidates: list[dict[str, Any]]) -> tuple[str | None, list[dict[str, Any]]]:
    """(confident po_id, candidates to offer).

    One clear leader resolves. A close second means the agent should ask.
    """
    if not candidates:
        return None, []
    if len(candidates) == 1:
        return candidates[0]["po_id"], candidates
    if candidates[0]["score"] - candidates[1]["score"] >= DECISIVE_GAP:
        return candidates[0]["po_id"], candidates
    return None, candidates
