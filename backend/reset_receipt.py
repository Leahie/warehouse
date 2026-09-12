"""Clear every trace of a receipt so a purchase order can be received again.

Partial resets leave clarification and agent_replied events behind. They group
under the same order, so the next attempt reads as if it had merged with an
older conversation. Everything keyed to the order has to go, not just the voice
events.

    PYTHONPATH=backend backend/.venv/bin/python backend/reset_receipt.py PO-4418 PO-4421
"""

from __future__ import annotations

import re
import sys

import pymongo


def _lots_for(db, po_id: str) -> list[str]:
    """Lot codes on this PO's paperwork, whether or not a receipt exists.

    Threads group by lot, so an abandoned attempt from an earlier session still
    joins the next conversation about the same pallet. Taking lots from the
    papers rather than the order means a reset works after the order is gone.
    """
    lots: set[str] = set()
    for doc in db.source_documents.find({"po_id": po_id}, {"lines": 1}):
        for line in doc.get("lines") or []:
            if line.get("lot_code"):
                lots.add(line["lot_code"])
    return sorted(lots)


def reset(db, po_id: str) -> dict[str, int]:
    removed = dict.fromkeys(
        ("orders", "clarifications", "alerts", "voice_events", "pipeline_events"), 0
    )
    orders = list(db.orders.find({"po_id": po_id}, {"order_id": 1, "lot_code": 1}))
    for order in orders:
        oid = order["order_id"]
        session = f"VS-{oid}"
        lot = order.get("lot_code")

        # Voice turns can be keyed by session or by the lot they mention.
        voice_query = {"$or": [{"session_id": session}]}
        if lot:
            voice_query["$or"].append({"parsed.lot_code": lot})
        voice_ids = [e["event_id"] for e in db.voice_events.find(voice_query, {"event_id": 1})]
        alert_ids = [a["alert_id"] for a in db.alerts.find({"order_id": oid}, {"alert_id": 1})]
        clq_ids = [
            c["clarification_id"]
            for c in db.clarifications.find({"order_id": oid}, {"clarification_id": 1})
        ]

        removed["pipeline_events"] += db.pipeline_events.delete_many({
            "$or": [
                {"entity_id": {"$in": [oid, *voice_ids, *alert_ids, *clq_ids]}},
                {"payload.session_id": session},
                {"payload.order_id": oid},
            ]
        }).deleted_count
        removed["voice_events"] += db.voice_events.delete_many(voice_query).deleted_count
        removed["clarifications"] += db.clarifications.delete_many({"order_id": oid}).deleted_count
        removed["alerts"] += db.alerts.delete_many({"order_id": oid}).deleted_count
        removed["orders"] += db.orders.delete_many({"order_id": oid}).deleted_count

    # Anything that mentions the lot, from any session. Abandoned attempts live
    # under their own scratch ids but regroup by lot on the next conversation.
    for lot in _lots_for(db, po_id):
        loose = re.compile(re.escape(lot).replace("\\-", "[- ]?"), re.I)
        stray = list(db.voice_events.find(
            {"$or": [{"parsed.lot_code": {"$regex": loose}}, {"utterance": {"$regex": loose}}]},
            {"event_id": 1},
        ))
        stray_ids = [e["event_id"] for e in stray]
        removed["pipeline_events"] += db.pipeline_events.delete_many({
            "$or": [
                {"entity_id": {"$in": stray_ids}},
                {"payload.lot_code": {"$regex": loose}},
                {"payload.utterance": {"$regex": loose}},
                {"payload.reply": {"$regex": loose}},
                {"payload.question": {"$regex": loose}},
            ]
        }).deleted_count
        removed["voice_events"] += db.voice_events.delete_many(
            {"event_id": {"$in": stray_ids}}
        ).deleted_count
    return removed


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: reset_receipt.py PO-4418 [PO-4421 ...]")
    db = pymongo.MongoClient("mongodb://127.0.0.1:27017/")["dockcheck"]
    for po_id in sys.argv[1:]:
        print(f"{po_id}: {reset(db, po_id)}")
        print(f"  orders remaining: {db.orders.count_documents({'po_id': po_id})}")


if __name__ == "__main__":
    main()
