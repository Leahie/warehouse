import type { StatusBreakdown } from "@/types/logs";
import { STATUS_COLORS } from "@/constants/statuses";

export type ChartBar = {
  key: string;
  label: string;
  quantities: StatusBreakdown;
};

type Props = {
  bars: ChartBar[];
  showAdd?: boolean;
  onAdd?: () => void;
};

function totalOf(q: StatusBreakdown) {
  return q.pending_clarification + q.committed + q.flagged;
}

export function LogsChart({ bars, showAdd, onAdd }: Props) {
  const max = Math.max(1, ...bars.map((bar) => totalOf(bar.quantities)));

  return (
    <div className="card-surface flex min-h-[360px] flex-1 flex-col p-6">
      <div className="text-h5-default text-primary mb-4">Logs</div>

      {bars.length === 0 ? (
        <div className="text-body1-default text-secondary flex flex-1 items-center justify-center">
          Set a time range and choose Multiple or Single to load logs.
        </div>
      ) : (
        <div className="flex flex-1 items-end gap-6 overflow-x-auto px-2 pb-2">
          <div className="text-body3-default text-tertiary flex w-8 items-center justify-center self-stretch">
            <span className="-rotate-90 whitespace-nowrap"># Quantity</span>
          </div>

          {bars.map((bar) => {
            const total = totalOf(bar.quantities);
            const heightPct = (total / max) * 100;
            const pendingPct = total ? (bar.quantities.pending_clarification / total) * 100 : 0;
            const committedPct = total ? (bar.quantities.committed / total) * 100 : 0;
            const flaggedPct = total ? (bar.quantities.flagged / total) * 100 : 0;

            return (
              <div key={bar.key} className="group relative flex w-20 flex-col items-center">
                <div
                  className="relative w-14 overflow-hidden rounded-t-small"
                  style={{ height: `${Math.max(heightPct, 4)}%`, minHeight: 24 }}
                  title=""
                >
                  <div className="absolute inset-0 flex flex-col-reverse">
                    <div
                      style={{
                        height: `${committedPct}%`,
                        background: STATUS_COLORS.committed,
                      }}
                    />
                    <div
                      style={{
                        height: `${pendingPct}%`,
                        background: STATUS_COLORS.pending_clarification,
                      }}
                    />
                    <div
                      style={{
                        height: `${flaggedPct}%`,
                        background: STATUS_COLORS.flagged,
                      }}
                    />
                  </div>

                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-48 -translate-x-1/2 rounded-default border border-core bg-core-surface p-3 shadow-card group-hover:block">
                    <p className="text-body2-heavy text-primary m-0 mb-2">{bar.label}</p>
                    <p className="text-body3-default text-secondary m-0">
                      Committed {bar.quantities.committed} ({committedPct.toFixed(0)}%)
                    </p>
                    <p className="text-body3-default text-secondary m-0">
                      Pending {bar.quantities.pending_clarification} ({pendingPct.toFixed(0)}%)
                    </p>
                    <p className="text-body3-default text-secondary m-0">
                      Flagged {bar.quantities.flagged} ({flaggedPct.toFixed(0)}%)
                    </p>
                    <p className="text-body3-default text-tertiary mt-2 mb-0">Total {total}</p>
                  </div>
                </div>
                <span className="text-body3-default text-tertiary mt-2 text-center">{bar.label}</span>
              </div>
            );
          })}

          {showAdd ? (
            <button
              type="button"
              aria-label="Add manufacturer"
              className="border-core text-h3-default text-brand-brown mb-6 flex h-12 w-12 items-center justify-center rounded-small border bg-core-surface-ii hover:bg-brand-green-soft"
              style={{ color: "var(--color-brand-brown)" }}
              onClick={onAdd}
            >
              +
            </button>
          ) : null}
        </div>
      )}

      <div className="text-body3-default text-tertiary mt-4 flex flex-wrap gap-4">
        <Legend color={STATUS_COLORS.committed} label="Committed" />
        <Legend color={STATUS_COLORS.pending_clarification} label="Pending clarification" />
        <Legend color={STATUS_COLORS.flagged} label="Flagged by heartbeat" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-small" style={{ background: color }} />
      {label}
    </span>
  );
}
