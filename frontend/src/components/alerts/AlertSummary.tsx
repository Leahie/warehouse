import { DatePicker } from "@/components/DatePicker";
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

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  critical: "var(--color-status-flagged)",
  warning: "var(--color-status-pending)",
  info: "var(--color-text-positive)",
};

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
            {SEVERITY_CHIPS.map((chip) => {
              const active = severity === chip.id;
              const tone = chip.id === "all" ? undefined : SEVERITY_COLOR[chip.id];
              return (
                <button
                  key={chip.id}
                  type="button"
                className={[
                  "text-body2-heavy px-3 py-2",
                  active ? "" : "bg-core-surface text-primary hover:bg-core-surface-ii",
                ].join(" ")}
                  style={
                    active
                      ? {
                          background: tone ?? "var(--color-brand-green)",
                          color:
                            chip.id === "warning"
                              ? "var(--color-text-primary)"
                              : "var(--color-text-on-brand)",
                        }
                      : undefined
                  }
                  onClick={() => onSeverityChange(chip.id)}
                  aria-pressed={active}
                >
                  {chip.label}{" "}
                  <span style={!active && tone ? { color: tone } : undefined}>
                    {countFor(chip.id, stats)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-body2-default text-secondary">Day</span>
          <DatePicker
            value={selectedDay}
            onChange={onDayChange}
            min={minDay}
            max={maxDay}
            allowAll
            allLabel="All days"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total issues" value={String(stats.total)} />
        <StatTile label="Most common issue" value={stats.topIssue ?? "—"} />
        <StatTile label="Shipping company" value={stats.topSupplier ?? "—"} />
        <div className="rounded-small bg-core-surface-ii/70 px-3 py-3">
          <p className="text-body3-default text-tertiary m-0">Severity mix</p>
          <p className="text-primary mt-1 mb-0 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="flex items-baseline gap-1.5">
              <span
                className="text-h2-default leading-none"
                style={{ color: SEVERITY_COLOR.critical }}
              >
                {stats.critical}
              </span>
              <span className="text-body2-default text-secondary">critical</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span
                className="text-h2-default leading-none"
                style={{ color: SEVERITY_COLOR.warning }}
              >
                {stats.warning}
              </span>
              <span className="text-body2-default text-secondary">warning</span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span
                className="text-h2-default leading-none"
                style={{ color: SEVERITY_COLOR.info }}
              >
                {stats.info}
              </span>
              <span className="text-body2-default text-secondary">info</span>
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-small bg-core-surface-ii/70 px-3 py-3">
      <p className="text-body3-default text-tertiary m-0">{label}</p>
      <p className="text-h2-default text-primary mt-1.5 mb-0 line-clamp-2 leading-7" title={value}>
        {value}
      </p>
    </div>
  );
}
