// Polling hooks. Each returns live API data, or the bundled fixture when the
// API is unreachable, so the UI still renders on a laptop with no backend.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAlerts,
  fetchEvents,
  fetchExpected,
  fetchOrders,
  fetchProgress,
  type ApiAlert,
  type ApiEvent,
  type ApiExpectedReceipt,
  type ApiOrder,
  type ApiProgress,
} from "./client";
import { expectedToOrderRow, toAlertCard, toLogsAggregate, toOrderRow, toVoiceSessions } from "./adapters";
import type { OrderRow } from "@/types/order";
import type { AlertCard } from "@/types/alert";
import type { VoiceSession } from "@/types/voice";
import type { LogsAggregateFile } from "@/types/logs";

const POLL_MS = Number(import.meta.env.VITE_POLL_MS ?? 4000);

// The dock accumulates thousands of voice events over a shift. The sidebar only
// ever shows recent activity, so cap it rather than rendering every session.
const MAX_SESSIONS = Number(import.meta.env.VITE_MAX_SESSIONS ?? 60);

export type Live<T> = {
  data: T;
  /** true once a real API response has been applied */
  isLive: boolean;
  /** true until the first request settles, either way */
  isLoading: boolean;
  error: string | null;
};

function usePoll<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []) {
  // `settled` separates "still asking" from "asked and got nothing". Without it
  // the fallback fixtures paint first and are then replaced by live data, which
  // reads as the UI changing its mind.
  const [state, setState] = useState<{ value: T | null; error: string | null; settled: boolean }>({
    value: null,
    error: null,
    settled: false,
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
        if (!cancelled) setState({ value, error: null, settled: true });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setState((prev) => ({ ...prev, error: (err as Error).message, settled: true }));
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
  const { value, error, settled } = usePoll<ApiOrder[]>((s) => fetchOrders(s));
  return useMemo(
    () => ({
      data: value ? value.map(toOrderRow) : settled ? fallback : [],
      isLive: value !== null,
      isLoading: !settled,
      error,
    }),
    [value, error, settled, fallback],
  );
}

/**
 * Every line the warehouse is expecting, checked in or not. The orders endpoint
 * only knows about receipts a worker has already spoken for, which makes an
 * empty dock look like an empty database.
 */
export function useExpectedReceipts(fallback: OrderRow[]): Live<OrderRow[]> {
  const { value, error, settled } = usePoll<ApiExpectedReceipt[]>((s) => fetchExpected(s));
  return useMemo(
    () => ({
      data: value ? value.map(expectedToOrderRow) : settled ? fallback : [],
      isLive: value !== null,
      isLoading: !settled,
      error,
    }),
    [value, error, settled, fallback],
  );
}

export function useProgress(): Live<ApiProgress | null> {
  const { value, error, settled } = usePoll<ApiProgress>((s) => fetchProgress(s));
  return useMemo(
    () => ({ data: value, isLive: value !== null, isLoading: !settled, error }),
    [value, error, settled],
  );
}

export function useAlerts(fallback: AlertCard[]): Live<AlertCard[]> {
  const { value, error, settled } = usePoll<{ alerts: ApiAlert[]; orders: ApiOrder[] }>(
    async (s) => ({ alerts: await fetchAlerts(s), orders: await fetchOrders(s) }),
  );
  return useMemo(
    () => ({
      data: value
        ? value.alerts.map((a) => toAlertCard(a, value.orders))
        : settled
          ? fallback
          : [],
      isLive: value !== null,
      isLoading: !settled,
      error,
    }),
    [value, error, settled, fallback],
  );
}

export function useVoiceSessions(fallback: VoiceSession[]): Live<VoiceSession[]> {
  const { value, error, settled } = usePoll<{ events: ApiEvent[]; orders: ApiOrder[] }>(
    async (s) => ({ events: await fetchEvents("voice", s), orders: await fetchOrders(s) }),
  );
  return useMemo(() => {
    const all = value ? toVoiceSessions(value.events, value.orders) : null;
    const sessions = all ? all.slice(0, MAX_SESSIONS) : null;
    return {
      // An empty event stream is a valid live answer; only seed when the API
      // could not be reached at all.
      data: sessions && sessions.length ? sessions : settled ? fallback : [],
      isLive: value !== null,
      isLoading: !settled,
      error,
    };
  }, [value, error, settled, fallback]);
}

const EMPTY_LOGS: LogsAggregateFile = { manufacturers: {} };

export function useLogsAggregate(fallback: LogsAggregateFile): Live<LogsAggregateFile> {
  const { value, error, settled } = usePoll<ApiOrder[]>((s) => fetchOrders(s));
  return useMemo(
    () => ({
      data: value && value.length ? toLogsAggregate(value) : settled ? fallback : EMPTY_LOGS,
      isLive: value !== null,
      isLoading: !settled,
      error,
    }),
    [value, error, settled, fallback],
  );
}
