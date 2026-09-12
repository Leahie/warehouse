import type { OrderStatus } from "@/types/order";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  // Paperwork is on file; nothing has arrived at the dock yet.
  awaiting: "Awaiting delivery",
  pending_clarification: "Pending clarification",
  committed: "Committed",
  flagged: "Flagged by heartbeat",
  pending_match: "Pending match",
};

export const STATUS_COLORS = {
  awaiting: "var(--color-text-tertiary)",
  pending_clarification: "var(--color-status-pending)",
  committed: "var(--color-status-committed)",
  flagged: "var(--color-status-flagged)",
} as const;

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
