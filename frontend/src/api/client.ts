// Single place that knows where the DockCheck API lives.
// Override at build/run time with VITE_DOCKCHECK_API.

export const API_BASE =
  (import.meta.env.VITE_DOCKCHECK_API as string | undefined)?.replace(/\/$/, "") ??
  "/api";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  if (!res.ok) throw new ApiError(`GET ${path} -> ${res.status}`, res.status);
  return (await res.json()) as T;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(`POST ${path} -> ${res.status}`, res.status);
  return (await res.json()) as T;
}

export async function postAudio<T>(path: string, blob: Blob, filename = "clip.wav"): Promise<T> {
  const form = new FormData();
  form.append("file", blob, filename);
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: form });
  if (!res.ok) throw new ApiError(`POST ${path} -> ${res.status}`, res.status);
  return (await res.json()) as T;
}

// ---- wire shapes, as the backend actually returns them -------------------

export type ApiOrder = {
  order_id: string;
  po_id?: string | null;
  bol_id?: string | null;
  slip_id?: string | null;
  sku?: string | null;
  item: string;
  lot_code?: string | null;
  supplier?: string | null;
  quantity_expected?: number | null;
  quantity_received?: number | null;
  quality?: string | null;
  status: string;
  flagged_by?: string | null;
  flag_reason?: string | null;
  created_at?: string | null;
  committed_at?: string | null;
  clarification_ids?: string[];
  match?: {
    mismatches?: { field: string; po?: number; bol?: number; slip?: number; voice?: number | null }[];
  } | null;
};

export type ApiExpectedReceipt = {
  po_id: string;
  bol_id?: string | null;
  slip_id?: string | null;
  supplier?: string | null;
  item: string;
  sku?: string | null;
  quantity_po?: number | null;
  quantity_bol?: number | null;
  quantity_slip?: number | null;
  order_id?: string | null;
  status?: string | null;
  receipt_status: string;
  quantity_received?: number | null;
  quantity_expected?: number | null;
  quantity_outstanding?: number | null;
  checked_in: boolean;
  flag_reason?: string | null;
};

export type ApiProgress = {
  totals: {
    purchase_orders: number;
    lines_total: number;
    lines_checked_in: number;
    quantity_expected: number;
    quantity_received: number;
    flagged_lines: number;
    percent_received: number;
  };
};

export type ApiAlert = {
  alert_id: string;
  order_id: string;
  reason: string;
  severity: string;
  created_at: string;
  acknowledged?: boolean;
  item?: string | null;
  supplier?: string | null;
  lot_code?: string | null;
  ai_summary?: string | null;
};

export type ApiEvent = {
  seq: number;
  t: string;
  kind: string;
  pane: string;
  actor?: string;
  collection?: string;
  entity_id?: string;
  payload?: Record<string, unknown>;
};

export const PAGE_SIZE = 10;

export type Page<T> = {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
};

export type ApiSupplier = {
  name: string;
  days: Record<string, { pending_clarification: number; committed: number; flagged: number }>;
};

function asPage<T>(
  items: T[],
  meta: { total?: number; offset?: number; limit?: number; has_more?: boolean },
): Page<T> {
  return {
    items,
    total: meta.total ?? items.length,
    offset: meta.offset ?? 0,
    limit: meta.limit ?? items.length,
    has_more: Boolean(meta.has_more),
  };
}

/** Voice / OpenClaw: full dump. `limit=0` means no page cap. */
export const fetchOrders = (s?: AbortSignal) =>
  getJson<{ orders: ApiOrder[] }>("/orders?limit=0", s).then((d) => d.orders ?? []);

export const fetchOrdersPage = (offset: number, limit = PAGE_SIZE, s?: AbortSignal) =>
  getJson<{
    orders: ApiOrder[];
    total: number;
    offset: number;
    limit: number;
    has_more: boolean;
  }>(`/orders?offset=${offset}&limit=${limit}`, s).then((d) => asPage(d.orders ?? [], d));

export const fetchOrderFacets = (s?: AbortSignal) =>
  getJson<{ items: string[]; suppliers: string[]; qualities: string[]; dates: string[] }>(
    "/orders/facets",
    s,
  );

export const fetchAlertsPage = (offset: number, limit = PAGE_SIZE, s?: AbortSignal) =>
  getJson<{
    alerts: ApiAlert[];
    orders: ApiOrder[];
    total: number;
    offset: number;
    limit: number;
    has_more: boolean;
  }>(`/alerts?offset=${offset}&limit=${limit}`, s).then((d) => ({
    ...asPage(d.alerts ?? [], d),
    orders: d.orders ?? [],
  }));

export const fetchSuppliersPage = (
  offset: number,
  limit = PAGE_SIZE,
  range?: { start?: string; end?: string; names?: string[] },
  s?: AbortSignal,
) => {
  const q = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (range?.start) q.set("start", range.start);
  if (range?.end) q.set("end", range.end);
  for (const name of range?.names ?? []) {
    const trimmed = name.trim();
    if (trimmed) q.append("names", trimmed);
  }
  return getJson<{
    suppliers: ApiSupplier[];
    total: number;
    offset: number;
    limit: number;
    has_more: boolean;
  }>(`/suppliers?${q}`, s).then((d) => asPage(d.suppliers ?? [], d));
};

export const fetchExpected = (s?: AbortSignal) =>
  getJson<{ papers: ApiExpectedReceipt[] }>("/papers", s).then((d) => d.papers ?? []);
export const fetchProgress = (s?: AbortSignal) => getJson<ApiProgress>("/progress", s);
export const fetchAlerts = (s?: AbortSignal) =>
  getJson<{ alerts: ApiAlert[] }>("/alerts?limit=0", s).then((d) => d.alerts ?? []);
export const fetchEvents = (pane?: string, s?: AbortSignal) =>
  getJson<{ events: ApiEvent[] }>(pane ? `/events?pane=${pane}` : "/events", s)
    .then((d) => d.events ?? []);
