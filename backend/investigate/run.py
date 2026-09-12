"""Call the local LLM. Never write Mongo except through store.insert_investigation."""

from __future__ import annotations

import json
import os
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any

from store.db import Store

INFERENCE_URL = os.environ.get("OPENAI_BASE_URL", "http://127.0.0.1:8000/v1")
MODEL = os.environ.get("DOCKCHECK_MODEL", "qwen3.6-35b-a3b-nvfp4")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Qwen3.6 is a reasoning model: it emits a thinking block before any answer, and
# `content` stays null until that block closes. At max_tokens=400 the reasoning
# alone consumed the whole budget (finish_reason="length", content=None), so every
# investigation silently fell back to the deterministic path with used_llm=False.
# Measured: this prompt needs ~2850 completion tokens to reach a verdict.
MAX_TOKENS = int(os.environ.get("DOCKCHECK_MAX_TOKENS", "4000"))
TIMEOUT_S = int(os.environ.get("DOCKCHECK_LLM_TIMEOUT", "180"))


def _chat(messages: list[dict[str, str]]) -> str | None:
    body = json.dumps({
        "model": MODEL,
        "messages": messages,
        "max_tokens": MAX_TOKENS,
        "temperature": 0,
    }).encode()
    req = urllib.request.Request(
        INFERENCE_URL.rstrip("/") + "/chat/completions",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer local",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            payload = json.loads(resp.read().decode())
        choice = payload["choices"][0]
        content = choice["message"].get("content")
        if not content:
            # Truncated mid-reasoning, or the model returned only a thinking block.
            print(
                f"[investigate] no content (finish_reason={choice.get('finish_reason')}, "
                f"completion_tokens={payload.get('usage', {}).get('completion_tokens')}); "
                f"raise DOCKCHECK_MAX_TOKENS (currently {MAX_TOKENS})"
            )
            return None
        return content
    except Exception as exc:
        print(f"[investigate] LLM call failed: {exc!r}")
        return None


def _fallback(store: Store, query: str) -> dict[str, Any]:
    orders = store.list_orders()
    flagged = [o for o in orders if o.get("status") == "flagged"]
    target = flagged[0] if flagged else (orders[0] if orders else None)
    steps = []
    if target:
        steps.append({
            "n": 1,
            "action": "search_orders",
            "hit": target.get("order_id"),
            "note": f"{target.get('item')} {target.get('quantity_received')} vs {target.get('quantity_expected')}",
        })
        for event_id in target.get("voice_event_ids") or []:
            steps.append({
                "n": len(steps) + 1,
                "action": "search_voice_events",
                "hit": event_id,
                "note": "utterance on this order",
            })
        verdict = target.get("flag_reason") or "No mismatch stored."
        citations = {
            "order_ids": [target.get("order_id")],
            "event_ids": target.get("voice_event_ids") or [],
            "doc_ids": [i for i in [target.get("po_id"), target.get("bol_id"), target.get("slip_id")] if i],
        }
    else:
        verdict = "No orders in Mongo yet. Ingest the inbox first."
        citations = {"order_ids": [], "event_ids": [], "doc_ids": []}
    return {
        "query": query,
        "steps": steps,
        "verdict": verdict,
        "citation_ids": citations,
        "used_llm": False,
    }


def run_investigation(query: str, store: Store | None = None) -> dict[str, Any]:
    store = store or Store()
    investigation_id = f"INV-{uuid.uuid4().hex[:8].upper()}"
    started = {
        "investigation_id": investigation_id,
        "query": query,
        "status": "running",
        "started_at": _now(),
        "finished_at": None,
        "steps": [],
        "verdict": None,
        "citation_ids": {},
    }
    store.insert_investigation(started)

    snapshot = {
        "orders": store.list_orders(),
        "alerts": store.list_alerts(),
    }
    llm_text = _chat([
        {
            "role": "system",
            "content": (
                "You are a receiving-dock forensics clerk. Use only the JSON snapshot; "
                "never invent ids or quantities. Reply with JSON only, no prose:\n"
                '{"steps":[{"n":1,"action":"short verb phrase",'
                '"hit":"the id you looked at, e.g. RCV-PO-4419-ROM or PACK-3301",'
                '"note":"what that record showed"}],'
                '"verdict":"one or two sentences naming the item, the two quantities, and the cause",'
                '"citation_ids":{"order_ids":[],"event_ids":[],"doc_ids":[]}}\n'
                "\"hit\" MUST be an id string copied from the snapshot, never true/false."
            ),
        },
        {"role": "user", "content": f"Query: {query}\nSnapshot: {json.dumps(snapshot, default=str)[:8000]}"},
    ])

    parsed = None
    if llm_text:
        try:
            start = llm_text.find("{")
            end = llm_text.rfind("}") + 1
            parsed = json.loads(llm_text[start:end])
        except Exception:
            parsed = None

    body = parsed if parsed else _fallback(store, query)
    done = {
        "investigation_id": investigation_id,
        "query": query,
        "status": "done",
        "started_at": started["started_at"],
        "finished_at": _now(),
        "steps": body.get("steps") or [],
        "verdict": body.get("verdict"),
        "citation_ids": body.get("citation_ids") or {},
        "used_llm": bool(parsed),
    }
    store.insert_investigation(done)
    return done
