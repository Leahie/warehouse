import { STATUS_LABELS } from "@/constants/statuses";
import type { OrderStatus } from "@/types/order";

type Props = {
  status: OrderStatus;
  flaggedBy?: string | null;
};

export function StatusChip({ status, flaggedBy }: Props) {
  const label =
    status === "flagged" && flaggedBy
      ? `Flagged by ${flaggedBy.replaceAll("_", " ")}`
      : STATUS_LABELS[status];

  const color =
    status === "pending_clarification"
      ? "var(--color-status-pending)"
      : status === "committed"
        ? "var(--color-status-committed)"
        : status === "flagged"
          ? "var(--color-status-flagged)"
          : "var(--color-text-tertiary)";

  return (
    <span
      className="text-body3-default inline-flex items-center gap-1.5 rounded-small px-2 py-1"
      style={{ background: `${color}22`, color }}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
