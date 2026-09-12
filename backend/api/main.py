"""HTTP lid. Calls store and investigate. Does not import matcher internals."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

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
    return {"orders": store.list_orders()}


@app.get("/api/orders/{order_id}")
def order(order_id: str):
    found = store.get_order(order_id)
    if not found:
        raise HTTPException(404, "order not found")
    return found


@app.get("/api/alerts")
def alerts():
    return {"alerts": store.list_alerts()}


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
    return found
