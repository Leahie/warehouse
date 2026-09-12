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

export type ApiAlert = {
  alert_id: string;
  order_id: string;
  reason: string;
  severity: string;
  created_at: string;
  acknowledged?: boolean;
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

export const fetchOrders = (s?: AbortSignal) =>
  getJson<{ orders: ApiOrder[] }>("/orders", s).then((d) => d.orders ?? []);
export const fetchAlerts = (s?: AbortSignal) =>
  getJson<{ alerts: ApiAlert[] }>("/alerts", s).then((d) => d.alerts ?? []);
export const fetchEvents = (pane?: string, s?: AbortSignal) =>
  getJson<{ events: ApiEvent[] }>(pane ? `/events?pane=${pane}` : "/events", s)
    .then((d) => d.events ?? []);
