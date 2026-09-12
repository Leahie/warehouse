import { useState } from "react";
import type { StatusBreakdown } from "@/types/logs";
import { STATUS_COLORS } from "@/constants/statuses";

export type ChartBar = {
  key: string;
  label: string;
  quantities: StatusBreakdown;
};

type Props = {
  bars: ChartBar[];
  mode: "multiple" | "single" | null;
  singleManufacturerName?: string;
  showAdd?: boolean;
  onAddManufacturer?: (name: string) => void;
  availableManufacturers?: string[];
};

function totalOf(q: StatusBreakdown) {
  return q.pending_clarification + q.committed + q.flagged;
}

export function LogsChart({
  bars,
  mode,
  singleManufacturerName,
  showAdd,
  onAddManufacturer,
  availableManufacturers = [],
}: Props) {
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState("");

  const rawMax = Math.max(0, ...bars.map((bar) => totalOf(bar.quantities)));
  // Calculate clean ceiling for Y-axis (multiple of 10 or 20)
  const step = rawMax > 100 ? 50 : rawMax > 40 ? 20 : 10;
  const ceiling = Math.max(step * 3, Math.ceil((rawMax * 1.15 || step * 3) / step) * step);

  const ticks = [ceiling, Math.round(ceiling * 0.75), Math.round(ceiling * 0.5), Math.round(ceiling * 0.25), 0];

  function handleConfirmAdd() {
    if (selectedToAdd && onAddManufacturer) {
      onAddManufacturer(selectedToAdd);
      setSelectedToAdd("");
      setAddPopoverOpen(false);
    }
  }

  return (
    <div className="card-surface flex min-h-[460px] flex-1 flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-h4-default text-primary m-0 font-semibold">Volume & Quality Logs</h2>
        {mode ? (
          <span className="text-body3-default rounded-small border border-core bg-core-surface-ii px-2.5 py-1 text-secondary font-medium uppercase tracking-wider">
            Mode: {mode}
          </span>
        ) : null}
      </div>

      {bars.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-default border-2 border-dashed border-core p-8 text-center">
          <span className="text-3xl mb-2">📊</span>
          <p className="text-body1-default text-primary font-medium m-0">No chart data displayed</p>
          <p className="text-body2-default text-secondary mt-1 mb-0">
            Select a Time range and click <strong>Multiple</strong> or <strong>Single</strong> below to view bar analytics.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          {/* Main Chart Canvas with Axes */}
          <div className="relative flex flex-1">
            {/* Y-Axis Label and Ticks Column */}
            <div className="relative flex w-20 shrink-0 flex-col justify-between pr-2 text-right">
              {/* Y-Axis Title */}
              <div className="absolute -top-3 left-0 text-body3-default font-semibold text-primary">
                Quantity
              </div>

              {/* Ticks */}
              {ticks.map((tick, i) => (
                <div
                  key={tick}
                  className="text-body3-default text-tertiary font-mono text-xs flex items-center justify-end"
                  style={{
                    height: i === 0 || i === ticks.length - 1 ? 0 : "auto",
                  }}
                >
                  {tick}
                </div>
              ))}
            </div>

            {/* Plot Area with solid Y-Axis Line on Left and X-Axis Line at Bottom */}
            <div className="relative flex flex-1 flex-col">
              {/* Background Horizontal Gridlines */}
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                {ticks.map((tick, index) => (
                  <div
                    key={tick}
                    className={[
                      "w-full",
                      index === ticks.length - 1
                        ? "border-b-2 border-core-border-ii" // X-Axis solid line
                        : "border-b border-core/60 border-dashed",
                    ].join(" ")}
                  />
                ))}
              </div>

              {/* Solid Y-Axis Vertical Line */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-0 border-l-2 border-core-border-ii z-10" />

              {/* Bars Row: Placed STRICTLY directly on top of the X-axis baseline */}
              <div className="relative z-10 flex h-72 md:h-80 w-full items-end gap-4 px-4 sm:px-8">
                {bars.map((bar) => {
                  const total = totalOf(bar.quantities);
                  const heightPct = Math.min(100, Math.max(0, (total / ceiling) * 100));
                  const pendingPct = total ? (bar.quantities.pending_clarification / total) * 100 : 0;
                  const committedPct = total ? (bar.quantities.committed / total) * 100 : 0;
                  const flaggedPct = total ? (bar.quantities.flagged / total) * 100 : 0;

                  return (
                    <div
                      key={bar.key}
                      className="group relative flex flex-1 items-end justify-center min-w-16 max-w-36 h-full"
                    >
                      {/* Bar Pillar */}
                      <div
                        className="relative w-full max-w-20 overflow-hidden rounded-t-small shadow-sm transition-all duration-200 group-hover:brightness-105 group-hover:scale-[1.02]"
                        style={{
                          height: total > 0 ? `${Math.max(heightPct, 3)}%` : "3px",
                        }}
                      >
                        <div className="absolute inset-0 flex flex-col-reverse">
                          <div
                            style={{
                              height: `${committedPct}%`,
                              background: STATUS_COLORS.committed,
                            }}
                            title={`Committed: ${bar.quantities.committed}`}
                          />
                          <div
                            style={{
                              height: `${pendingPct}%`,
                              background: STATUS_COLORS.pending_clarification,
                            }}
                            title={`Pending: ${bar.quantities.pending_clarification}`}
                          />
                          <div
                            style={{
                              height: `${flaggedPct}%`,
                              background: STATUS_COLORS.flagged,
                            }}
                            title={`Flagged: ${bar.quantities.flagged}`}
                          />
                        </div>
                      </div>

                      {/* Tooltip on hover showing exact numbers and percentages */}
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 hidden w-56 -translate-x-1/2 rounded-default border border-core bg-core-surface p-3.5 shadow-xl group-hover:block animate-card-in">
                        <p className="text-body2-heavy text-primary m-0 pb-1.5 border-b border-core">
                          {bar.label}
                        </p>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-body3-default">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS.committed }} />
                              <span>Committed</span>
                            </span>
                            <span className="font-semibold text-primary">
                              {bar.quantities.committed} ({committedPct.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-body3-default">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS.pending_clarification }} />
                              <span>Pending</span>
                            </span>
                            <span className="font-semibold text-primary">
                              {bar.quantities.pending_clarification} ({pendingPct.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-body3-default">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS.flagged }} />
                              <span>Flagged</span>
                            </span>
                            <span className="font-semibold text-primary">
                              {bar.quantities.flagged} ({flaggedPct.toFixed(0)}%)
                            </span>
                          </div>
                        </div>
                        <div className="mt-2.5 pt-1.5 border-t border-core flex items-center justify-between text-body3-default text-tertiary">
                          <span>Total Volume</span>
                          <span className="font-bold text-primary">{total}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Plus (+) Button for Multiple Mode */}
                {showAdd ? (
                  <div className="relative flex items-end justify-center pb-1">
                    <button
                      type="button"
                      aria-label="Add manufacturer comparison"
                      className="flex h-11 w-11 items-center justify-center rounded-default border-2 border-dashed border-brand-green/40 bg-brand-green-soft/40 text-brand-green hover:border-brand-green hover:bg-brand-green hover:text-on-brand transition-all text-xl font-bold shadow-sm"
                      onClick={() => setAddPopoverOpen((prev) => !prev)}
                      title="Add another company to compare"
                    >
                      +
                    </button>

                    {addPopoverOpen ? (
                      <div className="animate-dropdown border-core absolute bottom-full left-0 z-40 mb-2 w-64 rounded-large border bg-core-surface p-3.5 shadow-card">
                        <div className="text-body2-heavy text-primary mb-2">Add Company to Compare</div>
                        <select
                          className="border-core text-body2-default w-full rounded-small border px-3 py-2 bg-core-surface"
                          value={selectedToAdd}
                          onChange={(e) => setSelectedToAdd(e.target.value)}
                        >
                          <option value="">Select company…</option>
                          {availableManufacturers.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            className="text-body3-default text-secondary px-2 py-1"
                            onClick={() => setAddPopoverOpen(false)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={!selectedToAdd}
                            className="text-body3-default rounded-small bg-brand-green px-3 py-1 font-semibold text-on-brand disabled:opacity-40"
                            onClick={handleConfirmAdd}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* X-Axis Tick Labels: Sitting STRICTLY BELOW the solid X-axis line */}
          <div className="flex pl-20">
            <div className="flex w-full items-start gap-4 px-4 sm:px-8 pt-2">
              {bars.map((bar) => (
                <div
                  key={bar.key}
                  className="flex flex-1 min-w-16 max-w-36 justify-center text-center"
                >
                  <span className="text-body2-default text-primary font-medium leading-snug">
                    {bar.label}
                  </span>
                </div>
              ))}
              {showAdd ? <div className="w-11 shrink-0" /> : null}
            </div>
          </div>

          {/* Centered X-Axis Title & Manufacturer Info */}
          <div className="mt-3 pl-20 text-center">
            {mode === "multiple" ? (
              <div className="text-body2-heavy text-secondary tracking-wide">
                Manufacturer Name
              </div>
            ) : mode === "single" ? (
              <div className="space-y-0.5">
                <div className="text-body2-heavy text-secondary tracking-wide">
                  Time
                </div>
                {singleManufacturerName ? (
                  <div className="text-body2-default text-primary font-medium">
                    Manufacturer: <span className="text-brand-green font-semibold">{singleManufacturerName}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="text-body3-default text-tertiary mt-6 flex flex-wrap items-center justify-center gap-6 border-t border-core/60 pt-4">
        <Legend color={STATUS_COLORS.committed} label="Committed (Green)" />
        <Legend color={STATUS_COLORS.pending_clarification} label="Pending clarification (Yellow)" />
        <Legend color={STATUS_COLORS.flagged} label="Flagged by heartbeat (Red)" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-3 w-3 rounded-small shadow-sm" style={{ background: color }} />
      <span className="font-medium text-secondary">{label}</span>
    </span>
  );
}
