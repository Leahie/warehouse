import { useMemo, useState } from "react";
import logsData from "@/assets/data/logs_aggregates.json";
import { LogsChart, type ChartBar } from "@/components/logs/LogsChart";
import { TimeRangeControls } from "@/components/logs/TimeRangeControls";
import type { LogsAggregateFile, LogsMode, StatusBreakdown } from "@/types/logs";

const data = logsData as LogsAggregateFile;

function emptyBreakdown(): StatusBreakdown {
  return { pending_clarification: 0, committed: 0, flagged: 0 };
}

function addBreakdown(a: StatusBreakdown, b: StatusBreakdown): StatusBreakdown {
  return {
    pending_clarification: a.pending_clarification + b.pending_clarification,
    committed: a.committed + b.committed,
    flagged: a.flagged + b.flagged,
  };
}

function eachDay(start: string, end: string) {
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function resolveName(input: string) {
  const names = Object.keys(data.manufacturers);
  return names.find((n) => n.toLowerCase() === input.trim().toLowerCase()) ?? null;
}

export function LogsPage() {
  const [start, setStart] = useState("2026-09-10");
  const [end, setEnd] = useState("2026-09-12");
  const [mode, setMode] = useState<LogsMode | null>("multiple");
  const [names, setNames] = useState(["Fresh Farms", "Berry Grove Co"]);

  const { bars, error } = useMemo(() => {
    if (!mode || !start) return { bars: [] as ChartBar[], error: null as string | null };

    if (end && end < start) {
      return { bars: [], error: "End date must be on or after start date." };
    }

    if (mode === "multiple") {
      const rangeEnd = end || start;
      const days = eachDay(start, rangeEnd);
      const nextBars = names
        .map((raw) => {
          const name = resolveName(raw);
          if (!name) return null;
          const byDay = data.manufacturers[name];
          const quantities = days.reduce((acc, day) => {
            return addBreakdown(acc, byDay[day] ?? emptyBreakdown());
          }, emptyBreakdown());
          return { key: name, label: name, quantities };
        })
        .filter((bar): bar is ChartBar => bar !== null);

      const missing = names.filter((raw) => !resolveName(raw));
      return {
        bars: nextBars,
        error: missing.length
          ? `Unknown manufacturer: ${missing.join(", ")}. Available: ${Object.keys(data.manufacturers).join(", ")}`
          : null,
      };
    }

    // Single mode
    const name = resolveName(names[0] ?? "");
    if (!name) {
      return {
        bars: [],
        error: `No orders found for ${names[0] || "(empty)"} in this range.`,
      };
    }

    const byDay = data.manufacturers[name];
    const rangeEnd = end || start;
    const days = eachDay(start, rangeEnd);
    return {
      bars: days.map((day) => ({
        key: day,
        label: day.slice(5),
        quantities: byDay[day] ?? emptyBreakdown(),
      })),
      error: null,
    };
  }, [mode, start, end, names]);

  function handleAddManufacturer(manufacturerToAdd: string) {
    const resolved = resolveName(manufacturerToAdd);
    if (!resolved) return;
    if (names.includes(resolved)) return;
    setNames((prev) => [...prev, resolved]);
  }

  const allManufacturerKeys = Object.keys(data.manufacturers);
  const availableToAdd = allManufacturerKeys.filter((m) => !names.includes(m));

  return (
    <section className="page-pad flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1-default text-primary m-0">Logs</h1>
          <p className="text-body3-default text-tertiary mt-1 mb-0">
            Compare receiving volumes and quality ratios across manufacturers or over time.
          </p>
        </div>
      </div>

      {mode === "multiple" || mode === "single" ? (
        <div className="card-surface p-4">
          <div className="text-body3-default text-tertiary uppercase tracking-wider font-semibold mb-2">
            {mode === "multiple" ? "Compare Manufacturers" : "Selected Manufacturer"}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(mode === "multiple" ? names : names.slice(0, 1)).map((name, index) => (
              <div key={`${name}-${index}`} className="flex items-center gap-2 rounded-small border border-core bg-core-surface-ii/60 px-3 py-1.5">
                <span className="text-body3-default font-semibold text-secondary">
                  {mode === "multiple" ? `Company ${String.fromCharCode(65 + index)}:` : "Company:"}
                </span>
                <input
                  className="border-core text-body2-default rounded-small border bg-core-surface px-2.5 py-1 text-primary focus:border-brand-green focus:outline-none"
                  value={name}
                  list="manufacturer-options"
                  placeholder="Manufacturer name…"
                  onChange={(e) => {
                    const value = e.target.value;
                    setNames((prev) => {
                      const copy = [...prev];
                      copy[index] = value;
                      return copy;
                    });
                  }}
                />
                {mode === "multiple" && names.length > 2 ? (
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    className="text-tertiary hover:text-negative text-xs px-1"
                    onClick={() => {
                      setNames((prev) => prev.filter((_, i) => i !== index));
                    }}
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
            <datalist id="manufacturer-options">
              {allManufacturerKeys.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-small border border-negative/30 bg-alert-wash px-4 py-2 text-body2-default text-negative">
          {error}
        </div>
      ) : null}

      <LogsChart
        bars={bars}
        mode={mode}
        singleManufacturerName={resolveName(names[0] ?? "") ?? names[0]}
        showAdd={mode === "multiple" && bars.length > 0}
        onAddManufacturer={handleAddManufacturer}
        availableManufacturers={availableToAdd}
      />

      <TimeRangeControls
        start={start}
        end={end}
        mode={mode}
        onStartChange={setStart}
        onEndChange={setEnd}
        onModeChange={(next) => {
          setMode(next);
          if (next === "single") {
            setNames((prev) => [prev[0] || "Fresh Farms"]);
          } else {
            setNames((prev) =>
              prev.length >= 2 ? prev : ["Fresh Farms", "Berry Grove Co"],
            );
          }
        }}
      />
    </section>
  );
}
