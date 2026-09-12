import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { LoadingPanel } from "@/components/LoadingIcon";
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
const PLOT_H_CLASS = "h-80";
const PLOT_H = 320;
const LINE_COL_W = 96;
const AXIS_HEAD_CLASS = "h-8";

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

function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => setWidth(el.clientWidth);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
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
    <div className="card-surface flex min-h-[520px] min-w-0 flex-col overflow-visible px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-h4-default text-primary m-0 font-semibold">Volume & Quality Logs</h2>
        {mode ? (
          <span className="text-body3-default rounded-small border border-core bg-core-surface-ii px-2.5 py-1 text-secondary font-medium uppercase tracking-wider">
            Mode: {mode}
          </span>
        ) : null}
      </div>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          {isLoading ? (
            <LoadingPanel label="Loading chart data…" />
          ) : (
            <div className="animate-card-in rounded-default border-2 border-dashed border-core px-8 py-10">
              <p className="text-body1-default text-primary font-medium m-0">No chart data displayed</p>
              <p className="text-body2-default text-secondary mt-1 mb-0">
                Select a time range and choose Multiple or Single above to view analytics.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex min-w-0 flex-col">
          {isLoading ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-default bg-core-surface/70">
              <LoadingPanel label="Updating chart…" />
            </div>
          ) : null}
          <div className="animate-card-in flex min-w-0 flex-col">
            <div className="flex min-w-0">
              <YAxis ticks={ticks} />
              <div className="relative min-w-0 flex-1 overflow-x-auto">
                {mode === "single" ? (
                  <LinePlot points={points} ceiling={ceiling} ticks={ticks} />
                ) : (
                  <GroupedBars groups={groups} ceiling={ceiling} ticks={ticks} />
                )}
              </div>
            </div>

            <div className="mt-4 pl-20 text-center">
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
        </div>
      )}

      <div className="text-body3-default text-tertiary mt-8 flex flex-wrap items-center justify-center gap-6 border-t border-core/60 pt-5">
        <Legend color={STATUS_COLORS.committed} label="Committed (Green)" />
        <Legend color={STATUS_COLORS.pending_clarification} label="Pending clarification (Yellow)" />
        <Legend color={STATUS_COLORS.flagged} label="Flagged by heartbeat (Red)" />
      </div>
    </div>
  );
}

