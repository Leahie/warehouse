"""Order id helper shared by Store and seed (no pymongo)."""


def order_id_for(po_id: str | None, item: str | None) -> str:
    token = (item or "LINE").strip().upper().replace(" ", "")[:3]
    raw = (po_id or "UNK").strip()
    if raw.upper().startswith("PO-"):
        raw = raw[3:]
    return f"RCV-{raw}-{token}"
