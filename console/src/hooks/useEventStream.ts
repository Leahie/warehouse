import { useEffect, useState } from "react";
import { fetchEvents, type PipelineEvent } from "./useEvents";

export function useEventStream(pane?: string, ms = 1000) {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  useEffect(() => {
    let after = 0;
    let cancelled = false;
    async function tick() {
      const batch = await fetchEvents(after, pane);
      if (cancelled || batch.length === 0) return;
      after = batch[batch.length - 1].seq;
      setEvents((prev) => [...prev, ...batch]);
    }
    tick();
    const id = window.setInterval(tick, ms);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pane, ms]);
  return events;
}
