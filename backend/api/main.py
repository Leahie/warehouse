"""HTTP lid. Console and OpenClaw call this. Matcher stays in ingest/store."""

from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from heartbeat.run import tick as heartbeat_tick
from ingest.run import ingest_voice_doc
from ingest.transcribe_wav import transcribe_bytes
from investigate.run import run_investigation
from store.db import Store

FIXTURE = ROOT / "contracts" / "events.fixture.json"

app = FastAPI(title="DockCheck")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
store = Store()


class FlagBody(BaseModel):
    reason: str
    source: str = "supervisor"


class InvestigateBody(BaseModel):
    query: str


class VoiceEventBody(BaseModel):
    utterance: str
    worker_id: str = "W-17"
    event_id: str | None = None
    parsed: dict[str, Any] | None = None
    in_reply_to: str | None = None


class ClarificationAnswerBody(BaseModel):
    intent: str = Field(description="confirm_discrepancy | correct_entry | answer_clarification")
    utterance: str = ""
    quantity: float | int | None = None
    worker_id: str = "W-17"
    event_id: str | None = None


def _jsonify(doc: Any) -> Any:
    if doc is None:
        return None
    if type(doc).__name__ == "ObjectId":
        return str(doc)
    if hasattr(doc, "isoformat") and not isinstance(doc, (str, bytes)):
        return doc.isoformat()
    if isinstance(doc, list):
        return [_jsonify(item) for item in doc]
    if isinstance(doc, dict):
        return {key: _jsonify(value) for key, value in doc.items() if key != "_id"}
    return doc


@app.get("/api/events")
def events(after: int = 0, pane: str | None = None):
    rows = store.events_after(after, pane)
    if rows:
        return {"events": rows}
    fixture = json.loads(FIXTURE.read_text())
    if pane:
        fixture = [row for row in fixture if row.get("pane") == pane]
    return {"events": [row for row in fixture if int(row.get("seq") or 0) > after]}


@app.get("/api/orders")
def orders():
    return {"orders": _jsonify(store.list_orders())}


@app.get("/api/papers")
def papers():
    return {"papers": _jsonify(store.list_expected_receipts())}


@app.get("/api/orders/{order_id}")
def order(order_id: str):
    found = store.get_order(order_id)
    if not found:
        raise HTTPException(404, "order not found")
    return _jsonify(found)


@app.get("/api/alerts")
def alerts():
    return {"alerts": _jsonify(store.list_alerts())}


@app.post("/api/orders/{order_id}/flag")
def flag(order_id: str, body: FlagBody):
    try:
        order = store.flag(order_id, reason=body.reason, source=body.source, actor="supervisor")
    except KeyError:
        raise HTTPException(404, "order not found") from None
    return {"order_id": order["order_id"], "status": order["status"]}


@app.post("/api/investigate")
def investigate(body: InvestigateBody):
    doc = run_investigation(body.query, store)
    return {"investigation_id": doc["investigation_id"]}


@app.get("/api/investigations/{investigation_id}")
def investigation(investigation_id: str):
    found = store.get_investigation(investigation_id)
    if not found:
        raise HTTPException(404, "investigation not found")
    return _jsonify(found)


@app.post("/api/audio")
async def audio(
    file: UploadFile = File(...),
    worker_id: str = Form("W-17"),
    context_order_id: str | None = Form(None),
    session_id: str | None = Form(None),
):
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty audio")
    base = os.environ.get("WHISPER_BASE_URL", "http://127.0.0.1:8001/v1")
    try:
        utterance = transcribe_bytes(data, file.filename or "clip.wav", base)
    except Exception as exc:
        raise HTTPException(502, f"whisper failed: {exc}") from exc
    if not utterance:
        raise HTTPException(422, "whisper returned empty transcript")
    doc = {
        "event_id": f"EVT-{uuid.uuid4().hex[:8].upper()}",
        "worker_id": worker_id or "W-17",
        "utterance": utterance,
        "parsed": None,
        "actor": "dock-mic",
        "ingest_channel": "browser_mic",
        "context_order_id": context_order_id or None,
        # The browser owns the notion of a conversation; the server groups by it
        # rather than inferring threads from lot codes after the fact.
        "session_id": session_id or None,
    }
    result = ingest_voice_doc(store, doc)
    result["utterance"] = utterance
    return _jsonify(result)


@app.post("/api/voice-events")
def voice_events(body: VoiceEventBody):
    doc = {
        "event_id": body.event_id or f"EVT-{uuid.uuid4().hex[:8].upper()}",
        "worker_id": body.worker_id,
        "utterance": body.utterance,
        "parsed": body.parsed,
        "in_reply_to": body.in_reply_to,
        "actor": "openclaw",
        "ingest_channel": "api",
    }
    result = ingest_voice_doc(store, doc)
    return _jsonify(result)


@app.post("/api/clarifications/{clarification_id}/answer")
def answer_clarification(clarification_id: str, body: ClarificationAnswerBody):
    event = {
        "event_id": body.event_id or f"EVT-{uuid.uuid4().hex[:8].upper()}",
        "worker_id": body.worker_id,
        "utterance": body.utterance,
        "parsed": {
            "intent": body.intent,
            "quantity": body.quantity,
            "in_reply_to": clarification_id,
        },
        "actor": "openclaw",
        "ingest_channel": "api",
    }
    store.insert_voice_event(event, actor="openclaw")
    order = store.answer_clarification(clarification_id, event, actor="openclaw")
    if order is None:
        raise HTTPException(404, "clarification not found")
    return _jsonify({"clarification_id": clarification_id, "order": order})


@app.get("/api/work")
def work():
    return _jsonify(store.work_snapshot())


@app.post("/api/heartbeat")
def heartbeat():
    heartbeat_tick(store)
    return _jsonify(store.work_snapshot())


@app.get("/api/settings/temperature")
def get_temperature_settings():
    return _jsonify(store.get_temperature_settings())


class TemperatureSettingsBody(BaseModel):
    min_f: float | None = None
    max_f: float | None = None
    per_item: dict[str, dict[str, float]] | None = None


@app.put("/api/settings/temperature")
def put_temperature_settings(body: TemperatureSettingsBody):
    """The warehouse sets its own holding range, globally or per commodity."""
    if body.min_f is not None and body.max_f is not None and body.min_f > body.max_f:
        raise HTTPException(400, "min_f must not exceed max_f")
    return _jsonify(
        store.set_temperature_settings(body.min_f, body.max_f, body.per_item)
    )


@app.get("/api/shift-logs")
def shift_logs():
    return {"logs": _jsonify(store.list_shift_logs())}