function YAxis({ ticks }: { ticks: number[] }) {
  return (
    <div className="relative w-20 shrink-0 overflow-visible pr-3 text-right">
      <div className={`flex ${AXIS_HEAD_CLASS} items-end justify-end pb-1`}>
        <span className="text-body3-default font-semibold text-primary">Quantity</span>
      </div>
      <div className={`relative ${PLOT_H_CLASS}`}>
        {ticks.map((tick, i) => (
          <div
            key={`${tick}-${i}`}
            className="text-body3-default text-tertiary absolute right-0 font-mono text-xs leading-none"
            style={{
              top: `${(i / Math.max(ticks.length - 1, 1)) * 100}%`,
              transform: "translateY(-50%)",
            }}
          >
            {tick}
          </div>
        ))}
      </div>
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
    <div className="relative w-full min-w-full pb-4">
      <div className={AXIS_HEAD_CLASS} />
      <div className="relative">
        <Gridlines ticks={ticks} />
        <div className={`pointer-events-none absolute top-0 left-0 z-10 w-0 border-l-2 border-core-border-ii ${PLOT_H_CLASS}`} />
        <div className={`relative z-10 flex w-full items-end ${PLOT_H_CLASS}`}>
          {groups.map((group) => (
            <div
              key={group.key}
              className={`flex min-w-0 flex-1 items-end justify-center ${PLOT_H_CLASS}`}
              style={{ minWidth: clusterWidth(group.bars.length), gap: BAR_GAP }}
            >
              {group.bars.map((bar) => (
                <StackBar key={bar.key} bar={bar} ceiling={ceiling} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex w-full items-start pt-4">
        {groups.map((group) => (
          <div
            key={`${group.key}-label`}
            className="flex min-w-0 flex-1 flex-col items-stretch"
            style={{ minWidth: clusterWidth(group.bars.length) }}
          >
            <div className="flex justify-center" style={{ gap: BAR_GAP }}>
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
            <span className="text-body2-default text-primary mt-1.5 text-center font-semibold leading-snug">
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
  const [hovered, setHovered] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className={`relative flex items-end justify-center ${PLOT_H_CLASS}`}
      style={{ width: BAR_W }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        ref={barRef}
        className="relative overflow-hidden rounded-t-small shadow-sm transition-all duration-200 hover:brightness-105"
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
      {hovered ? (
        <HoverCard anchorRef={barRef} title={bar.label} quantities={bar.quantities} />
      ) : null}
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
  const { ref: plotRef, width: measuredWidth } = useElementWidth();
  const width = Math.max(measuredWidth, 1);
  const padX = Math.max(48, LINE_COL_W / 2);
  const padY = 24;
  const innerW = width - padX * 2;
  const innerH = PLOT_H - padY * 2;
  const xAt = (i: number) =>
    padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yAt = (value: number) => padY + innerH - (value / ceiling) * innerH;
  const svgRef = useRef<SVGSVGElement>(null);
  const [pointBox, setPointBox] = useState<DOMRect | null>(null);

  const series = [
    { key: "committed" as const, color: STATUS_COLORS.committed },
    { key: "pending_clarification" as const, color: STATUS_COLORS.pending_clarification },
    { key: "flagged" as const, color: STATUS_COLORS.flagged },
  ];

  useLayoutEffect(() => {
    const index = hovered;
    const point = index == null ? null : points[index];
    if (index == null || !point || !svgRef.current) {
      setPointBox(null);
      return;
    }
    function sync() {
      const svg = svgRef.current;
      if (!svg || index == null || !point) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width / width;
      const scaleY = rect.height / PLOT_H;
      const topY = Math.min(...series.map((s) => yAt(point.quantities[s.key])));
      setPointBox(new DOMRect(rect.left + xAt(index) * scaleX - 8, rect.top + topY * scaleY, 16, 16));
    }
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [hovered, points, width]);

  return (
    <div
      ref={plotRef}
      className="relative w-full pb-4"
      style={{ minWidth: points.length * LINE_COL_W }}
    >
      <div className={AXIS_HEAD_CLASS} />
      <div className="relative">
        <Gridlines ticks={ticks} />
        <div className={`pointer-events-none absolute top-0 left-0 z-10 w-0 border-l-2 border-core-border-ii ${PLOT_H_CLASS}`} />
        <svg
          ref={svgRef}
          className="relative z-10 block w-full"
          height={PLOT_H}
          viewBox={`0 0 ${width} ${PLOT_H}`}
          preserveAspectRatio="xMidYMid meet"
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
      </div>
      {hovered != null && points[hovered] && pointBox ? (
        <PortaledTooltip anchor={pointBox}>
          <TooltipBody title={points[hovered].label} quantities={points[hovered].quantities} />
        </PortaledTooltip>
      ) : null}
      <div className="relative w-full pt-4" style={{ minHeight: 52 }}>
        {points.map((point, i) => (
          <span
            key={`${point.key}-label`}
            className="text-body2-default text-primary absolute top-4 text-center font-semibold leading-snug"
            style={{
              left: `${(xAt(i) / width) * 100}%`,
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

function HoverCard({
  anchorRef,
  title,
  quantities,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  title: string;
  quantities: StatusBreakdown;
}) {
  const [box, setBox] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    function sync() {
      const el = anchorRef.current;
      if (!el) return;
      setBox(el.getBoundingClientRect());
    }
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [anchorRef]);

  if (!box) return null;
  return (
    <PortaledTooltip anchor={box}>
      <TooltipBody title={title} quantities={quantities} />
    </PortaledTooltip>
  );
}

function PortaledTooltip({ anchor, children }: { anchor: DOMRect; children: ReactNode }) {
  return createPortal(
    <div
      className="pointer-events-none fixed z-[80] w-56 -translate-x-1/2 -translate-y-full rounded-default border border-core bg-core-surface p-3.5 shadow-xl"
      style={{
        left: anchor.left + anchor.width / 2,
        top: Math.max(12, anchor.top - 12),
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function TooltipBody({ title, quantities }: { title: string, quantities: StatusBreakdown }) {
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
