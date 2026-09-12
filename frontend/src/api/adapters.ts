// Translate backend wire shapes into the view types the pages already use.
// The fixtures in src/assets/data were hand-written and carry a few fields the
// API does not store (industry, ai_summary); those are derived here rather than
// added to the backend, so contracts/api.json stays the single source of truth.

import type { ApiAlert, ApiEvent, ApiExpectedReceipt, ApiOrder } from "./client";
import type { OrderRow, OrderStatus } from "@/types/order";
import type { AlertCard, AlertSeverity } from "@/types/alert";
import type { ChatMessage, VoiceSession, VoiceStage } from "@/types/voice";
import type { LogsAggregateFile, StatusBreakdown } from "@/types/logs";

const ORDER_STATUSES: OrderStatus[] = [
  "awaiting",
  "pending_clarification",
  "committed",
  "flagged",
  "pending_match",
];

function toStatus(raw: string | null | undefined, fallback: OrderStatus = "pending_match"): OrderStatus {
  return ORDER_STATUSES.includes(raw as OrderStatus)
    ? (raw as OrderStatus)
    : fallback;
}

// The fixtures group by a produce category. Nothing in Mongo stores this, so
// classify from the item name and fall back to a neutral bucket.
const INDUSTRY_RULES: [RegExp, string][] = [
  [/romaine|lettuce|spinach|kale|greens|cabbage/i, "Fresh Produce & Greens"],
  [/strawberr|blueberr|raspberr|berry|berries/i, "Berries & Soft Fruit"],
  [/beef|pork|chicken|poultry|meat/i, "Meat & Poultry"],
  [/milk|cheese|yogurt|dairy|butter/i, "Dairy"],
  [/salmon|tuna|shrimp|fish|seafood/i, "Seafood"],
];

export function industryFor(item: string | null | undefined): string {
  for (const [re, label] of INDUSTRY_RULES) if (re.test(item ?? "")) return label;
  return "Unclassified";
}

const dayOf = (iso: string | null | undefined) =>
  (iso ?? "").slice(0, 10) || "unknown";

export function toOrderRow(o: ApiOrder): OrderRow {
  return {
    order_id: o.order_id,
    date: dayOf(o.created_at),
    time_process_finished: o.time_process_finished ?? o.committed_at ?? o.created_at ?? "",
    item: o.item,
    quantity_received: o.quantity_received ?? 0,
    quantity_expected: o.quantity_expected ?? 0,
    quality: o.quality ?? null,
    supplier: o.supplier ?? "unknown",
    lot_code: o.lot_code ?? "",
    industry: industryFor(o.item),
    status: toStatus(o.status),
    flagged_by: o.flagged_by ?? null,
  };
}

/**
 * A purchase-order line is a receipt the warehouse is expecting. It exists as
 * soon as the paperwork lands and stays "awaiting" until a worker checks it in,
 * which is what makes fulfilment visible rather than only completed receipts.
 */
export function expectedToOrderRow(r: ApiExpectedReceipt, order?: ApiOrder | null): OrderRow {
  const rawStatus = r.status ?? r.receipt_status ?? order?.status;
  return {
    order_id: r.order_id ?? order?.order_id ?? `${r.po_id}-${(r.sku ?? r.item ?? "").toString()}`,
    date: dayOf(order?.created_at ?? r.created_at),
    time_process_finished:
      order?.time_process_finished ??
      order?.committed_at ??
      r.time_process_finished ??
      "",
    item: r.item,
    quantity_received: r.quantity_received ?? order?.quantity_received ?? 0,
    quantity_expected: r.quantity_expected ?? r.quantity_po ?? order?.quantity_expected ?? 0,
    quality: order?.quality ?? r.quality ?? null,
    supplier: r.supplier ?? order?.supplier ?? "unknown",
    lot_code: order?.lot_code ?? r.lot_code ?? "",
    industry: industryFor(r.item),
    // Papers from the running API send `status`, not `receipt_status`.
    // An unchecked-in line is awaiting delivery, not pending match.
    status: toStatus(rawStatus, r.checked_in === false || !rawStatus ? "awaiting" : "pending_match"),
    flagged_by: order?.flagged_by ?? (r.flag_reason ? "matcher" : null),
  };
}

