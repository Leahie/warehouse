import { useMemo, useState } from "react";
import ordersData from "@/assets/data/orders.json";
import {
  FilterPopover,
  type ColumnFilterState,
  type ColumnKey,
} from "@/components/database/FilterPopover";
import { SearchableDropdown } from "@/components/database/SearchableDropdown";
import { StatusChip } from "@/components/database/StatusChip";
import type { OrderRow } from "@/types/order";

const orders = ordersData as OrderRow[];

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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const [filters, setFilters] = useState<ColumnFilterState>({});
  const [draft, setDraft] = useState<ColumnFilterState>({});
  const [openColumn, setOpenColumn] = useState<ColumnKey | null>(null);

  // Distinct options across dataset for comboboxes
  const allIndustries = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.industry) set.add(o.industry);
    });
    return Array.from(set).sort();
  }, []);

  const allItems = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => set.add(o.item));
    return Array.from(set).sort();
  }, []);

  const allQualities = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.quality) set.add(o.quality);
    });
    return Array.from(set).sort();
  }, []);

  const allSuppliersLots = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      set.add(`${o.supplier} · ${o.lot_code}`);
    });
    return Array.from(set).sort();
  }, []);

  const allDates = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => set.add(o.date));
    return Array.from(set).sort().reverse();
  }, []);

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

  const rows = useMemo(() => applyFilters(orders, filters), [filters]);

  const activeChips = Object.entries(filters).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  });

  return (
    <section className="page-pad flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h1-default text-primary m-0">Database Visualizer</h1>
          <p className="text-body3-default text-tertiary mt-1 mb-0">
            Real-time receipt ledger. Double-click any column header to filter.
          </p>
        </div>

        {/* Industry selector dropdown with typing support */}
        <div className="w-72">
          <SearchableDropdown
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

      {/* Helpful double-click banner affordance */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-default border border-brand-green/20 bg-brand-green-soft/40 px-4 py-2.5">
        <div className="flex items-center gap-2 text-body2-default text-brand-green font-medium">
          <span className="text-base">💡</span>
          <span>
            <strong>Double-click</strong> on any column header to open instant search and dropdown filters.
          </span>
        </div>
        <span className="text-body3-default text-secondary">
          Showing {rows.length} of {orders.length} orders
        </span>
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

      <div className="card-surface min-h-0 flex-1 overflow-auto">
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
                    onDoubleClick={() => {
                      setOpenColumn(col.key);
                      setDraft(filters);
                    }}
                    title="Double-click to filter this column"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-h5-default text-primary font-semibold">{col.title}</span>
                      <button
                        type="button"
                        aria-label={`Filter ${col.title}`}
                        className={[
                          "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors",
                          hasActiveFilter
                            ? "bg-brand-green text-on-brand font-bold"
                            : "bg-core-surface-ii text-tertiary group-hover:bg-brand-green-soft group-hover:text-accent",
                        ].join(" ")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenColumn(col.key);
                          setDraft(filters);
                        }}
                      >
                        <span className="font-mono text-[10px]">2×</span>
                        <span>🔍</span>
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
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="text-body1-default text-secondary px-4 py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl">📋</span>
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
                    {row.date}
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
      </div>
    </section>
  );
}
