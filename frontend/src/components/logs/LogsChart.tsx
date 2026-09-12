import { useState } from "react";
import type { StatusBreakdown } from "@/types/logs";
import { STATUS_COLORS } from "@/constants/statuses";

export type ChartBar = {
  key: string;
  label: string;
  quantities: StatusBreakdown;
};

export type ChartGroup = {
  key: string;
  label: string;
  bars: ChartBar[];
};

export type ChartPoint = {
  key: string;
  label: string;
  quantities: StatusBreakdown;
};

type Props = {
  groups: ChartGroup[];
  points: ChartPoint[];
  mode: "multiple" | "single" | null;
  singleManufacturerName?: string;
  isLoading?: boolean;
};

const BAR_W = 80;
const BAR_GAP = 10;
const DAY_GAP = 64;
const PLOT_H_CLASS = "h-80";
const PLOT_H = 320;
const LINE_COL_W = 96;

function totalOf(q: StatusBreakdown) {
  return q.pending_clarification + q.committed + q.flagged;
}

function yCeiling(values: number[]) {
  const rawMax = Math.max(0, ...values);
  const step = rawMax > 100 ? 50 : rawMax > 40 ? 20 : 10;
  return Math.max(step * 3, Math.ceil((rawMax * 1.15 || step * 3) / step) * step);
}

function clusterWidth(barCount: number) {
  if (barCount <= 0) return BAR_W;
  return barCount * BAR_W + Math.max(0, barCount - 1) * BAR_GAP;
}

