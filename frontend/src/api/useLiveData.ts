// Polling hooks. Each returns live API data, or the bundled fixture when the
// API is unreachable, so the UI still renders on a laptop with no backend.

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAlerts, fetchEvents, fetchOrders, type ApiAlert, type ApiEvent, type ApiOrder } from "./client";
import { toAlertCard, toLogsAggregate, toOrderRow, toVoiceSessions } from "./adapters";
import type { OrderRow } from "@/types/order";
import type { AlertCard } from "@/types/alert";
import type { VoiceSession } from "@/types/voice";
import type { LogsAggregateFile } from "@/types/logs";

const POLL_MS = Number(import.meta.env.VITE_POLL_MS ?? 4000);

export type Live<T> = {
  data: T;
  /** true once a real API response has been applied */
  isLive: boolean;
  error: string | null;
};

function usePoll<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ value: T | null; error: string | null }>({
    value: null,
    error: null,
  });
  // Keep the loader in a ref so a new closure each render does not restart the timer.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const tick = async () => {
      try {
        const value = await loadRef.current(controller.signal);
        if (!cancelled) setState({ value, error: null });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setState((prev) => ({ ...prev, error: (err as Error).message }));
      }
    };

    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

export function useOrders(fallback: OrderRow[]): Live<OrderRow[]> {
  const { value, error } = usePoll<ApiOrder[]>((s) => fetchOrders(s));
  return useMemo(
    () => ({
      data: value ? value.map(toOrderRow) : fallback,
      isLive: value !== null,
      error,
    }),
    [value, error, fallback],
  );
}

export function useAlerts(fallback: AlertCard[]): Live<AlertCard[]> {
  const { value, error } = usePoll<{ alerts: ApiAlert[]; orders: ApiOrder[] }>(
    async (s) => ({ alerts: await fetchAlerts(s), orders: await fetchOrders(s) }),
  );
  return useMemo(
    () => ({
      data: value ? value.alerts.map((a) => toAlertCard(a, value.orders)) : fallback,
      isLive: value !== null,
      error,
    }),
    [value, error, fallback],
  );
}

export function useVoiceSessions(fallback: VoiceSession[]): Live<VoiceSession[]> {
  const { value, error } = usePoll<{ events: ApiEvent[]; orders: ApiOrder[] }>(
    async (s) => ({ events: await fetchEvents("voice", s), orders: await fetchOrders(s) }),
  );
  return useMemo(() => {
    const sessions = value ? toVoiceSessions(value.events, value.orders) : null;
    return {
      // An empty event stream is a valid live answer, but the demo reads better
      // seeded, so fall back until the dock actually says something.
      data: sessions && sessions.length ? sessions : fallback,
      isLive: value !== null,
      error,
    };
  }, [value, error, fallback]);
}

export function useLogsAggregate(fallback: LogsAggregateFile): Live<LogsAggregateFile> {
  const { value, error } = usePoll<ApiOrder[]>((s) => fetchOrders(s));
  return useMemo(
    () => ({
      data: value && value.length ? toLogsAggregate(value) : fallback,
      isLive: value !== null,
      error,
    }),
    [value, error, fallback],
  );
}
