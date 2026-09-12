// Orders/alerts page through the API and poll to refresh the loaded prefix.
// Voice still polls the full event stream.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAlertsPage,
  fetchEvents,
  fetchExpected,
  fetchOrderFacets,
  fetchOrders,
  fetchOrdersPage,
  fetchProgress,
  fetchSuppliersPage,
  PAGE_SIZE,
  type ApiAlert,
  type ApiEvent,
  type ApiExpectedReceipt,
  type ApiOrder,
  type ApiProgress,
  type ApiSupplier,
  type Page,
} from "./client";
import { expectedToOrderRow, industryFor, toAlertCard, toOrderRow, toVoiceSessions } from "./adapters";
import type { OrderRow } from "@/types/order";
import type { AlertCard } from "@/types/alert";
import type { VoiceSession } from "@/types/voice";
import type { LogsAggregateFile, StatusBreakdown } from "@/types/logs";

const POLL_MS = Number(import.meta.env.VITE_POLL_MS ?? 4000);
const MAX_SESSIONS = Number(import.meta.env.VITE_MAX_SESSIONS ?? 60);
/** Matches backend `_page()` cap in `backend/api/main.py`. */
const MAX_PAGE_LIMIT = 100;

function uniqueById<T>(items: T[], idOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = idOf(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

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
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const genRef = useRef(0);
  const loadedRef = useRef(0);
  const loadRef = useRef(opts.load);
  const fallbackRef = useRef(opts.fallback);
  const idOfRef = useRef(opts.idOf);
  loadRef.current = opts.load;
  fallbackRef.current = opts.fallback;
  idOfRef.current = opts.idOf;
  loadedRef.current = items.length;

  const resetKey = JSON.stringify(opts.deps ?? []);
  const hasMore = items.length < total;

  const run = useCallback(
    async (mode: "replace" | "append" | "refresh", signal: AbortSignal, gen: number) => {
      if (busyRef.current) return;
      busyRef.current = true;
      if (mode !== "refresh") setIsLoading(true);

      const offset = mode === "append" ? loadedRef.current : 0;
      const limit =
        mode === "refresh"
          ? Math.min(Math.max(loadedRef.current, pageSize), MAX_PAGE_LIMIT)
          : pageSize;

      try {
        const page = await loadRef.current(offset, limit, signal);
        if (signal.aborted || gen !== genRef.current) return;
        const idOf = idOfRef.current;
        const incoming = uniqueById(page.items, idOf);
        setIsLive(true);
        setError(null);
        setTotal(page.total);
        setItems((prev) => {
          if (mode !== "append") return incoming;
          const seen = new Set(prev.map(idOf));
          return [...prev, ...incoming.filter((item) => !seen.has(idOf(item)))];
        });
      } catch (err) {
        if (signal.aborted || gen !== genRef.current) return;
        setError((err as Error).message);
        // A failed load-more must not glue fixture rows onto a live page — that
        // is what produced "Showing 16 of 8 orders" (8 live + 8 fallback).
        if (mode !== "replace") return;
        const fallback = fallbackRef.current;
        setIsLive(false);
        setTotal(fallback.length);
        setItems(uniqueById(fallback.slice(0, pageSize), idOfRef.current));
      } finally {
        if (gen === genRef.current) {
          busyRef.current = false;
          if (mode !== "refresh") setIsLoading(false);
        }
      }
    },
    [pageSize],
  );

  useEffect(() => {
    const gen = ++genRef.current;
    setItems([]);
    setTotal(0);
    setIsLoading(true);
    busyRef.current = false;
    const controller = new AbortController();
    void run("replace", controller.signal, gen);
    return () => controller.abort();
  }, [resetKey, run]);

  useEffect(() => {
    const controller = new AbortController();
    const id = window.setInterval(() => {
      if (busyRef.current) return;
      void run("refresh", controller.signal, genRef.current);
    }, POLL_MS);
    return () => {
      window.clearInterval(id);
      controller.abort();
    };
  }, [resetKey, run]);

  const loadMore = useCallback(() => {
    if (!hasMore || busyRef.current || isLoading) return;
    void run("append", new AbortController().signal, genRef.current);
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

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

/** Distinct filter lists from GET /orders/facets — companies, items, industries, etc. */
export function useFacetOptions() {
  const facets = useOrderFacets();
  return useMemo(() => {
    const items = uniqueSorted(facets?.items ?? []);
    const suppliers = uniqueSorted(facets?.suppliers ?? []);
    const qualities = uniqueSorted(facets?.qualities ?? []);
    const dates = facets?.dates ?? [];
    const industries = uniqueSorted(items.map((item) => industryFor(item)));
    return {
      items,
      suppliers,
      qualities,
      dates,
      industries,
      loaded: Boolean(facets),
    };
  }, [facets]);
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

/** Full alert set for the summary strip — not the paged feed. `limit=0` skips the page cap. */
export function useAllAlerts(fallback: AlertCard[]): Live<AlertCard[]> {
  const { value, error, settled } = usePoll<AlertCard[]>(async (signal) => {
    const page = await fetchAlertsPage(0, 0, signal);
    return page.items.map((alert: ApiAlert) => toAlertCard(alert, page.orders));
  }, []);

  return useMemo(
    () => ({
      data: value ?? (settled ? fallback : []),
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

function fallbackForNames(fallback: LogsAggregateFile, names: string[]): LogsAggregateFile {
  const manufacturers: Record<string, Record<string, StatusBreakdown>> = {};
  for (const raw of names) {
    const resolved = Object.keys(fallback.manufacturers).find(
      (n) => n.toLowerCase() === raw.trim().toLowerCase(),
    );
    if (resolved) manufacturers[resolved] = fallback.manufacturers[resolved];
  }
  return { manufacturers, note: "fixture fallback" };
}

export function useLogsAggregate(
  fallback: LogsAggregateFile,
  range: { start: string; end: string },
  names: string[],
): Live<LogsAggregateFile> {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  const nameKey = cleaned.join("\0");
  const { value, error, settled } = usePoll<ApiSupplier[]>(
    async (signal) => {
      if (!cleaned.length) return [];
      const page = await fetchSuppliersPage(
        0,
        Math.max(cleaned.length, 1),
        { start: range.start, end: range.end, names: cleaned },
        signal,
      );
      return page.items;
    },
    [range.start, range.end, nameKey],
  );

  return useMemo(() => {
    const currentNames = nameKey ? nameKey.split("\0") : [];
    const matching =
      value?.filter((row) =>
        currentNames.some((name) => name.toLowerCase() === row.name.toLowerCase()),
      ) ?? null;
    const complete =
      matching !== null &&
      currentNames.every((name) =>
        matching.some((row) => row.name.toLowerCase() === name.toLowerCase()),
      );
    return {
      data: complete
        ? suppliersToAggregate(matching)
        : settled && value === null
          ? fallbackForNames(fallback, currentNames)
          : EMPTY_LOGS,
      isLive: complete,
      isLoading: !settled || !complete,
      error,
    };
  }, [value, error, settled, fallback, nameKey]);
}

export type { ApiOrder, ApiAlert, ApiEvent };
