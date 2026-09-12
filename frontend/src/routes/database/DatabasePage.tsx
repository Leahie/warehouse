import { useMemo, useState } from "react";
import ordersData from "@/assets/data/orders.json";
import {
  FilterPopover,
  type ColumnFilterState,
  type ColumnKey,
} from "@/components/database/FilterPopover";
import { InfiniteSentinel } from "@/components/InfiniteSentinel";
import { LoadingIcon } from "@/components/LoadingIcon";
import { Selector } from "@/components/Selector";
import { StatusChip } from "@/components/database/StatusChip";
import { industryFor } from "@/api/adapters";
import type { OrderRow } from "@/types/order";
import { useExpectedReceipts, useFacetOptions, useProgress } from "@/api/useLiveData";

const fallbackOrders = ordersData as OrderRow[];

const COLUMNS: { key: ColumnKey; title: string }[] = [
  { key: "date", title: "Date" },
  { key: "time_process_finished", title: "Time Process Finished" },
  { key: "item", title: "Item" },
  { key: "industry", title: "Industry" },
  { key: "quantity", title: "Quantity" },
  { key: "quality", title: "Quality" },
  { key: "supplier_lot", title: "Supplier name / lot code" },
  { key: "status", title: "Status" },
];

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l5 5" strokeLinecap="round" />
    </svg>
  );
}

function formatTime(iso: string) {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string) {
  if (!value || value === "unknown") return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toISOString().slice(0, 10);
}

function applyFilters(rows: OrderRow[], filters: ColumnFilterState) {
  return rows.filter((row) => {
    if (filters.date && row.date !== filters.date) return false;
    if (
      filters.time_process_finished &&
      !formatTime(row.time_process_finished)
        .toLowerCase()
        .includes(filters.time_process_finished.toLowerCase()) &&
      !row.time_process_finished.toLowerCase().includes(filters.time_process_finished.toLowerCase())
    ) {
      return false;
    }
    if (filters.item && !row.item.toLowerCase().includes(filters.item.toLowerCase())) {
      return false;
    }
    if (
      filters.industry &&
      !(row.industry ?? "").toLowerCase().includes(filters.industry.toLowerCase())
    ) {
      return false;
    }
    if (filters.quantity && String(row.quantity_received) !== filters.quantity.trim()) {
      return false;
    }
    if (
      filters.quality &&
      !(row.quality ?? "").toLowerCase().includes(filters.quality.toLowerCase())
    ) {
      return false;
    }
    if (filters.supplier_lot) {
      const hay = `${row.supplier} ${row.lot_code}`.toLowerCase();
      if (!hay.includes(filters.supplier_lot.toLowerCase())) return false;
    }
    if (filters.status?.length && !filters.status.includes(row.status)) return false;
    return true;
  });
}

