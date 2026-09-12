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
