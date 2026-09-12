"""Only module allowed to import pymongo. Every write emits pipeline_events."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from pymongo import ASCENDING, MongoClient, ReturnDocument

from match import resolve
from .ids import order_id_for as _slug


def _now() -> datetime:
    return datetime.now(timezone.utc)


INFO_REASONS = {
    "Temperature advisory",
    "Late paperwork — still matched",
    "Expected variance within tolerance",
}
WARNING_REASONS = {
    "Heartbeat stale — no voice confirm",
    "Lot code missing on slip",
    "Over-ship confirmed by worker",
    "Quality damage reported",
    "Item substitution on bill of lading",
    "Supplier mismatch on bill of lading",
    "BoL ≠ packing slip",
}
CRITICAL_SOURCES = {"worker_confirm", "three_way_mismatch", "supervisor"}


def severity_for(source: str, reason: str) -> str:
    if source == "info" or reason in INFO_REASONS:
        return "info"
    if reason in WARNING_REASONS or source in {"heartbeat", "docs"}:
        return "warning"
    if source in CRITICAL_SOURCES:
        return "critical"
    return "warning"


def _worker_confirm_reason(order: dict[str, Any]) -> str:
    received = order.get("quantity_received")
    expected = order.get("quantity_expected")
    try:
        received_n = None if received is None else int(received)
        expected_n = None if expected is None else int(expected)
    except (TypeError, ValueError):
        received_n = expected_n = None
    if received_n is not None and expected_n is not None and received_n > expected_n:
        return "Over-ship confirmed by worker"
    if received_n is not None and expected_n is not None and received_n < expected_n:
        return "Short-ship confirmed by worker"
    return "Quantity discrepancy confirmed by worker"


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
            "po_id": doc.get("po_id"),
            "item": (doc.get("lines") or [{}])[0].get("item") if doc.get("lines") else None,
            "quantity": (doc.get("lines") or [{}])[0].get("quantity") if doc.get("lines") else None,
        })
        return body

    def insert_voice_event(self, doc: dict[str, Any], actor: str = "ingest") -> dict[str, Any]:
        self.db.voice_events.update_one({"event_id": doc["event_id"]}, {"$set": doc}, upsert=True)
        # session_id rides on every voice event so the pane can group a thread
        # the way the browser saw it, instead of inferring threads from lot codes.
        session_id = doc.get("session_id")
        self.emit("voice_received", "voice", actor, "voice_events", doc["event_id"], {
            "utterance": doc.get("utterance"),
            "worker_id": doc.get("worker_id"),
            "lot_code": (doc.get("parsed") or {}).get("lot_code"),
            "item": (doc.get("parsed") or {}).get("item"),
            "order_id": doc.get("order_id"),
            "session_id": session_id,
        })
        parsed = doc.get("parsed")
        if parsed:
            self.emit(
                "voice_parsed", "voice", actor, "voice_events", doc["event_id"],
                {**parsed, "session_id": session_id},
            )
        return doc

    def record_agent_reply(
        self,
        event_id: str,
        reply: str,
        *,
        session_id: str | None = None,
        order_id: str | None = None,
        mode: str | None = None,
        actor: str = "agent",
    ) -> None:
        """The agent's spoken answer is part of the conversation, not a return value.

        Without this the reply lives only in the HTTP response: refresh the page
        and every agent turn disappears, leaving the raw parse events showing in
        its place.
        """
        if not reply:
            return
        self.emit("agent_replied", "voice", actor, "voice_events", event_id, {
            "reply": reply,
            "session_id": session_id,
            "order_id": order_id,
            "mode": mode,
        })

    def papers_for_po(self, po_id: str) -> dict[str, dict[str, Any] | None]:
        out: dict[str, dict[str, Any] | None] = {
            "purchase_order": None,
            "bill_of_lading": None,
            "packing_slip": None,
        }
        for doc in self.db.source_documents.find({"po_id": po_id}, {"_id": 0}):
            out[doc.get("doc_type")] = doc
        return out

    # How far back an unresolved utterance still counts as part of the same
    # exchange. Long enough for a worker to think, short enough that the next
    # pallet does not inherit the last one's details.
    PENDING_WINDOW_S = 180

    def pending_context(self, worker_id: str) -> list[dict[str, Any]]:
        """Parsed fields from this worker's recent utterances that never resolved."""
        cutoff = _now().timestamp() - self.PENDING_WINDOW_S
        out: list[dict[str, Any]] = []
        for event in (
            self.db.voice_events.find({"worker_id": worker_id}, {"_id": 0})
            .sort("_id", -1)
            .limit(8)
        ):
            received = event.get("received_at")
            if hasattr(received, "timestamp") and received.timestamp() < cutoff:
                break
            if event.get("context_cleared"):
                break
            parsed = event.get("parsed") or {}
            if parsed:
                out.append(parsed)
        return out

    def clear_pending_context(self, worker_id: str | None) -> None:
        """Mark the trail consumed, so the next receipt starts clean."""
        if not worker_id:
            return
        latest = self.db.voice_events.find_one(
            {"worker_id": worker_id}, {"_id": 1}, sort=[("_id", -1)]
        )
        if latest:
            self.db.voice_events.update_one(
                {"_id": latest["_id"]}, {"$set": {"context_cleared": True}}
            )

    # Shipped defaults for a new site; the warehouse overrides these.
    DEFAULT_TEMP_LIMITS_F = (33.0, 41.0)

    def temperature_limits(self, item: str | None = None) -> tuple[float, float]:
        """This warehouse's holding range, per commodity where it has set one."""
        doc = self.db.settings.find_one({"setting_id": "temperature"}) or {}
        per_item = (doc.get("per_item") or {}).get((item or "").strip().casefold())
        if per_item:
            return (float(per_item["min_f"]), float(per_item["max_f"]))
        if doc.get("min_f") is not None and doc.get("max_f") is not None:
            return (float(doc["min_f"]), float(doc["max_f"]))
        return self.DEFAULT_TEMP_LIMITS_F

    def get_temperature_settings(self) -> dict[str, Any]:
        doc = self.db.settings.find_one({"setting_id": "temperature"}, {"_id": 0})
        if doc:
            return doc
        return {
            "setting_id": "temperature",
            "min_f": self.DEFAULT_TEMP_LIMITS_F[0],
            "max_f": self.DEFAULT_TEMP_LIMITS_F[1],
            "per_item": {},
            "source": "default",
        }

    def set_temperature_settings(
        self,
        min_f: float | None = None,
        max_f: float | None = None,
        per_item: dict[str, Any] | None = None,
        actor: str = "api",
    ) -> dict[str, Any]:
        current = self.get_temperature_settings()
        doc = {
            "setting_id": "temperature",
            "min_f": float(min_f) if min_f is not None else current.get("min_f"),
            "max_f": float(max_f) if max_f is not None else current.get("max_f"),
            "per_item": {
                k.strip().casefold(): v
                for k, v in (per_item if per_item is not None else current.get("per_item") or {}).items()
            },
            "source": "warehouse",
            "updated_at": _now(),
        }
        self.db.settings.update_one({"setting_id": "temperature"}, {"$set": doc}, upsert=True)
        self.emit("settings_updated", "database", actor, "settings", "temperature", {
            "min_f": doc["min_f"], "max_f": doc["max_f"], "per_item": doc["per_item"],
        })
        return {k: v for k, v in doc.items() if k != "_id"}

    # A receipt that has been settled -- committed, or flagged and dealt with --
    # should not be silently written over when someone reads the pallet again.
    SETTLED_STATUSES = ("committed", "flagged")

    def existing_receipt(self, po_id: str | None, item: str | None) -> dict[str, Any] | None:
        """An order already checked in against this PO line, if there is one."""
        if not po_id:
            return None
        query: dict[str, Any] = {"po_id": po_id}
        if item:
            found = self.db.orders.find_one({**query, "item": item}, {"_id": 0})
            if found:
                return found
        return self.db.orders.find_one(query, {"_id": 0})

    def find_candidates(self, parsed: dict[str, Any] | None) -> list[dict[str, Any]]:
        """Purchase orders the worker might have meant, best first.

        Scores every document rather than filtering on exact equality, so a
        half-heard line ("lot C5217-15", supplier missed) still identifies its
        order. Ranking lives in match.resolve; this only supplies documents.
        """
        parsed = parsed or {}
        if not any(
            parsed.get(k) for k in ("po_id", "lot_code", "item", "supplier", "sku", "quantity")
        ):
            return []
        docs = list(self.db.source_documents.find({}, {"_id": 0}))
        return resolve.rank(parsed, docs)

    def find_po_id(self, parsed: dict[str, Any] | None) -> str | None:
        """The single order we are confident about, or None to ask."""
        po_id, _ = resolve.decide(self.find_candidates(parsed))
        return po_id

    def apply_match(
        self,
        *,
        worker_id: str,
        voice_event_id: str,
        result,
        actor: str = "ingest",
    ) -> dict[str, Any]:
        data = result.to_dict() if hasattr(result, "to_dict") else dict(result)
        order_id = _slug(data.get("po_id"), data.get("item"))
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
            # A worker's read of the pallet wins over a stale value.
            "quality": data.get("quality") or existing.get("quality"),
            "temperature": data.get("temperature") or existing.get("temperature"),
            "lot_code": data.get("lot_code"),
            "supplier": data.get("supplier"),
            "status": status,
            "match": {
                "po_vs_bol": data.get("po_vs_bol"),
                "bol_vs_slip": data.get("bol_vs_slip"),
                "papers_vs_slip": data.get("papers_vs_slip") or data.get("bol_vs_slip"),
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
                "order_id": order_id,
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
            # Without this the answer lands outside the conversation it answered.
            "session_id": event.get("session_id"),
            "order_id": clq.get("order_id"),
        })
        order_id = clq["order_id"]
        if event.get("event_id"):
            self.db.orders.update_one(
                {"order_id": order_id},
                {"$addToSet": {"voice_event_ids": event["event_id"]}},
            )
            self.db.voice_events.update_one(
                {"event_id": event["event_id"]},
                {"$set": {"order_id": order_id}},
            )
        if intent == "confirm_discrepancy":
            order = self.db.orders.find_one({"order_id": order_id}, {"_id": 0}) or {}
            return self.flag(
                order_id,
                reason=_worker_confirm_reason(order),
                source="worker_confirm",
                actor=actor,
            )
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
                projection={"_id": 0},
                return_document=ReturnDocument.AFTER,
            )
        return self.db.orders.find_one({"order_id": order_id}, {"_id": 0})

    def upsert_alert(
        self,
        *,
        order_id: str,
        reason: str,
        source: str = "seed",
        created_at: datetime | None = None,
        severity: str | None = None,
        ai_summary: str | None = None,
        actor: str = "api",
        emit_event: bool = True,
    ) -> dict[str, Any]:
        order = self.db.orders.find_one({"order_id": order_id}, {"_id": 0}) or {}
        now = created_at or _now()
        alert_id = f"ALT-{order_id}"
        if not severity:
            severity = severity_for(source, reason)
        alert = {
            "alert_id": alert_id,
            "order_id": order_id,
            "severity": severity,
            "reason": reason,
            "ai_summary": ai_summary or (
                f"{reason}. {order.get('item')}: received {order.get('quantity_received')} "
                f"vs expected {order.get('quantity_expected')} from {order.get('supplier')}."
            ),
            "lot_code": order.get("lot_code"),
            "supplier": order.get("supplier"),
            "created_at": now,
            "acknowledged": False,
        }
        self.db.alerts.update_one({"alert_id": alert_id}, {"$set": alert}, upsert=True)
        if emit_event:
            self.emit("alert_opened", "database", actor, "alerts", alert_id, {
                "order_id": order_id,
                "severity": severity,
            })
        return alert

    def flag(
        self,
        order_id: str,
        *,
        reason: str,
        source: str,
        actor: str = "api",
        created_at: datetime | None = None,
    ) -> dict[str, Any]:
        now = created_at or _now()
        order = self.db.orders.find_one_and_update(
            {"order_id": order_id},
            {"$set": {
                "status": "flagged",
                "flag_reason": reason,
                "flagged_by": source,
                "time_process_finished": now,
                "updated_at": now,
            }},
            projection={"_id": 0},
            return_document=ReturnDocument.AFTER,
        )
        if not order:
            raise KeyError(order_id)
        self.upsert_alert(order_id=order_id, reason=reason, source=source, created_at=now, actor=actor)
        self.emit("order_flagged", "database", actor, "orders", order_id, {
            "flagged_by": source,
            "flag_reason": reason,
        })
        return order

    def _decorate_orders(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for row in rows:
            # Frontend adapters read committed_at; Mongo stores time_process_finished.
            if row.get("committed_at") is None:
                row["committed_at"] = row.get("time_process_finished")
        return rows

    def list_orders(self) -> list[dict[str, Any]]:
        return self._decorate_orders(list(self.db.orders.find({}, {"_id": 0})))

    def count_orders(self) -> int:
        return self.db.orders.count_documents({})

    def page_orders(self, *, offset: int = 0, limit: int | None = 10) -> tuple[list[dict[str, Any]], int]:
        total = self.count_orders()
        cursor = self.db.orders.find({}, {"_id": 0}).sort("created_at", -1)
        if offset:
            cursor = cursor.skip(offset)
        if limit is not None:
            cursor = cursor.limit(limit)
        return self._decorate_orders(list(cursor)), total

    def orders_by_ids(self, ids: list[str]) -> list[dict[str, Any]]:
        if not ids:
            return []
        return self._decorate_orders(list(self.db.orders.find({"order_id": {"$in": ids}}, {"_id": 0})))

    def order_facets(self) -> dict[str, list[str]]:
        items = sorted({x for x in self.db.orders.distinct("item") if x})
        suppliers = sorted({x for x in self.db.orders.distinct("supplier") if x})
        qualities = sorted({x for x in self.db.orders.distinct("quality") if x})
        days: set[str] = set()
        for row in self.db.orders.find({}, {"_id": 0, "created_at": 1, "updated_at": 1}):
            when = row.get("created_at") or row.get("updated_at")
            if hasattr(when, "date"):
                days.add(when.date().isoformat())
            elif when:
                days.add(str(when)[:10])
        return {
            "items": items,
            "suppliers": suppliers,
            "qualities": qualities,
            "dates": sorted(days, reverse=True),
        }

    def list_documents(self, doc_type: str | None = None) -> list[dict[str, Any]]:
        query: dict[str, Any] = {}
        if doc_type:
            query["doc_type"] = doc_type
        return list(self.db.source_documents.find(query, {"_id": 0}))

    def list_expected_receipts(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for po in self.db.source_documents.find({"doc_type": "purchase_order"}, {"_id": 0}):
            po_id = po.get("po_id") or po.get("doc_id")
            papers = self.papers_for_po(po_id)
            bol = papers.get("bill_of_lading")
            slip = papers.get("packing_slip")
            for line in po.get("lines") or [{}]:
                item = line.get("item")
                bol_line = None
                if bol:
                    for candidate in bol.get("lines") or []:
                        if (candidate.get("item") or "").strip().casefold() == (item or "").strip().casefold():
                            bol_line = candidate
                            break
                    bol_line = bol_line or ((bol.get("lines") or [None])[0])
                slip_line = None
                if slip:
                    for candidate in slip.get("lines") or []:
                        if (candidate.get("item") or "").strip().casefold() == (item or "").strip().casefold():
                            slip_line = candidate
                            break
                    slip_line = slip_line or ((slip.get("lines") or [None])[0])
                order = self.db.orders.find_one(
                    {"po_id": po_id, "item": item},
                    {"_id": 0},
                ) or self.db.orders.find_one({"po_id": po_id}, {"_id": 0})
                qty_po = line.get("quantity")
                qty_bol = (bol_line or {}).get("quantity")
                qty_slip = (slip_line or {}).get("quantity")
                rows.append({
                    "po_id": po_id,
                    "bol_id": (bol or {}).get("doc_id"),
                    "slip_id": (slip or {}).get("doc_id"),
                    "supplier": po.get("supplier"),
                    "item": item,
                    "sku": line.get("sku"),
                    "quantity_po": qty_po,
                    "quantity_bol": qty_bol,
                    "quantity_slip": qty_slip,
                    "po_vs_bol": "match" if qty_po == qty_bol else ("missing" if qty_bol is None else "mismatch"),
                    "papers_vs_slip": (
                        "missing" if qty_slip is None else ("match" if qty_po == qty_slip else "mismatch")
                    ),
                    "order_id": (order or {}).get("order_id"),
                    "status": (order or {}).get("status"),
                    "quantity_received": (order or {}).get("quantity_received"),
                    "quantity_expected": (order or {}).get("quantity_expected") or qty_po,
                    "flag_reason": (order or {}).get("flag_reason"),
                    # A PO line exists the moment the paperwork lands; it stays
                    # awaiting until a worker checks it in at the dock.
                    "receipt_status": (order or {}).get("status") or "awaiting",
                    "quantity_outstanding": (
                        None
                        if qty_po is None
                        else max(0, qty_po - ((order or {}).get("quantity_received") or 0))
                    ),
                    "checked_in": bool(order),
                })
        return rows

    def receiving_progress(self) -> dict[str, Any]:
        """How much of the paperwork on file has actually arrived at the dock.

        Purchase orders create expected lines; a line is only fulfilled once a
        worker checks it in. This is that ratio, overall and per purchase order.
        """
        rows = self.list_expected_receipts()
        by_po: dict[str, dict[str, Any]] = {}
        for row in rows:
            po_id = row["po_id"]
            entry = by_po.setdefault(po_id, {
                "po_id": po_id,
                "bol_id": row.get("bol_id"),
                "supplier": row.get("supplier"),
                "lines_total": 0,
                "lines_checked_in": 0,
                "quantity_expected": 0,
                "quantity_received": 0,
                "flagged": 0,
                "awaiting": 0,
            })
            entry["lines_total"] += 1
            entry["quantity_expected"] += row.get("quantity_po") or 0
            if row["checked_in"]:
                entry["lines_checked_in"] += 1
                entry["quantity_received"] += row.get("quantity_received") or 0
            else:
                entry["awaiting"] += 1
            if row.get("receipt_status") == "flagged":
                entry["flagged"] += 1

        for entry in by_po.values():
            expected = entry["quantity_expected"]
            entry["percent_received"] = (
                round(100 * entry["quantity_received"] / expected, 1) if expected else 0.0
            )
            entry["complete"] = entry["awaiting"] == 0

        totals = {
            "purchase_orders": len(by_po),
            "lines_total": sum(e["lines_total"] for e in by_po.values()),
            "lines_checked_in": sum(e["lines_checked_in"] for e in by_po.values()),
            "quantity_expected": sum(e["quantity_expected"] for e in by_po.values()),
            "quantity_received": sum(e["quantity_received"] for e in by_po.values()),
            "flagged_lines": sum(e["flagged"] for e in by_po.values()),
            "purchase_orders_complete": sum(1 for e in by_po.values() if e["complete"]),
        }
        totals["percent_received"] = (
            round(100 * totals["quantity_received"] / totals["quantity_expected"], 1)
            if totals["quantity_expected"] else 0.0
        )
        return {"totals": totals, "by_po": sorted(by_po.values(), key=lambda e: e["po_id"])}

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

    def count_alerts(self) -> int:
        return self.db.alerts.count_documents({"acknowledged": False})

    def page_alerts(self, *, offset: int = 0, limit: int | None = 10) -> tuple[list[dict[str, Any]], int]:
        total = self.count_alerts()
        cursor = self.db.alerts.find({"acknowledged": False}, {"_id": 0}).sort("created_at", -1)
        if offset:
            cursor = cursor.skip(offset)
        if limit is not None:
            cursor = cursor.limit(limit)
        return list(cursor), total

    def _supplier_day_buckets(
        self,
        names: list[str],
        match: dict[str, Any],
    ) -> list[dict[str, Any]]:
        if not names:
            return []
        day_match: dict[str, Any] = {"supplier": {"$in": names}}
        if match:
            day_match = {"$and": [day_match, match]}
        grouped = list(self.db.orders.aggregate([
            {"$match": day_match},
            {"$group": {
                "_id": {
                    "supplier": {"$ifNull": ["$supplier", "unknown"]},
                    "day": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": {"$ifNull": ["$created_at", "$updated_at"]},
                            "timezone": "UTC",
                        }
                    },
                    "status": "$status",
                },
                "n": {"$sum": 1},
            }},
        ]))
        by_name: dict[str, dict[str, dict[str, int]]] = {name: {} for name in names}
        for row in grouped:
            key = row.get("_id") or {}
            supplier = key.get("supplier") or "unknown"
            day = key.get("day") or "unknown"
            status = key.get("status") or "pending_match"
            days = by_name.setdefault(supplier, {})
            bucket = days.setdefault(day, {"pending_clarification": 0, "committed": 0, "flagged": 0})
            if status in bucket:
                bucket[status] += int(row.get("n") or 0)
        return [{"name": name, "days": by_name.get(name) or {}} for name in names]

    def page_suppliers(
        self,
        *,
        offset: int = 0,
        limit: int | None = 10,
        start: str | None = None,
        end: str | None = None,
        names: list[str] | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        """Return supplier aggregates, busiest first. One page = `limit` companies.

        When `names` is set, skip rank/pagination and return those companies' day buckets.
        """
        match: dict[str, Any] = {}
        created: dict[str, Any] = {}
        if start:
            created["$gte"] = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
        if end:
            created["$lt"] = datetime.fromisoformat(end).replace(tzinfo=timezone.utc) + timedelta(days=1)
        if created:
            match["$or"] = [
                {"created_at": created},
                {"created_at": {"$exists": False}, "updated_at": created},
            ]

        wanted = [n.strip() for n in (names or []) if n and str(n).strip()]
        if wanted:
            return self._supplier_day_buckets(wanted, match), len(wanted)

        rank: list[dict[str, Any]] = []
        if match:
            rank.append({"$match": match})
        rank.extend([
            {"$group": {"_id": {"$ifNull": ["$supplier", "unknown"]}, "n": {"$sum": 1}}},
            {"$sort": {"n": -1, "_id": 1}},
        ])
        counted = list(self.db.orders.aggregate(rank + [{"$count": "n"}]))
        total = int((counted[0] or {}).get("n") or 0) if counted else 0
        named = list(self.db.orders.aggregate([
            *rank,
            {"$skip": offset},
            *( [{"$limit": limit}] if limit is not None else [] ),
        ]))
        ranked_names = [row["_id"] for row in named]
        if not ranked_names:
            return [], total
        return self._supplier_day_buckets(ranked_names, match), total

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

    def open_clarification_for_order(self, order_id: str | None) -> dict[str, Any] | None:
        if not order_id:
            return None
        return self.db.clarifications.find_one(
            {"order_id": order_id, "status": "open"}, {"_id": 0}
        )

    def latest_open_clarification(self, worker_id: str | None = None) -> dict[str, Any] | None:
        """The question a worker is most plausibly answering right now.

        Prefer the newest open clarification on the order this worker last
        spoke about; otherwise the newest open one overall. With many receipts
        in flight there is no single open question, so recency plus the
        worker's own last utterance is what disambiguates.
        """
        if worker_id:
            recent = self.db.voice_events.find(
                {"worker_id": worker_id}, {"_id": 0}
            ).sort("_id", -1).limit(12)
            lots = [
                (e.get("parsed") or {}).get("lot_code")
                for e in recent
                if (e.get("parsed") or {}).get("lot_code")
            ]
            for lot in lots:
                order = self.db.orders.find_one({"lot_code": lot}, {"_id": 0})
                if not order:
                    # Spoken lot codes lose their punctuation: match on the
                    # alphanumerics alone before giving up.
                    target = resolve.norm_code(lot)
                    order = next(
                        (
                            o
                            for o in self.db.orders.find(
                                {"lot_code": {"$ne": None}}, {"_id": 0}
                            )
                            if resolve.norm_code(o.get("lot_code")) == target
                        ),
                        None,
                    )
                if not order:
                    continue
                clq = self.db.clarifications.find_one(
                    {"order_id": order["order_id"], "status": "open"}, {"_id": 0}
                )
                if clq:
                    return clq
        return self.db.clarifications.find_one(
            {"status": "open"}, {"_id": 0}, sort=[("asked_at", -1)]
        )

    def list_open_clarifications(self) -> list[dict[str, Any]]:
        rows = list(self.db.clarifications.find({"status": "open"}, {"_id": 0}))
        for row in rows:
            for key in ("asked_at", "answered_at"):
                if hasattr(row.get(key), "isoformat"):
                    row[key] = row[key].isoformat()
        return rows

    def list_shift_logs(self) -> list[dict[str, Any]]:
        rows = list(self.db.shift_logs.find({}, {"_id": 0}).sort("hour_start", -1))
        for row in rows:
            for key in ("hour_start", "hour_end"):
                if hasattr(row.get(key), "isoformat"):
                    row[key] = row[key].isoformat()
            for event in row.get("events") or []:
                if hasattr(event.get("t"), "isoformat"):
                    event["t"] = event["t"].isoformat()
        return rows

    COLLECTIONS = (
        "workers",
        "source_documents",
        "voice_events",
        "orders",
        "clarifications",
        "alerts",
        "shift_logs",
        "pipeline_events",
        "investigations",
    )

    def wipe(self) -> None:
        for name in self.COLLECTIONS:
            self.db[name].delete_many({})
        self._ensure_indexes()

    def set_fields(self, collection: str, query: dict[str, Any], fields: dict[str, Any]) -> None:
        if not fields:
            return
        self.db[collection].update_many(query, {"$set": fields})

    def insert_pending_match_order(
        self,
        *,
        worker_id: str,
        po_id: str,
        bol_id: str | None,
        slip_id: str | None,
        item: str | None,
        sku: str | None,
        quantity_expected: Any,
        quantity_received: Any,
        unit: str | None,
        lot_code: str | None,
        supplier: str | None,
        actor: str = "seed",
    ) -> dict[str, Any]:
        now = _now()
        order_id = _slug(po_id, item)
        papers_vs_slip = (
            "match" if quantity_expected == quantity_received else (
                "missing" if quantity_received is None else "mismatch"
            )
        )
        order = {
            "order_id": order_id,
            "po_id": po_id,
            "bol_id": bol_id,
            "slip_id": slip_id,
            "worker_id": worker_id,
            "item": item,
            "sku": sku,
            "quantity_expected": quantity_expected,
            "quantity_received": quantity_received,
            "unit": unit,
            "quality": None,
            "lot_code": lot_code,
            "supplier": supplier,
            "temperature": None,
            "status": "pending_match",
            "match": {
                "po_vs_bol": "match",
                "bol_vs_slip": papers_vs_slip,
                "papers_vs_slip": papers_vs_slip,
                "slip_vs_voice": "missing",
                "mismatches": [],
            },
            "time_process_started": now,
            "time_process_finished": None,
            "voice_event_ids": [],
            "clarification_ids": [],
            "flag_reason": None,
            "flagged_by": None,
            "updated_at": now,
            "created_at": now,
        }
        self.db.orders.update_one({"order_id": order_id}, {"$set": order}, upsert=True)
        self.emit("order_upserted", "database", actor, "orders", order_id, {
            "status": "pending_match",
            "quantity_received": quantity_received,
            "quantity_expected": quantity_expected,
            "item": item,
        })
        return order

    def backdate_pipeline_events(self) -> None:
        times: dict[tuple[str, str], Any] = {}
        for doc in self.db.source_documents.find():
            times[("source_documents", doc.get("doc_id"))] = doc.get("received_at")
        for doc in self.db.voice_events.find():
            times[("voice_events", doc.get("event_id"))] = doc.get("time_start")
        for doc in self.db.orders.find():
            times[("orders", doc.get("order_id"))] = doc.get("updated_at")
        for doc in self.db.clarifications.find():
            times[("clarifications", doc.get("clarification_id"))] = doc.get("answered_at") or doc.get("asked_at")
        for doc in self.db.alerts.find():
            times[("alerts", doc.get("alert_id"))] = doc.get("created_at")
        for row in self.db.pipeline_events.find():
            when = times.get((row.get("collection"), row.get("entity_id")))
            if when is not None:
                self.db.pipeline_events.update_one({"_id": row["_id"]}, {"$set": {"t": when}})

    def work_snapshot(self) -> dict[str, Any]:
        pending = [
            {
                "order_id": o.get("order_id"),
                "item": o.get("item"),
                "status": o.get("status"),
                "quantity_received": o.get("quantity_received"),
                "quantity_expected": o.get("quantity_expected"),
            }
            for o in self.list_orders()
            if o.get("status") in {"pending_clarification", "pending_match", "flagged"}
        ]
        return {
            "open_clarifications": self.list_open_clarifications(),
            "alerts": self.list_alerts(),
            "pending_orders": pending,
        }
