"""Flag stale clarifications and compile an hourly shift log."""

from __future__ import annotations

import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from store.db import Store

STALE_MINUTES = 10
SLEEP_SECONDS = 60


def tick(store: Store | None = None) -> None:
    store = store or Store()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=STALE_MINUTES)
    for clq in store.stale_open_clarifications(cutoff):
        store.flag(
            clq["order_id"],
            reason=f"clarification {clq['clarification_id']} unanswered",
            source="heartbeat",
            actor="heartbeat",
        )
        print(f"flagged {clq['order_id']} via heartbeat")
    hour_start = now.replace(minute=0, second=0, microsecond=0)
    log_id = f"LOG-{hour_start.strftime('%Y-%m-%d-%H')}"
    flagged = sum(1 for order in store.list_orders() if order.get("status") == "flagged")
    summary = f"Hour compile at {hour_start.isoformat()}. Flagged orders: {flagged}."
    store.compile_shift_log(log_id, hour_start, now, summary)
    print(log_id)


def main() -> None:
    store = Store()
    while True:
        tick(store)
        time.sleep(SLEEP_SECONDS)


if __name__ == "__main__":
    if "--once" in sys.argv:
        tick()
    else:
        main()
