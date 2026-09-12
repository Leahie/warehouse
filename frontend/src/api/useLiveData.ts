// Infinite pages for alerts / orders / companies. Voice still polls the event stream.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAlertsPage,
  fetchEvents,
  fetchOrderFacets,
  fetchOrders,
  fetchOrdersPage,
  fetchSuppliersPage,
  PAGE_SIZE,
  type ApiAlert,
  type ApiEvent,
  type ApiOrder,
  type ApiSupplier,
  type Page,
} from "./client";
import { toAlertCard, toOrderRow, toVoiceSessions } from "./adapters";
import type { OrderRow } from "@/types/order";
import type { AlertCard } from "@/types/alert";
import type { VoiceSession } from "@/types/voice";
import type { LogsAggregateFile, StatusBreakdown } from "@/types/logs";

const POLL_MS = Number(import.meta.env.VITE_POLL_MS ?? 4000);
const MAX_SESSIONS = Number(import.meta.env.VITE_MAX_SESSIONS ?? 60);

export type Live<T> = {
  data: T;
  isLive: boolean;
  isLoading: boolean;
  error: string | null;
};

export type InfiniteLive<T> = Live<T[]> & {
  total: number;
  hasMore: boolean;
  loadMore: () => void;
};

function usePoll<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ value: T | null; error: string | null; settled: boolean }>({
    value: null,
    error: null,
    settled: false,
  });
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

function useInfinitePage<T>(opts: {
  load: (offset: number, limit: number, signal: AbortSignal) => Promise<Page<T>>;
  fallback: T[];
  idOf: (item: T) => string;
  deps?: unknown[];
  pageSize?: number;
}): InfiniteLive<T> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const busyRef = useRef(false);
  const loadRef = useRef(opts.load);
  const fallbackRef = useRef(opts.fallback);
  const idOfRef = useRef(opts.idOf);
  loadRef.current = opts.load;
  fallbackRef.current = opts.fallback;
  idOfRef.current = opts.idOf;

  const resetKey = JSON.stringify(opts.deps ?? []);

  const run = useCallback(async (replace: boolean, signal: AbortSignal) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const offset = replace ? 0 : offsetRef.current;
    try {
      const page = await loadRef.current(offset, pageSize, signal);
      if (signal.aborted) return;
      setIsLive(true);
      setError(null);
      setTotal(page.total);
      setHasMore(page.has_more);
      offsetRef.current = offset + page.items.length;
      setItems((prev) => {
        if (replace) return page.items;
        const seen = new Set(prev.map((item) => idOfRef.current(item)));
        return [...prev, ...page.items.filter((item) => !seen.has(idOfRef.current(item)))];
      });
    } catch (err) {
      if (signal.aborted) return;
      const fallback = fallbackRef.current;
      const slice = fallback.slice(offset, offset + pageSize);
      setIsLive(false);
      setError((err as Error).message);
      setTotal(fallback.length);
      setHasMore(offset + slice.length < fallback.length);
      offsetRef.current = offset + slice.length;
      setItems((prev) => (replace ? slice : [...prev, ...slice]));
    } finally {
      busyRef.current = false;
      setIsLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    offsetRef.current = 0;
    setItems([]);
    setHasMore(true);
    setIsLoading(true);
    busyRef.current = false;
    const controller = new AbortController();
    void run(true, controller.signal);
    return () => controller.abort();
  }, [resetKey, run]);

  const loadMore = useCallback(() => {
    if (!hasMore || busyRef.current || isLoading) return;
    void run(false, new AbortController().signal);
  }, [hasMore, isLoading, run]);

  return { data: items, total, hasMore, loadMore, isLive, isLoading, error };
}

export function useOrders(fallback: OrderRow[]): InfiniteLive<OrderRow> {
  return useInfinitePage({
    fallback,
    idOf: (row) => row.order_id,
    load: async (offset, limit, signal) => {
      const page = await fetchOrdersPage(offset, limit, signal);
      return { ...page, items: page.items.map(toOrderRow) };
    },
  });
}

export function useOrderFacets() {
  const { value } = usePoll(fetchOrderFacets, []);
  return value;
}

export function useAlerts(fallback: AlertCard[]): InfiniteLive<AlertCard> {
  return useInfinitePage({
    fallback,
    idOf: (row) => row.alert_id,
    load: async (offset, limit, signal) => {
      const page = await fetchAlertsPage(offset, limit, signal);
      return {
        ...page,
        items: page.items.map((alert: ApiAlert) => toAlertCard(alert, page.orders)),
      };
    },
  });
}

export function useVoiceSessions(fallback: VoiceSession[]): Live<VoiceSession[]> {
  const { value, error, settled } = usePoll<{ events: ApiEvent[]; orders: ApiOrder[] }>(
    async (s) => ({ events: await fetchEvents("voice", s), orders: await fetchOrders(s) }),
  );
  return useMemo(() => {
    const all = value ? toVoiceSessions(value.events, value.orders) : null;
    const sessions = all ? all.slice(0, MAX_SESSIONS) : null;
    return {
      data: sessions && sessions.length ? sessions : settled ? fallback : [],
      isLive: value !== null,
      isLoading: !settled,
      error,
    };
  }, [value, error, settled, fallback]);
}

const EMPTY_LOGS: LogsAggregateFile = { manufacturers: {} };

function suppliersToAggregate(rows: ApiSupplier[]): LogsAggregateFile {
  const manufacturers: Record<string, Record<string, StatusBreakdown>> = {};
  for (const row of rows) {
    manufacturers[row.name] = row.days;
  }
  return { manufacturers, note: "live from /api/suppliers" };
}

export function useLogsAggregate(
  fallback: LogsAggregateFile,
  range: { start: string; end: string },
): InfiniteLive<never> & { data: LogsAggregateFile; names: string[] } {
  const page = useInfinitePage<ApiSupplier>({
    fallback: Object.entries(fallback.manufacturers).map(([name, days]) => ({ name, days })),
    idOf: (row) => row.name,
    deps: [range.start, range.end],
    load: (offset, limit, signal) => fetchSuppliersPage(offset, limit, range, signal),
  });
  const aggregate = useMemo(() => suppliersToAggregate(page.data), [page.data]);
  return {
    ...page,
    data: page.data.length ? aggregate : page.isLoading ? EMPTY_LOGS : fallback,
    names: page.data.map((row) => row.name),
  };
}

export type { ApiOrder, ApiAlert, ApiEvent };