const SEVERITIES: AlertSeverity[] = ["critical", "warning", "info"];

function itemFromSummary(summary: string | null | undefined): string | null {
  const match = summary?.match(/([A-Za-z][A-Za-z ]{1,40}):\s*received/i);
  return match ? match[1].trim() : null;
}

/**
 * Alerts carry only a reason; lot code, supplier and item are joined from the
 * order. The summary also quotes the worker, because an alert is the outcome of
 * an exchange at the dock -- someone saying they counted 14 against a PO of 20 --
 * not a record that stands on its own.
 */
export function toAlertCard(
  a: ApiAlert,
  orders: ApiOrder[],
  events: ApiEvent[] = [],
): AlertCard {
  const order = orders.find((o) => o.order_id === a.order_id);
  const mismatch = order?.match?.mismatches?.find((m) => m.field === "quantity");
  const detail = mismatch
    ? ` Paperwork expected ${mismatch.po ?? mismatch.bol}, dock recorded ${mismatch.slip}.`
    : "";
  const item =
    order?.item || a.item || itemFromSummary(a.ai_summary) || "Unknown item";
  const supplier = order?.supplier || a.supplier || "unknown";
  const lot_code = order?.lot_code || a.lot_code || "";
  // The worker's own words, from the exchange that produced this alert.
  const spoken = events
    .filter((e) => e.kind === "voice_received")
    .filter((e) => {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      if (p.order_id && p.order_id === a.order_id) return true;
      return !!order?.lot_code && p.lot_code === order.lot_code;
    })
    .sort((x, y) => y.seq - x.seq)[0];
  const utterance = (spoken?.payload as Record<string, unknown> | undefined)?.utterance;
  const quote = typeof utterance === "string" ? ` Worker said: "${utterance}".` : "";

  const base =
    a.ai_summary ||
    `${item !== "Unknown item" ? `${item}: ` : ""}${a.reason}.${detail}`.replace(/\.\./g, ".");
  const ai_summary = `${base}${quote}`;
  return {
    alert_id: a.alert_id,
    order_id: a.order_id,
    item,
    reason: a.reason,
    ai_summary,
    created_at: a.created_at,
    lot_code,
    supplier,
    severity: SEVERITIES.includes(a.severity as AlertSeverity)
      ? (a.severity as AlertSeverity)
      : "warning",
  };
}

// ---- voice sessions -------------------------------------------------------

const STAGE_BY_KIND: Record<string, VoiceStage> = {
  agent_replied: "confirming",
  voice_received: "parsing",
  voice_parsed: "confirming",
  clarification_asked: "confirming",
  answer_received: "logging_data",
  order_committed: "done",
  order_flagged: "done",
};

const ROLE_BY_KIND: Record<string, ChatMessage["role"]> = {
  voice_received: "user",
  answer_received: "user",
  agent_replied: "agent",
  clarification_asked: "agent",
  // voice_parsed is the machine's reading of the utterance, not something the
  // agent said. It is shown as a system note rather than a spoken turn.
  voice_parsed: "system",
};

function textOf(e: ApiEvent): string {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const direct = ["reply", "utterance", "question", "answer", "text", "note", "summary"]
    .map((k) => p[k])
    .find((v) => typeof v === "string" && (v as string).trim());
  if (direct) return direct as string;

  // voice_parsed carries structured fields rather than a sentence; say what was understood.
  if (e.kind === "voice_parsed") {
    const bits = [
      p.intent && `${p.intent}`.replace(/_/g, " "),
      p.quantity != null && `${p.quantity}${p.unit ? ` ${p.unit}` : ""}`,
      p.item && `${p.item}`,
      p.lot_code && `lot ${p.lot_code}`,
      p.supplier && `from ${p.supplier}`,
    ].filter(Boolean);
    if (bits.length) return `Parsed: ${bits.join(", ")}`;
  }
  return `${e.kind.replace(/_/g, " ")}${e.entity_id ? ` (${e.entity_id})` : ""}`;
}