export function LogsChart({ groups, points, mode, singleManufacturerName, isLoading }: Props) {
  const barTotals = groups.flatMap((group) => group.bars.map((bar) => totalOf(bar.quantities)));
  const lineTotals = points.flatMap((point) => [
    point.quantities.committed,
    point.quantities.pending_clarification,
    point.quantities.flagged,
  ]);
  const ceiling = yCeiling(mode === "single" ? lineTotals : barTotals);
  const ticks = [ceiling, Math.round(ceiling * 0.75), Math.round(ceiling * 0.5), Math.round(ceiling * 0.25), 0];
  const empty = mode === "single" ? points.length === 0 : groups.length === 0;

  return (
    <div className="card-surface flex min-h-[460px] min-w-0 flex-1 flex-col overflow-hidden p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-h4-default text-primary m-0 font-semibold">Volume & Quality Logs</h2>
        {mode ? (
          <span className="text-body3-default rounded-small border border-core bg-core-surface-ii px-2.5 py-1 text-secondary font-medium uppercase tracking-wider">
            Mode: {mode}
          </span>
        ) : null}
      </div>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-default border-2 border-dashed border-core p-8 text-center">
          <span className="text-3xl mb-2">📊</span>
          <p className="text-body1-default text-primary font-medium m-0">
            {isLoading ? "Loading chart data" : "No chart data displayed"}
          </p>
          <p className="text-body2-default text-secondary mt-1 mb-0">
            {isLoading
              ? "Fetching orders for the selected companies and dates."
              : "Select a time range and choose Multiple or Single above to view analytics."}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 min-w-0 flex-1">
            <YAxis ticks={ticks} />
            <div className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
              {mode === "single" ? (
                <LinePlot points={points} ceiling={ceiling} ticks={ticks} />
              ) : (
                <GroupedBars groups={groups} ceiling={ceiling} ticks={ticks} />
              )}
            </div>
          </div>

          <div className="mt-3 pl-20 text-center">
            {mode === "multiple" ? (
              <div className="text-body2-heavy text-secondary tracking-wide">Date</div>
            ) : (
              <div className="space-y-0.5">
                <div className="text-body2-heavy text-secondary tracking-wide">Date</div>
                {singleManufacturerName ? (
                  <div className="text-body2-default text-primary font-medium">
                    Manufacturer:{" "}
                    <span className="text-brand-green font-semibold">{singleManufacturerName}</span>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="text-body3-default text-tertiary mt-6 flex flex-wrap items-center justify-center gap-6 border-t border-core/60 pt-4">
        <Legend color={STATUS_COLORS.committed} label="Committed (Green)" />
        <Legend color={STATUS_COLORS.pending_clarification} label="Pending clarification (Yellow)" />
        <Legend color={STATUS_COLORS.flagged} label="Flagged by heartbeat (Red)" />
      </div>
    </div>
  );
}

function YAxis({ ticks }: { ticks: number[] }) {
  return (
    <div className={`relative flex w-20 shrink-0 flex-col justify-between pr-2 text-right ${PLOT_H_CLASS}`}>
      <div className="absolute -top-3 left-0 text-body3-default font-semibold text-primary">Quantity</div>
      {ticks.map((tick, i) => (
        <div
          key={`${tick}-${i}`}
          className="text-body3-default text-tertiary font-mono text-xs flex items-center justify-end"
          style={{ height: i === 0 || i === ticks.length - 1 ? 0 : "auto" }}
        >
          {tick}
        </div>
      ))}
    </div>
  );
}

function Gridlines({ ticks }: { ticks: number[] }) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between ${PLOT_H_CLASS}`}>
      {ticks.map((tick, index) => (
        <div
          key={`${tick}-${index}`}
          className={
            index === ticks.length - 1
              ? "w-full border-b-2 border-core-border-ii"
              : "w-full border-b border-core/60 border-dashed"
          }
        />
      ))}
    </div>
  );
}

function GroupedBars({
  groups,
  ceiling,
  ticks,
}: {
  groups: ChartGroup[];
  ceiling: number;
  ticks: number[];
}) {
  return (
    <div className="relative inline-block min-w-full">
      <Gridlines ticks={ticks} />
      <div className={`pointer-events-none absolute top-0 left-0 z-10 w-0 border-l-2 border-core-border-ii ${PLOT_H_CLASS}`} />
      <div className={`relative z-10 flex items-stretch px-4 ${PLOT_H_CLASS}`} style={{ gap: DAY_GAP }}>
        {groups.map((group) => (
          <div
            key={group.key}
            className={`flex shrink-0 items-end ${PLOT_H_CLASS}`}
            style={{ width: clusterWidth(group.bars.length), gap: BAR_GAP }}
          >
            {group.bars.map((bar) => (
              <StackBar key={bar.key} bar={bar} ceiling={ceiling} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-start px-4 pt-2" style={{ gap: DAY_GAP }}>
        {groups.map((group) => (
          <div
            key={`${group.key}-label`}
            className="flex shrink-0 flex-col items-stretch"
            style={{ width: clusterWidth(group.bars.length) }}
          >
            <div className="flex" style={{ gap: BAR_GAP }}>
              {group.bars.map((bar) => (
                <span
                  key={`${bar.key}-name`}
                  className="text-body3-default text-tertiary break-words text-center leading-snug"
                  style={{ width: BAR_W }}
                  title={bar.label}
                >
                  {bar.label}
                </span>
              ))}
            </div>
            <span className="text-body2-default text-primary mt-1 text-center font-semibold leading-snug">
              {group.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StackBar({ bar, ceiling }: { bar: ChartBar; ceiling: number }) {
  const total = totalOf(bar.quantities);
  const heightPx = total > 0 ? Math.max((total / ceiling) * PLOT_H, 12) : 3;
  const pendingPct = total ? (bar.quantities.pending_clarification / total) * 100 : 0;
  const committedPct = total ? (bar.quantities.committed / total) * 100 : 0;
  const flaggedPct = total ? (bar.quantities.flagged / total) * 100 : 0;

  return (
    <div className={`group relative flex items-end justify-center ${PLOT_H_CLASS}`} style={{ width: BAR_W }}>
      <div
        className="relative overflow-hidden rounded-t-small shadow-sm transition-all duration-200 group-hover:brightness-105 group-hover:scale-[1.02]"
        style={{
          width: BAR_W,
          height: heightPx,
        }}
      >
        <div className="absolute inset-0 flex flex-col-reverse">
          <div
            style={{ height: `${committedPct}%`, background: STATUS_COLORS.committed }}
            title={`Committed: ${bar.quantities.committed}`}
          />
          <div
            style={{ height: `${pendingPct}%`, background: STATUS_COLORS.pending_clarification }}
            title={`Pending: ${bar.quantities.pending_clarification}`}
          />
          <div
            style={{ height: `${flaggedPct}%`, background: STATUS_COLORS.flagged }}
            title={`Flagged: ${bar.quantities.flagged}`}
          />
        </div>
      </div>
      <HoverCard title={bar.label} quantities={bar.quantities} />
    </div>
  );
}

function LinePlot({
  points,
  ceiling,
  ticks,
}: {
  points: ChartPoint[];
  ceiling: number;
  ticks: number[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = Math.max(points.length * LINE_COL_W, 360);
  const padX = 60;
  const padY = 10;
  const innerW = width - padX * 2;
  const innerH = PLOT_H - padY * 2;
  const xAt = (i: number) =>
    padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (value: number) => padY + innerH - (value / ceiling) * innerH;

  const series = [
    { key: "committed" as const, color: STATUS_COLORS.committed },
    { key: "pending_clarification" as const, color: STATUS_COLORS.pending_clarification },
    { key: "flagged" as const, color: STATUS_COLORS.flagged },
  ];

  return (
    <div className="relative inline-block min-w-full">
      <Gridlines ticks={ticks} />
      <div className={`pointer-events-none absolute top-0 left-0 z-10 w-0 border-l-2 border-core-border-ii ${PLOT_H_CLASS}`} />
      <svg
        className="relative z-10 block"
        width={width}
        height={PLOT_H}
        viewBox={`0 0 ${width} ${PLOT_H}`}
        role="img"
        aria-label="Company volume over time"
      >
        {series.map((s) => {
          const d = points
            .map((point, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(point.quantities[s.key])}`)
            .join(" ");
          return (
            <path
              key={s.key}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        {points.map((point, i) => (
          <g
            key={point.key}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <rect
              x={xAt(i) - LINE_COL_W / 2}
              y={0}
              width={LINE_COL_W}
              height={PLOT_H}
              fill="transparent"
            />
            {series.map((s) => (
              <circle
                key={s.key}
                cx={xAt(i)}
                cy={yAt(point.quantities[s.key])}
                r={hovered === i ? 5 : 3.5}
                fill={s.color}
                stroke="var(--color-core-surface, #fff)"
                strokeWidth="1.5"
              />
            ))}
          </g>
        ))}
      </svg>
      {hovered != null && points[hovered] ? (
        <div
          className="pointer-events-none absolute z-50 w-56 -translate-x-1/2 rounded-default border border-core bg-core-surface p-3.5 shadow-xl"
          style={{
            left: xAt(hovered),
            top: 12,
          }}
        >
          <TooltipBody title={points[hovered].label} quantities={points[hovered].quantities} />
        </div>
      ) : null}
      <div className="relative pt-2" style={{ width, minHeight: 44 }}>
        {points.map((point, i) => (
          <span
            key={`${point.key}-label`}
            className="text-body2-default text-primary absolute top-2 text-center font-semibold leading-snug"
            style={{
              left: xAt(i),
              width: LINE_COL_W,
              transform: "translateX(-50%)",
            }}
          >
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function HoverCard({ title, quantities }: { title: string; quantities: StatusBreakdown }) {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 hidden w-56 -translate-x-1/2 rounded-default border border-core bg-core-surface p-3.5 shadow-xl group-hover:block">
      <TooltipBody title={title} quantities={quantities} />
    </div>
  );
}

function TooltipBody({ title, quantities }: { title: string; quantities: StatusBreakdown }) {
  const total = totalOf(quantities);
  const pct = (n: number) => (total ? ((n / total) * 100).toFixed(0) : "0");
  return (
    <>
      <p className="text-body2-heavy text-primary m-0 border-b border-core pb-1.5">{title}</p>
      <div className="mt-2 space-y-1">
        <TooltipRow color={STATUS_COLORS.committed} label="Committed" value={quantities.committed} pct={pct(quantities.committed)} />
        <TooltipRow
          color={STATUS_COLORS.pending_clarification}
          label="Pending"
          value={quantities.pending_clarification}
          pct={pct(quantities.pending_clarification)}
        />
        <TooltipRow color={STATUS_COLORS.flagged} label="Flagged" value={quantities.flagged} pct={pct(quantities.flagged)} />
      </div>
      <div className="text-body3-default text-tertiary mt-2.5 flex items-center justify-between border-t border-core pt-1.5">
        <span>Total Volume</span>
        <span className="font-bold text-primary">{total}</span>
      </div>
    </>
  );
}

function TooltipRow({
  color,
  label,
  value,
  pct,
}: {
  color: string;
  label: string;
  value: number;
  pct: string;
}) {
  return (
    <div className="flex items-center justify-between text-body3-default">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span>{label}</span>
      </span>
      <span className="font-semibold text-primary">
        {value} ({pct}%)
      </span>
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
