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
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [mode, setMode] = useState<LogsMode | null>(null);
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
          ? `No orders found for ${missing.join(", ")}.`
          : null,
      };
    }

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

  function onAddManufacturer() {
    const next = window.prompt("Manufacturer name to compare", "GreenLeaf Produce");
    if (!next?.trim()) return;
    const resolved = resolveName(next);
    if (!resolved) return;
    if (names.includes(resolved)) return;
    setNames((prev) => [...prev, resolved]);
  }

  return (
    <section className="page-pad flex min-h-0 flex-1 flex-col gap-4">
      <h1 className="text-h1-default text-primary m-0">Logs</h1>

      {mode === "multiple" || mode === "single" ? (
        <div className="flex flex-wrap gap-3">
          {(mode === "multiple" ? names : names.slice(0, 1)).map((name, index) => (
            <label key={`${name}-${index}`} className="flex flex-col gap-1">
              <span className="text-body3-default text-tertiary">
                {mode === "multiple" ? `Company ${String.fromCharCode(65 + index)}` : "Manufacturer"}
              </span>
              <input
                className="border-core text-body2-default rounded-small border px-3 py-2"
                value={name}
                list="manufacturer-options"
                onChange={(e) => {
                  const value = e.target.value;
                  setNames((prev) => {
                    const copy = [...prev];
                    copy[index] = value;
                    return copy;
                  });
                }}
              />
            </label>
          ))}
          <datalist id="manufacturer-options">
            {Object.keys(data.manufacturers).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      ) : null}

      {error ? <p className="text-body2-default text-negative m-0">{error}</p> : null}

      <LogsChart
        bars={bars}
        showAdd={mode === "multiple" && bars.length > 0}
        onAdd={onAddManufacturer}
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
