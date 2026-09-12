import type { AlertSeverity } from "@/types/alert";

export type AlertStats = {
  total: number;
  topIssue: string | null;
  topSupplier: string | null;
  critical: number;
  warning: number;
  info: number;
};

export type SeverityFilter = AlertSeverity | "all";

type Props = {
  stats: AlertStats;
  selectedDay: string;
  onDayChange: (day: string) => void;
  minDay: string;
  maxDay: string;
  severity: SeverityFilter;
  onSeverityChange: (severity: SeverityFilter) => void;
};

const SEVERITY_CHIPS: { id: SeverityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "warning", label: "Warning" },
  { id: "info", label: "Info" },
];

function countFor(id: SeverityFilter, stats: AlertStats) {
  if (id === "all") return stats.total;
  return stats[id];
}

export function AlertSummary({
  stats,
  selectedDay,
  onDayChange,
  minDay,
  maxDay,
  severity,
  onSeverityChange,
}: Props) {
  return (
    <div className="card-surface flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-body2-default text-secondary">Severity</span>
          <div className="flex overflow-hidden rounded-small border border-core">
            {SEVERITY_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={[
                  "text-body2-heavy px-3 py-2",
                  severity === chip.id
                    ? "bg-brand-green text-on-brand"
                    : "bg-core-surface text-primary hover:bg-core-surface-ii",
                ].join(" ")}
                onClick={() => onSeverityChange(chip.id)}
                aria-pressed={severity === chip.id}
              >
                {chip.label} {countFor(chip.id, stats)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            className={[
              "text-body2-heavy rounded-small border px-3 py-2",
              selectedDay
                ? "border-core bg-core-surface text-primary hover:bg-core-surface-ii"
                : "border-brand-green bg-brand-green text-on-brand",
            ].join(" ")}
            onClick={() => onDayChange("")}
          >
            All days
          </button>
          <label className="flex flex-col gap-1">
            <span className="text-body2-default text-secondary">Day</span>
            <input
              type="date"
              className="border-core text-body2-default rounded-small border px-3 py-2"
              value={selectedDay}
              min={minDay}
              max={maxDay}
              onChange={(e) => onDayChange(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total issues" value={String(stats.total)} />
        <StatTile label="Most common issue" value={stats.topIssue ?? "—"} />
        <StatTile label="Shipping company" value={stats.topSupplier ?? "—"} />
        <div className="rounded-small bg-core-surface-ii/70 px-3 py-2.5">
          <p className="text-body3-default text-tertiary m-0">Severity mix</p>
          <p className="text-body2-heavy text-primary mt-1 mb-0 flex flex-wrap gap-x-3 gap-y-1">
            <span>
              <span className="text-negative">{stats.critical}</span> critical
            </span>
            <span>
              <span className="text-warning">{stats.warning}</span> warning
            </span>
            <span>
              <span className="text-secondary">{stats.info}</span> info
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-small bg-core-surface-ii/70 px-3 py-2.5">
      <p className="text-body3-default text-tertiary m-0">{label}</p>
      <p className="text-h5-default text-primary mt-1 mb-0 line-clamp-2" title={value}>
        {value}
      </p>
    </div>
  );
}
