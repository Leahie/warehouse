export type PipelineEvent = {
  seq: number;
  t?: string;
  kind: string;
  pane: string;
  actor: string;
  collection: string;
  entity_id: string;
  payload: Record<string, unknown>;
};

export type Order = {
  order_id: string;
  item?: string;
  po_id?: string;
  status?: string;
  quantity_received?: number;
  quantity_expected?: number;
  flag_reason?: string;
  worker_id?: string;
};

export type Alert = {
  alert_id: string;
  order_id: string;
  severity?: string;
  reason?: string;
  created_at?: string;
  acknowledged?: boolean;
};

export type PaperRow = {
  po_id: string;
  bol_id?: string;
  slip_id?: string;
  supplier?: string;
  item?: string;
  sku?: string;
  quantity_po?: number;
  quantity_bol?: number;
  quantity_slip?: number | null;
  po_vs_bol?: string;
  papers_vs_slip?: string;
  order_id?: string;
  status?: string;
  quantity_received?: number;
  quantity_expected?: number;
  flag_reason?: string;
};

async function loadFixture(): Promise<PipelineEvent[]> {
  const res = await fetch("/events.fixture.json");
  if (!res.ok) return [];
  return res.json();
}

export async function fetchEvents(after: number, pane?: string): Promise<PipelineEvent[]> {
  const params = new URLSearchParams({ after: String(after) });
  if (pane) params.set("pane", pane);
  try {
    const res = await fetch(`/api/events?${params.toString()}`);
    if (!res.ok) throw new Error("api down");
    const body = await res.json();
    const rows = (body.events || []) as PipelineEvent[];
    if (rows.length > 0 || after > 0) return rows;
    const fixture = await loadFixture();
    return fixture.filter((row) => row.seq > after && (!pane || row.pane === pane));
  } catch {
    const fixture = await loadFixture();
    return fixture.filter((row) => row.seq > after && (!pane || row.pane === pane));
  }
}

export async function fetchOrders(): Promise<Order[]> {
  try {
    const res = await fetch("/api/orders");
    if (!res.ok) return [];
    const body = await res.json();
    return (body.orders || []) as Order[];
  } catch {
    return [];
  }
}

export async function fetchAlerts(): Promise<Alert[]> {
  try {
    const res = await fetch("/api/alerts");
    if (!res.ok) return [];
    const body = await res.json();
    return (body.alerts || []) as Alert[];
  } catch {
    return [];
  }
}

export async function fetchPapers(): Promise<PaperRow[]> {
  try {
    const res = await fetch("/api/papers");
    if (!res.ok) return [];
    const body = await res.json();
    return (body.papers || []) as PaperRow[];
  } catch {
    return [];
  }
}
