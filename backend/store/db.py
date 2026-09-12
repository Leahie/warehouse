"""Only module allowed to import pymongo. Every write emits pipeline_events."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from pymongo import ASCENDING, MongoClient, ReturnDocument


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _slug(item: str | None, po_id: str | None) -> str:
    token = (item or "LINE").strip().upper().replace(" ", "")[:3]
    return f"RCV-{po_id or 'UNK'}-{token}"


class Store:
    def __init__(self, uri: str | None = None, db_name: str = "dockcheck") -> None:
        self.client = MongoClient(uri or os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017"))
        self.db = self.client[db_name]
        self._ensure_indexes()

    def _ensure_indexes(self) -> None:
        self.db.workers.create_index("worker_id", unique=True)
        self.db.source_documents.create_index("doc_id", unique=True)
        self.db.source_documents.create_index([("po_id", ASCENDING), ("doc_type", ASCENDING)])
        self.db.voice_events.create_index("event_id", unique=True)
        self.db.orders.create_index("order_id", unique=True)
        self.db.orders.create_index("status")
        self.db.clarifications.create_index("clarification_id", unique=True)
        self.db.alerts.create_index("alert_id", unique=True)
        self.db.shift_logs.create_index("log_id", unique=True)
        self.db.pipeline_events.create_index("seq", unique=True)
        self.db.investigations.create_index("investigation_id", unique=True)

    def emit(self, kind: str, pane: str, actor: str, collection: str, entity_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        last = self.db.pipeline_events.find_one(sort=[("seq", -1)])
        seq = int((last or {}).get("seq") or 0) + 1
        row = {
            "seq": seq,
            "t": _now(),
            "kind": kind,
            "pane": pane,
            "actor": actor,
            "collection": collection,
            "entity_id": entity_id,
            "payload": payload,
        }
        self.db.pipeline_events.insert_one(row)
        return row

    def events_after(self, after: int = 0, pane: str | None = None) -> list[dict[str, Any]]:
        query: dict[str, Any] = {"seq": {"$gt": after}}
        if pane:
            query["pane"] = pane
        rows = list(self.db.pipeline_events.find(query, {"_id": 0}).sort("seq", ASCENDING))
        for row in rows:
            t = row.get("t")
            if hasattr(t, "isoformat"):
                row["t"] = t.isoformat()
        return rows

    def upsert_worker(self, doc: dict[str, Any]) -> None:
        doc = {**doc, "created_at": doc.get("created_at") or _now()}
        self.db.workers.update_one({"worker_id": doc["worker_id"]}, {"$set": doc}, upsert=True)

    def insert_document(self, doc: dict[str, Any], actor: str = "ingest") -> dict[str, Any]:
        body = {**doc, "received_at": _now(), "raw": doc}
        self.db.source_documents.update_one({"doc_id": doc["doc_id"]}, {"$set": body}, upsert=True)
        self.emit("document_ingested", "database", actor, "source_documents", doc["doc_id"], {
            "doc_type": doc.get("doc_type"),
            "supplier": doc.get("supplier"),
        })
        return body

    def insert_voice_event(self, doc: dict[str, Any], actor: str = "ingest") -> dict[str, Any]:
        self.db.voice_events.update_one({"event_id": doc["event_id"]}, {"$set": doc}, upsert=True)
        self.emit("voice_received", "voice", actor, "voice_events", doc["event_id"], {
            "utterance": doc.get("utterance"),
            "worker_id": doc.get("worker_id"),
        })
        parsed = doc.get("parsed")
        if parsed:
            self.emit("voice_parsed", "voice", actor, "voice_events", doc["event_id"], parsed)
        return doc

    def papers_for_po(self, po_id: str) -> dict[str, dict[str, Any] | None]:
        out: dict[str, dict[str, Any] | None] = {
            "purchase_order": None,
            "bill_of_lading": None,
            "packing_slip": None,
        }
        for doc in self.db.source_documents.find({"po_id": po_id}, {"_id": 0}):
            out[doc.get("doc_type")] = doc
        return out

    def find_po_id(self, parsed: dict[str, Any] | None) -> str | None:
        parsed = parsed or {}
        supplier = (parsed.get("supplier") or "").strip().casefold()
        item = (parsed.get("item") or "").strip().casefold()
        for doc in self.db.source_documents.find({"doc_type": "purchase_order"}):
            if supplier and (doc.get("supplier") or "").strip().casefold() != supplier:
                continue
            lines = doc.get("lines") or []
            if item and not any((line.get("item") or "").strip().casefold() == item for line in lines):
                continue
            return doc.get("po_id") or doc.get("doc_id")
        return None

    def apply_match(
        self,
        *,
        worker_id: str,
        voice_event_id: str,
        result,
        actor: str = "ingest",
    ) -> dict[str, Any]:
        data = result.to_dict() if hasattr(result, "to_dict") else dict(result)
        order_id = _slug(data.get("item"), data.get("po_id"))
        status = data["suggested_status"]
        existing = self.db.orders.find_one({"order_id": order_id}) or {}
        voice_ids = list(dict.fromkeys((existing.get("voice_event_ids") or []) + [voice_event_id]))
        clarification_ids = list(existing.get("clarification_ids") or [])
        now = _now()
        order = {
            "order_id": order_id,
            "po_id": data.get("po_id"),
            "bol_id": data.get("bol_id"),
            "slip_id": data.get("slip_id"),
            "worker_id": worker_id,
            "item": data.get("item"),
            "sku": data.get("sku"),
            "quantity_expected": data.get("quantity_expected"),
            "quantity_received": data.get("quantity_received"),
            "unit": data.get("unit"),
            "quality": existing.get("quality"),
            "lot_code": data.get("lot_code"),
            "supplier": data.get("supplier"),
            "temperature": existing.get("temperature"),
            "status": status,
            "match": {
                "po_vs_bol": data.get("po_vs_bol"),
                "bol_vs_slip": data.get("bol_vs_slip"),
                "slip_vs_voice": data.get("slip_vs_voice"),
                "mismatches": data.get("mismatches") or [],
            },
            "time_process_started": existing.get("time_process_started") or now,
            "time_process_finished": now if status in {"committed", "flagged"} else None,
            "voice_event_ids": voice_ids,
            "clarification_ids": clarification_ids,
            "flag_reason": data.get("flag_reason"),
            "flagged_by": "three_way_mismatch" if status == "flagged" else existing.get("flagged_by"),
            "updated_at": now,
            "created_at": existing.get("created_at") or now,
        }
        self.db.orders.update_one({"order_id": order_id}, {"$set": order}, upsert=True)
        self.db.voice_events.update_one({"event_id": voice_event_id}, {"$set": {"order_id": order_id}})
        self.emit("order_upserted", "database", actor, "orders", order_id, {
            "status": status,
            "quantity_received": order["quantity_received"],
            "quantity_expected": order["quantity_expected"],
            "item": order["item"],
        })
        if status == "committed":
            self.emit("order_committed", "database", actor, "orders", order_id, {"item": order["item"]})
        if status == "pending_clarification" and data.get("clarification_question"):
            clq_id = f"CLQ-{order_id}"
            clarification_ids.append(clq_id)
            self.db.clarifications.update_one(
                {"clarification_id": clq_id},
                {"$set": {
                    "clarification_id": clq_id,
                    "order_id": order_id,
                    "question": data["clarification_question"],
                    "kind": data.get("clarification_kind"),
                    "status": "open",
                    "asked_at": now,
                    "answered_at": None,
                    "answer_event_id": None,
                    "delivery_channel": "unspecified",
                }},
                upsert=True,
            )
            self.db.orders.update_one({"order_id": order_id}, {"$set": {"clarification_ids": list(dict.fromkeys(clarification_ids))}})
            self.emit("clarification_asked", "voice", actor, "clarifications", clq_id, {
                "question": data["clarification_question"],
            })
        if status == "flagged":
            self.flag(order_id, reason=data.get("flag_reason") or "flagged", source="three_way_mismatch", actor=actor)
        return order

    def answer_clarification(self, clarification_id: str, event: dict[str, Any], actor: str = "ingest") -> dict[str, Any] | None:
        clq = self.db.clarifications.find_one({"clarification_id": clarification_id})
        if not clq:
            return None
        intent = (event.get("parsed") or {}).get("intent")
        now = _now()
        self.db.clarifications.update_one(
            {"clarification_id": clarification_id},
            {"$set": {
                "status": "answered",
                "answered_at": now,
                "answer_event_id": event.get("event_id"),
            }},
        )
        self.emit("answer_received", "voice", actor, "voice_events", event.get("event_id"), {
            "intent": intent,
            "utterance": event.get("utterance"),
        })
        order_id = clq["order_id"]
        if intent == "confirm_discrepancy":
            return self.flag(order_id, reason="short-ship confirmed by worker", source="worker_confirm", actor=actor)
        if intent == "correct_entry":
            parsed = event.get("parsed") or {}
            return self.db.orders.find_one_and_update(
                {"order_id": order_id},
                {"$set": {
                    "status": "committed",
                    "quantity_received": parsed.get("quantity"),
                    "time_process_finished": now,
                    "updated_at": now,
                }},
                return_document=ReturnDocument.AFTER,
            )
        return self.db.orders.find_one({"order_id": order_id})

    def flag(self, order_id: str, *, reason: str, source: str, actor: str = "api") -> dict[str, Any]:
        now = _now()
        order = self.db.orders.find_one_and_update(
            {"order_id": order_id},
            {"$set": {
                "status": "flagged",
                "flag_reason": reason,
                "flagged_by": source,
                "time_process_finished": now,
                "updated_at": now,
            }},
            return_document=ReturnDocument.AFTER,
        )
        if not order:
            raise KeyError(order_id)
        alert_id = f"ALT-{order_id}"
        alert = {
            "alert_id": alert_id,
            "order_id": order_id,
            "severity": "critical",
            "reason": reason,
            "created_at": now,
            "acknowledged": False,
        }
        self.db.alerts.update_one({"alert_id": alert_id}, {"$set": alert}, upsert=True)
        self.emit("order_flagged", "database", actor, "orders", order_id, {
            "flagged_by": source,
            "flag_reason": reason,
        })
        self.emit("alert_opened", "database", actor, "alerts", alert_id, {
            "order_id": order_id,
            "severity": "critical",
        })
        return order

    def list_orders(self) -> list[dict[str, Any]]:
        return list(self.db.orders.find({}, {"_id": 0}))

    def get_order(self, order_id: str) -> dict[str, Any] | None:
        order = self.db.orders.find_one({"order_id": order_id}, {"_id": 0})
        if not order:
            return None
        docs = list(self.db.source_documents.find({"po_id": order.get("po_id")}, {"_id": 0}))
        events = list(self.db.voice_events.find({"event_id": {"$in": order.get("voice_event_ids") or []}}, {"_id": 0}))
        alerts = list(self.db.alerts.find({"order_id": order_id}, {"_id": 0}))
        return {"order": order, "documents": docs, "voice_events": events, "alerts": alerts}

    def list_alerts(self) -> list[dict[str, Any]]:
        return list(self.db.alerts.find({"acknowledged": False}, {"_id": 0}))

    def stale_open_clarifications(self, older_than) -> list[dict[str, Any]]:
        return list(self.db.clarifications.find({
            "status": "open",
            "asked_at": {"$lte": older_than},
        }))

    def compile_shift_log(self, log_id: str, hour_start, hour_end, summary_md: str) -> dict[str, Any]:
        orders = list(self.db.orders.find({
            "updated_at": {"$gte": hour_start, "$lt": hour_end},
        }))
        counts = {"committed": 0, "flagged": 0, "pending_clarification": 0, "pending_match": 0}
        events = []
        for order in orders:
            status = order.get("status") or "pending_match"
            counts[status] = counts.get(status, 0) + 1
            status_code = {"pending_match": 0, "pending_clarification": 1, "committed": 2, "flagged": 3}.get(status, 0)
            qty_delta = (order.get("quantity_received") or 0) - (order.get("quantity_expected") or 0)
            mismatch_count = len((order.get("match") or {}).get("mismatches") or [])
            events.append({
                "t": order.get("updated_at"),
                "entity_id": order.get("order_id"),
                "kind": f"order_{status}",
                "worker_id": order.get("worker_id"),
                "vec": [0, 0, status_code, qty_delta, mismatch_count],
            })
        body = {
            "log_id": log_id,
            "shift_date": hour_start.date().isoformat(),
            "hour_start": hour_start,
            "hour_end": hour_end,
            "worker_ids": sorted({o.get("worker_id") for o in orders if o.get("worker_id")}),
            "counts": counts,
            "order_ids": [o.get("order_id") for o in orders],
            "summary_md": summary_md,
            "events": events,
        }
        self.db.shift_logs.update_one({"log_id": log_id}, {"$set": body}, upsert=True)
        return body

    def insert_investigation(self, doc: dict[str, Any], actor: str = "investigate") -> dict[str, Any]:
        self.db.investigations.update_one({"investigation_id": doc["investigation_id"]}, {"$set": doc}, upsert=True)
        kind = "investigation_done" if doc.get("status") == "done" else "investigation_started"
        if doc.get("status") == "running" and doc.get("steps"):
            kind = "investigation_step"
        self.emit(kind, "search", actor, "investigations", doc["investigation_id"], {
            "query": doc.get("query"),
            "status": doc.get("status"),
            "step_count": len(doc.get("steps") or []),
        })
        return doc

    def get_investigation(self, investigation_id: str) -> dict[str, Any] | None:
        return self.db.investigations.find_one({"investigation_id": investigation_id}, {"_id": 0})