/** CLQ-RCV-4419-ROM -> RCV-4419-ROM */
function orderIdFromClarification(entityId: string | undefined): string | null {
  return entityId?.startsWith("CLQ-") ? entityId.slice(4) : null;
}

/**
 * Group the voice-pane event stream into one session per physical receipt.
 *
 * Voice events carry item/lot_code but no order_id, so lot code is the grouping
 * key; clarifications carry the order id in their entity id instead. Orders are
 * passed in to resolve a lot code back to the order the sidebar links to.
 */
export function toVoiceSessions(events: ApiEvent[], orders: ApiOrder[] = []): VoiceSession[] {
  const orderByLot = new Map<string, ApiOrder>();
  for (const o of orders) if (o.lot_code) orderByLot.set(o.lot_code, o);

  // Keys are stored bare and prefixed once at the end. Otherwise a thread keyed
  // by the browser ("VS-RCV-5291-LET") and the same thread keyed by its order
  // ("RCV-5291-LET") become two groups that render under one id.
  const bareKey = (value: string) => (value.startsWith("VS-") ? value.slice(3) : value);

  const keyOf = (e: ApiEvent): string => {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    // The browser tells us which conversation a turn belonged to. Trust that
    // over anything inferred: it is the only thing that knows two unresolved
    // utterances were part of the same exchange.
    if (typeof p.session_id === "string" && p.session_id) return bareKey(p.session_id);
    if (typeof p.order_id === "string" && p.order_id) return p.order_id;
    if (typeof p.lot_code === "string" && p.lot_code) {
      return orderByLot.get(p.lot_code)?.order_id ?? `lot:${p.lot_code}`;
    }
    const fromClq = orderIdFromClarification(e.entity_id);
    if (fromClq) return fromClq;
    return e.entity_id ?? "unassigned";
  };

  // voice_received has no parsed fields yet, so borrow the key from the
  // voice_parsed event that shares its entity id.
  const keyByEntity = new Map<string, string>();
  for (const e of events) {
    const k = keyOf(e);
    if (e.entity_id && !k.startsWith("lot:") && k !== e.entity_id) {
      keyByEntity.set(e.entity_id, k);
    }
  }
  const resolvedKey = (e: ApiEvent) =>
    (e.entity_id && keyByEntity.get(e.entity_id)) || keyOf(e);

  const groups = new Map<string, ApiEvent[]>();
  for (const e of events) {
    const k = resolvedKey(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }

  return [...groups.entries()]
    .map(([key, evs]) => {
      // The same utterance can be emitted twice (replay); keep one per seq.
      const ordered = [...new Map(evs.map((e) => [e.seq, e])).values()].sort(
        (a, b) => a.seq - b.seq,
      );
      const last = ordered[ordered.length - 1];
      // The same line is often emitted more than once -- a clarification is
      // re-asked on each attempt, and an answer arrives as both voice_received
      // and answer_received. Collapse repeats so the transcript reads like the
      // exchange that actually happened.
      // One spoken line produces several events -- an answer is recorded as both
      // voice_received and answer_received, a clarification is re-asked on every
      // attempt -- so the raw stream repeats itself. Keep the first occurrence of
      // each distinct line per speaker and the transcript reads like the exchange
      // that actually happened.
      const messages: ChatMessage[] = [];
      const seen = new Set<string>();
      for (const e of ordered) {
        const role = ROLE_BY_KIND[e.kind] ?? "system";
        const text = textOf(e);
        const fingerprint = `${role}:${text.trim().toLowerCase()}`;
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        messages.push({ id: `${e.seq}`, role, text, at: e.t });
      }
      // A session key may be a bare order id, a VS- prefixed one, or a browser
      // scratch id. Resolve it back to a real order however it arrived, and fall
      // back to an order id carried on the events themselves.
      const bare = bareKey(key);
      const fromEvents = ordered
        .map((e) => (e.payload ?? {}) as Record<string, unknown>)
        .map((p) => (typeof p.order_id === "string" ? p.order_id : null))
        .find(Boolean);
      const resolvedOrderId =
        orders.find((o) => o.order_id === bare)?.order_id ??
        orders.find((o) => o.order_id === fromEvents)?.order_id ??
        null;
      const isOrder = resolvedOrderId !== null;
      // A conversation is only "logged" once the receipt it produced is
      // settled. Until then it is still in progress, however many turns it has
      // taken -- and a thread with no order attached is never finished, because
      // every conversation is supposed to end at a checked-in order.
      const settledOrder = orders.find(
        (o) =>
          o.order_id === resolvedOrderId &&
          (o.status === "committed" || o.status === "flagged"),
      );
      const linkedOrder = orders.find((o) => o.order_id === resolvedOrderId);
      const firstString = (key: "item" | "supplier" | "lot_code") =>
        ordered
          .map((e) => (e.payload ?? {}) as Record<string, unknown>)
          .map((p) => p[key])
          .find((v): v is string => typeof v === "string" && v.trim().length > 0);
      // Seed events never carry a browser session_id. Those historical
      // threads already produced an order and belong under Logged
      // Conversations — otherwise every pending_clarification from the
      // week of seed data looks like a live dock session.
      const hasBrowserSession = ordered.some((e) => {
        const p = (e.payload ?? {}) as Record<string, unknown>;
        return typeof p.session_id === "string" && p.session_id.length > 0;
      });
      const stage: VoiceStage =
        settledOrder || (resolvedOrderId && !hasBrowserSession)
          ? "done"
          : STAGE_BY_KIND[last.kind] ?? "parsing";

      // Unmatched seed utterances have no order and no browser session_id.
      // They are not live dock work; leaving them in would fill In Progress.
      if (!resolvedOrderId && !hasBrowserSession) return null;

      return {
        // The browser already sends ids in VS- form; prefixing again would make
        // a second, unrelated-looking conversation out of the same thread.
        session_id: key.startsWith("VS-") ? key : `VS-${key}`,
        stage,
        messages,
        summary: messages.length ? messages[messages.length - 1].text : null,
        is_alert: isOrder
          ? orders.find((o) => o.order_id === resolvedOrderId)?.status === "flagged"
          : false,
        order_id: resolvedOrderId ?? undefined,
        item: linkedOrder?.item || firstString("item") || undefined,
        supplier: linkedOrder?.supplier || firstString("supplier") || undefined,
        lot_code: linkedOrder?.lot_code || firstString("lot_code") || undefined,
        created_at: ordered[0].t,
      };
    })
    // Every conversation is supposed to end at a checked-in order. Threads that
    // never matched one are stray audio -- test recordings, half sentences -- and
    // only clutter the log. A conversation in progress in the browser lives in
    // local state, so nothing live is lost here.
    .filter((session): session is VoiceSession => session !== null && !!session.order_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---- logs -----------------------------------------------------------------

const emptyBreakdown = (): StatusBreakdown => ({
  pending_clarification: 0,
  committed: 0,
  flagged: 0,
});

/** Roll orders up into supplier -> date -> status counts. */
export function toLogsAggregate(orders: ApiOrder[]): LogsAggregateFile {
  const manufacturers: Record<string, Record<string, StatusBreakdown>> = {};
  for (const o of orders) {
    const supplier = o.supplier ?? "unknown";
    const day = dayOf(o.created_at);
    manufacturers[supplier] ??= {};
    manufacturers[supplier][day] ??= emptyBreakdown();
    const status = toStatus(o.status);
    if (status in manufacturers[supplier][day]) {
      manufacturers[supplier][day][status as keyof StatusBreakdown] += 1;
    }
  }
  return { manufacturers, note: "live from /api/orders" };
}
