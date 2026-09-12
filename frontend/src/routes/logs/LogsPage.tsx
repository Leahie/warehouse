import { useEffect, useMemo, useRef, useState } from "react";
import logsData from "@/assets/data/logs_aggregates.json";
import { LogsChart, type ChartGroup, type ChartPoint } from "@/components/logs/LogsChart";
import { TimeRangeControls } from "@/components/logs/TimeRangeControls";
import { Selector } from "@/components/Selector";
import type { LogsAggregateFile, LogsMode, StatusBreakdown } from "@/types/logs";
import { useFacetOptions, useLogsAggregate } from "@/api/useLiveData";

const fallbackLogs = logsData as LogsAggregateFile;

function totalOf(q: StatusBreakdown) {
  return q.pending_clarification + q.committed + q.flagged;
}

function eachDay(start: string, end: string) {
  const days: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    days.push(`${year}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function formatChartDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function resolveName(input: string, list: string[]) {
  const needle = input.trim().toLowerCase();
  if (!needle) return null;
  return list.find((n) => n.toLowerCase() === needle) ?? null;
}

export function LogsPage() {
  const [start, setStart] = useState("2026-09-10");
  const [end, setEnd] = useState("2026-09-12");
  const [mode, setMode] = useState<LogsMode | null>("multiple");
  const [names, setNames] = useState(["Berry Grove Co", "Blue Mesa Farms"]);
  const facets = useFacetOptions();
  const autoSelected = useRef(false);

  const supplierOptions = useMemo(() => {
    if (facets.suppliers.length) return facets.suppliers;
    return Object.keys(fallbackLogs.manufacturers);
  }, [facets.suppliers]);

  const resolvedNames = useMemo(() => {
    const wanted = mode === "single" ? names.slice(0, 1) : names;
    return wanted
      .map((raw) => resolveName(raw, supplierOptions))
      .filter((name): name is string => Boolean(name));
  }, [mode, names, supplierOptions]);

  const { data, isLoading } = useLogsAggregate(fallbackLogs, {}, resolvedNames);

  const daysWithData = useMemo(() => {
    const days = new Set<string>();
    const sources = [data.manufacturers, fallbackLogs.manufacturers];
    for (const raw of resolvedNames) {
      const needle = raw.trim().toLowerCase();
      for (const manufacturers of sources) {
        const key = Object.keys(manufacturers).find((name) => name.toLowerCase() === needle);
        if (!key) continue;
        for (const [day, quantities] of Object.entries(manufacturers[key] ?? {})) {
          if (quantities && totalOf(quantities) > 0) days.add(day);
        }
      }
    }
    return days;
  }, [data, resolvedNames]);

  useEffect(() => {
    if (autoSelected.current || !supplierOptions.length) return;
    if (mode === "single") {
      const match = resolveName(names[0] ?? "", supplierOptions);
      if (!match) setNames([supplierOptions[0]]);
      autoSelected.current = true;
      return;
    }
    if (mode === "multiple") {
      const next = names.map((raw, index) => {
        return resolveName(raw, supplierOptions) ?? supplierOptions[index] ?? supplierOptions[0];
      });
      const unique: string[] = [];
      for (const name of next) {
        if (!unique.includes(name)) unique.push(name);
      }
      while (unique.length < 2 && unique.length < supplierOptions.length) {
        const extra = supplierOptions.find((s) => !unique.includes(s));
        if (!extra) break;
        unique.push(extra);
      }
      if (unique.join("\0") !== names.join("\0")) setNames(unique);
      autoSelected.current = true;
    }
  }, [mode, names, supplierOptions]);

  const { groups, points, error, manufacturerName } = useMemo(() => {
    if (!mode || !start) {
      return {
        groups: [] as ChartGroup[],
        points: [] as ChartPoint[],
        error: null as string | null,
        manufacturerName: names[0] ?? "",
      };
    }

    if (end && end < start) {
      return {
        groups: [] as ChartGroup[],
        points: [] as ChartPoint[],
        error: "End date must be on or after start date.",
        manufacturerName: names[0] ?? "",
      };
    }

    const known = Object.keys(data.manufacturers);
    const rangeEnd = end || start;
    const days = eachDay(start, rangeEnd);

    if (mode === "multiple") {
      const companies = names
        .map((raw) => resolveName(raw, known) ?? resolveName(raw, supplierOptions))
        .filter((name): name is string => Boolean(name));
      return {
        groups: days
          .map((day) => ({
            key: day,
            label: formatChartDate(day),
            bars: companies.flatMap((name) => {
              const quantities = data.manufacturers[name]?.[day];
              if (!quantities || totalOf(quantities) <= 0) return [];
              return [
                {
                  key: `${name}-${day}`,
                  label: name,
                  quantities,
                },
              ];
            }),
          }))
          .filter((group) => group.bars.length > 0),
        points: [] as ChartPoint[],
        error: companies.length ? null : "Select companies to compare.",
        manufacturerName: companies[0] ?? "",
      };
    }

    const name =
      resolveName(names[0] ?? "", known) ?? resolveName(names[0] ?? "", supplierOptions);
    if (!name) {
      return {
        groups: [] as ChartGroup[],
        points: [] as ChartPoint[],
        error: `No orders found for ${names[0] || "(empty)"} in this range.`,
        manufacturerName: names[0] ?? "",
      };
    }

    const byDay = data.manufacturers[name] ?? {};
    const existingDays = days.filter((day) => {
      const quantities = byDay[day];
      return quantities && totalOf(quantities) > 0;
    });

    return {
      groups: [] as ChartGroup[],
      points: existingDays.map((day) => ({
        key: day,
        label: formatChartDate(day),
        quantities: byDay[day],
      })),
        error: existingDays.length
          ? null
          : isLoading
            ? null
            : `No orders found for ${name} in this range.`,
      manufacturerName: name,
    };
  }, [mode, start, end, names, data, supplierOptions, isLoading]);

  function updateName(index: number, value: string) {
    setNames((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  }

  function handleAddManufacturer() {
    const next = supplierOptions.find(
      (option) => !names.some((name) => name.toLowerCase() === option.toLowerCase()),
    );
    if (next) setNames((prev) => [...prev, next]);
  }

  const slots = mode === "single" ? names.slice(0, 1) : names;

  return (
    <section className="page-pad flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1-default text-primary m-0">Logs</h1>
          <p className="text-body3-default text-tertiary mt-1 mb-0">
            Compare receiving volumes and quality ratios across manufacturers or over time.
          </p>
        </div>
      </div>

      <TimeRangeControls
        start={start}
        end={end}
        mode={mode}
        enabledDays={isLoading ? undefined : daysWithData}
        onStartChange={setStart}
        onEndChange={setEnd}
        onModeChange={(next) => {
          autoSelected.current = false;
          setMode(next);
          if (next === "single") {
            setNames((prev) => [prev[0] || supplierOptions[0] || "Berry Grove Co"]);
          } else {
            setNames((prev) =>
              prev.length >= 2
                ? prev
                : [
                    prev[0] || supplierOptions[0] || "Berry Grove Co",
                    supplierOptions.find((s) => s !== prev[0]) ||
                      supplierOptions[1] ||
                      "Blue Mesa Farms",
                  ],
            );
          }
        }}
      />

      {mode === "multiple" || mode === "single" ? (
        <div className="card-surface overflow-visible p-4">
          <div className="text-body3-default text-tertiary mb-2 font-semibold tracking-wider uppercase">
            {mode === "multiple" ? "Compare Manufacturers" : "Selected Manufacturer"}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {slots.map((name, index) => (
              <div key={`${mode}-${index}`} className="flex min-w-56 flex-1 items-end gap-2">
                <Selector
                  label={mode === "multiple" ? `Company ${String.fromCharCode(65 + index)}` : "Company"}
                  placeholder="Search companies…"
                  options={supplierOptions.filter(
                    (option) =>
                      option.toLowerCase() === name.toLowerCase() ||
                      !names.some((other) => other.toLowerCase() === option.toLowerCase()),
                  )}
                  value={resolveName(name, supplierOptions) ?? ""}
                  onChange={(value) => updateName(index, value)}
                  className="min-w-56 flex-1"
                />
                {mode === "multiple" && names.length > 2 ? (
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    className="text-tertiary hover:text-negative mb-2 px-1 text-xs"
                    onClick={() => {
                      setNames((prev) => prev.filter((_, i) => i !== index));
                    }}
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
            {mode === "multiple" ? (
              <button
                type="button"
                className="text-body2-heavy mb-0.5 rounded-small border border-dashed border-brand-green/50 bg-brand-green-soft/40 px-3 py-2 text-brand-green hover:border-brand-green"
                onClick={handleAddManufacturer}
                disabled={!supplierOptions.some((option) => !names.includes(option))}
              >
                + Add company
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-small border border-negative/30 bg-alert-wash px-4 py-2 text-body2-default text-negative">
          {error}
        </div>
      ) : null}

      <LogsChart
        groups={groups}
        points={points}
        mode={mode}
        singleManufacturerName={manufacturerName}
        isLoading={isLoading}
      />
    </section>
  );
}
