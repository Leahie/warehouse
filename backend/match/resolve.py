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


# The catalogue is in English; a worker may not be. Mapping at the edge keeps one
# set of documents and one matcher, rather than a translated copy of both.
COMMODITY_ZH = {
    "芦笋": "asparagus", "牛油果": "avocado", "鳄梨": "avocado",
    "甜菜": "beets", "紅菜頭": "beets", "蓝莓": "blueberries",
    "西兰花": "broccoli", "西蘭花": "broccoli", "花椰菜": "broccoli",
    "卷心菜": "cabbage", "包菜": "cabbage", "胡萝卜": "carrots",
    "菜花": "cauliflower", "花椰": "cauliflower", "芌荀": "celery",
    "玉米": "corn", "黄瓜": "cucumbers", "青豆": "green beans",
    "四季豆": "green beans", "香草": "herbs", "结球生菜": "iceberg",
    "羽衣甘蓝": "kale", "甘蓝": "kale", "柠檬": "lemons",
    "生菜": "lettuce", "青柠": "limes", "混合蔬菜": "mixed greens",
    "蘑菇": "mushrooms", "洋葱": "onions", "洋子": "oranges",
    "橙子": "oranges", "辣椒": "peppers", "青椒": "peppers",
    "土豆": "potatoes", "马铃薯": "potatoes", "萝卜": "radish",
    "罗马生菜": "romaine", "菠菜": "spinach", "南瓜": "squash",
    "草莓": "strawberries", "番茄": "tomatoes", "西红柿": "tomatoes",
    "西葵芦": "zucchini", "青少": "zucchini",
}


def to_catalogue_item(item: str | None) -> str | None:
    """Map a spoken commodity onto the name the documents use."""
    if not item:
        return None
    key = (item or "").strip().casefold()
    if key in COMMODITY_ZH:
        return COMMODITY_ZH[key]
    # Chinese arrives without spaces, so a commodity is often embedded in a
    # longer run of characters rather than standing alone.
    for zh, en in COMMODITY_ZH.items():
        if zh in item:
            return en
    return item


# One preferred Chinese word per commodity, for speaking back.
COMMODITY_EN_TO_ZH = {
    "asparagus": "芦笋", "avocado": "牛油果", "beets": "甜菜",
    "blueberries": "蓝莓", "broccoli": "西兰花", "cabbage": "卷心菜",
    "carrots": "胡萝卜", "cauliflower": "菜花", "celery": "芌荀",
    "corn": "玉米", "cucumbers": "黄瓜", "green beans": "青豆",
    "herbs": "香草", "iceberg": "结球生菜", "kale": "羽衣甘蓝",
    "lemons": "柠檬", "lettuce": "生菜", "limes": "青柠",
    "mixed greens": "混合蔬菜", "mushrooms": "蘑菇", "onions": "洋葱",
    "oranges": "橙子", "peppers": "辣椒", "potatoes": "土豆",
    "radish": "萝卜", "romaine": "罗马生菜", "spinach": "菠菜",
    "squash": "南瓜", "strawberries": "草莓", "tomatoes": "番茄",
    "zucchini": "西葵芦",
}


def spoken_item(item: str | None, lang: str = "en") -> str:
    """The commodity name to say back, in the worker's language."""
    if not item:
        return ""
    if lang != "zh":
        return item
    return COMMODITY_EN_TO_ZH.get(item.strip().casefold(), item)


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