export function DatabasePage() {
  // Show what the warehouse is expecting, not only what has been received.
  const { data: orders, total, hasMore, loadMore, isLoading } = useExpectedReceipts(fallbackOrders);
  const facets = useFacetOptions();
  const { data: progress } = useProgress();
  const [filters, setFilters] = useState<ColumnFilterState>({});
  const [draft, setDraft] = useState<ColumnFilterState>({});
  const [openColumn, setOpenColumn] = useState<ColumnKey | null>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);

  const allIndustries = useMemo(() => {
    const set = new Set<string>(facets.industries);
    (facets.items.length ? facets.items : orders.map((o) => o.item)).forEach((item) =>
      set.add(industryFor(item)),
    );
    orders.forEach((o) => {
      if (o.industry) set.add(o.industry);
    });
    return Array.from(set).sort();
  }, [facets, orders]);

  const allItems = useMemo(() => {
    const set = new Set<string>(facets.items);
    orders.forEach((o) => set.add(o.item));
    return Array.from(set).sort();
  }, [facets.items, orders]);

  const allQualities = useMemo(() => {
    const set = new Set<string>(facets.qualities);
    orders.forEach((o) => {
      if (o.quality) set.add(o.quality);
    });
    return Array.from(set).sort();
  }, [facets.qualities, orders]);

  const allSuppliersLots = useMemo(() => {
    const set = new Set<string>(facets.suppliers);
    orders.forEach((o) => {
      set.add(`${o.supplier} · ${o.lot_code}`);
    });
    return Array.from(set).sort();
  }, [facets.suppliers, orders]);

  const allDates = useMemo(() => {
    const set = new Set<string>(facets.dates);
    orders.forEach((o) => set.add(o.date));
    return Array.from(set).sort().reverse();
  }, [facets.dates, orders]);

  function getColumnOptions(col: ColumnKey): string[] {
    switch (col) {
      case "industry":
        return allIndustries;
      case "item":
        return allItems;
      case "quality":
        return allQualities;
      case "supplier_lot":
        return allSuppliersLots;
      case "date":
        return allDates;
      default:
        return [];
    }
  }

  const rows = useMemo(() => applyFilters(orders, filters), [filters, orders]);

  const activeChips = Object.entries(filters).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  });

  return (
    <section className="page-pad flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h1-default text-primary m-0">Database Visualizer</h1>
        {progress && (
          <p className="text-body2-default text-secondary m-0 mt-1">
            {progress.totals.lines_checked_in} of {progress.totals.lines_total} expected lines
            checked in · {progress.totals.quantity_received}/{progress.totals.quantity_expected} units
            ({progress.totals.percent_received}%)
            {progress.totals.flagged_lines > 0 && (
              <span className="text-negative"> · {progress.totals.flagged_lines} flagged</span>
            )}
          </p>
        )}
          <p className="text-body3-default text-tertiary mt-1 mb-0">
            Real-time receipt ledger. Showing {rows.length} of {total || orders.length} orders.
          </p>
        </div>

        {/* Industry selector dropdown with typing support */}
        <div className="w-72">
          <Selector
            label="Industry Filter"
            placeholder="Type or select industry…"
            options={allIndustries}
            value={filters.industry ?? ""}
            onChange={(val) => {
              setFilters((prev) => ({ ...prev, industry: val || undefined }));
            }}
          />
        </div>
      </div>

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body3-default text-tertiary font-medium">Active filters:</span>
          {activeChips.map(([key, value]) => (
            <button
              key={key}
              type="button"
              className="text-body3-default flex items-center gap-1.5 rounded-small bg-brand-green-soft px-3 py-1 font-medium text-accent hover:bg-brand-green hover:text-on-brand transition-colors"
              onClick={() => {
                setFilters((prev) => {
                  const next = { ...prev };
                  delete next[key as ColumnKey];
                  return next;
                });
              }}
              title="Click to remove filter"
            >
              <span className="capitalize">{key.replaceAll("_", " ")}:</span>
              <span className="font-semibold">{Array.isArray(value) ? value.join(", ") : String(value)}</span>
              <span className="ml-0.5 text-xs">✕</span>
            </button>
          ))}
          <button
            type="button"
            className="text-body3-default text-tertiary hover:text-negative underline ml-2"
            onClick={() => setFilters({})}
          >
            Clear all
          </button>
        </div>
      ) : null}

      <div ref={setScroller} className="card-surface min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="bg-core-surface sticky top-0 z-10 border-b border-core shadow-sm">
            <tr>
              {COLUMNS.map((col) => {
                const hasActiveFilter = Boolean(filters[col.key]);
                return (
                  <th
                    key={col.key}
                    className={[
                      "group relative select-none border-b border-core px-4 py-3 whitespace-nowrap cursor-pointer transition-colors",
                      hasActiveFilter ? "bg-brand-green-soft/30" : "hover:bg-core-surface-ii",
                    ].join(" ")}
                    onClick={() => {
                      setOpenColumn(col.key);
                      setDraft(filters);
                    }}
                    title="Filter this column"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-h5-default text-primary font-semibold">{col.title}</span>
                      <button
                        type="button"
                        aria-label={`Filter ${col.title}`}
                        className={[
                          "flex items-center justify-center rounded p-1 transition-colors",
                          hasActiveFilter
                            ? "bg-brand-green text-on-brand"
                            : "bg-core-surface-ii text-tertiary group-hover:bg-brand-green-soft group-hover:text-accent",
                        ].join(" ")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenColumn(col.key);
                          setDraft(filters);
                        }}
                      >
                        <SearchIcon />
                      </button>
                    </div>

                    {openColumn === col.key ? (
                      <FilterPopover
                        column={col.key}
                        title={col.title}
                        draft={draft}
                        options={getColumnOptions(col.key)}
                        onChange={setDraft}
                        onApply={() => {
                          setFilters(draft);
                          setOpenColumn(null);
                        }}
                        onClear={() => {
                          const cleared = { ...filters };
                          delete cleared[col.key];
                          setFilters(cleared);
                          setDraft(cleared);
                          setOpenColumn(null);
                        }}
                        onClose={() => setOpenColumn(null)}
                      />
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading && orders.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-16">
                  <div className="flex justify-center">
                    <LoadingIcon label="Loading orders" />
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="text-body1-default text-secondary px-4 py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <span>No orders match these filters.</span>
                    <button
                      type="button"
                      className="text-body2-default text-accent underline mt-1"
                      onClick={() => setFilters({})}
                    >
                      Clear all filters
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.order_id}
                  className="border-core border-b hover:bg-core-surface-ii/50 transition-colors"
                  style={
                    row.status === "flagged"
                      ? { background: "var(--color-alert-wash)" }
                      : undefined
                  }
                >
                  <td className="text-body2-default text-primary px-4 py-3 font-mono text-xs">
                    {formatDate(row.date)}
                  </td>
                  <td className="text-body2-default text-primary px-4 py-3">
                    {formatTime(row.time_process_finished)}
                  </td>
                  <td className="text-body2-default text-primary px-4 py-3 font-medium capitalize">
                    {row.item}
                  </td>
                  <td className="text-body2-default text-secondary px-4 py-3">
                    <span className="rounded bg-core-surface-ii px-2 py-0.5 text-xs font-medium text-secondary">
                      {row.industry ?? "General"}
                    </span>
                  </td>
                  <td className="text-body2-default text-primary px-4 py-3">
                    <span className="font-semibold">{row.quantity_received}</span>
                    <span className="text-tertiary"> / {row.quantity_expected}</span>
                  </td>
                  <td className="text-body2-default text-secondary px-4 py-3 capitalize">
                    {row.quality ?? "—"}
                  </td>
                  <td className="text-body2-default text-primary px-4 py-3">
                    <span className="font-medium">{row.supplier}</span>
                    <span className="text-tertiary font-mono text-xs ml-1.5">[{row.lot_code}]</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip status={row.status} flaggedBy={row.flagged_by} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <InfiniteSentinel
          onVisible={loadMore}
          disabled={!hasMore || isLoading}
          root={scroller}
          label="Loading more orders"
        />
      </div>
    </section>
  );
}
