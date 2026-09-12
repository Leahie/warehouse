"""Optional: wav → inbox JSON via local Whisper. Not a store writer."""

from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "inbox" / "voice"


def transcribe_bytes(data: bytes, filename: str, base: str) -> str:
    """Backwards-compatible: text only."""
    return transcribe_detailed(data, filename, base)[0]


def transcribe_detailed(data: bytes, filename: str, base: str) -> tuple[str, str | None]:
    """Transcribe and report the language Whisper heard.

    A dock is not monolingual. Asking for verbose_json costs nothing and returns
    the detected language alongside the text, which is what lets the rest of the
    pipeline answer a worker in the language they spoke.
    """
    import urllib.request

    name = Path(filename).name or "clip.wav"
    url = base.rstrip("/") + "/audio/transcriptions"
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{name}"\r\n'
        "Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + data + (
        f"\r\n--{boundary}\r\n"
        'Content-Disposition: form-data; name="response_format"\r\n\r\n'
        "verbose_json"
        f"\r\n--{boundary}--\r\n"
    ).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Authorization": "Bearer local",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode())
    if isinstance(payload, dict) and "text" in payload:
        # whisper reports the full name ("spanish"); normalise to a short code.
        raw = str(payload.get("language") or "").strip().lower()
        language = {"chinese": "zh", "mandarin": "zh", "english": "en"}.get(raw, raw[:2] or None)
        return str(payload["text"]).strip(), language
    if isinstance(payload, str):
        return payload.strip(), None
    raise RuntimeError(f"unexpected whisper response: {payload!r}")


def transcribe(wav: Path, base: str) -> str:
    return transcribe_bytes(wav.read_bytes(), wav.name, base)


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: transcribe_wav.py <wav> [worker_id]", file=sys.stderr)
        sys.exit(2)
    wav = Path(sys.argv[1])
    worker_id = sys.argv[2] if len(sys.argv) > 2 else "W-17"
    base = os.environ.get("WHISPER_BASE_URL", "http://127.0.0.1:8001/v1")
    text = transcribe(wav, base)
    event_id = f"EVT-{uuid.uuid4().hex[:8].upper()}"
    doc = {
        "event_id": event_id,
        "worker_id": worker_id,
        "time_start": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "time_end": None,
        "utterance": text,
        "parsed": None,
        "parse_confidence": None,
        "order_id": None,
        "ingest_channel": "whisper_local",
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dest = OUT_DIR / f"{event_id}.json"
    dest.write_text(json.dumps(doc, indent=2) + "\n")
    print(dest)


if __name__ == "__main__":
    main()
