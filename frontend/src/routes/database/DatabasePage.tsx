import { useMemo, useState } from "react";
import ordersData from "@/assets/data/orders.json";
import {
  FilterPopover,
  type ColumnFilterState,
  type ColumnKey,
} from "@/components/database/FilterPopover";
import { StatusChip } from "@/components/database/StatusChip";
import type { OrderRow } from "@/types/order";

const orders = ordersData as OrderRow[];

const COLUMNS: { key: ColumnKey; title: string }[] = [
  { key: "date", title: "Date" },
  { key: "time_process_finished", title: "Time Process Finished" },
  { key: "item", title: "Item" },
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

  const rows = useMemo(() => applyFilters(orders, filters), [filters]);

  const activeChips = Object.entries(filters).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  });

  return (
    <section className="page-pad flex min-h-0 flex-1 flex-col gap-4">
      <h1 className="text-h1-default text-primary m-0">Database Visualizer</h1>
      <p className="text-body3-default text-tertiary m-0">
        Double-click a column header to filter.
      </p>

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {activeChips.map(([key, value]) => (
            <button
              key={key}
              type="button"
              className="text-body3-default rounded-small bg-brand-green-soft px-3 py-1 text-accent"
              onClick={() => {
                setFilters((prev) => {
                  const next = { ...prev };
                  delete next[key as ColumnKey];
                  return next;
                });
              }}
            >
              {key}: {Array.isArray(value) ? value.join(", ") : String(value)} ×
            </button>
          ))}
        </div>
      ) : null}

      <div className="card-surface min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="bg-core-surface sticky top-0 z-10">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="border-core text-h5-default text-primary relative border-b px-4 py-3 whitespace-nowrap"
                  onDoubleClick={() => {
                    setOpenColumn(col.key);
                    setDraft(filters);
                  }}
                  title="Double-click to filter"
                >
                  {col.title}
                  {openColumn === col.key ? (
                    <FilterPopover
                      column={col.key}
                      title={col.title}
                      draft={draft}
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
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="text-body1-default text-secondary px-4 py-8 text-center"
                >
                  No rows match these filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.order_id}
                  className="border-core border-b"
                  style={
                    row.status === "flagged"
                      ? { background: "var(--color-alert-wash)" }
                      : undefined
                  }
                >
                  <td className="text-body2-default text-primary px-4 py-3">{row.date}</td>
                  <td className="text-body2-default text-primary px-4 py-3">
                    {formatTime(row.time_process_finished)}
                  </td>
                  <td className="text-body2-default text-primary px-4 py-3">{row.item}</td>
                  <td className="text-body2-default text-primary px-4 py-3">
                    {row.quantity_received} / {row.quantity_expected}
                  </td>
                  <td className="text-body2-default text-primary px-4 py-3">
                    {row.quality ?? "—"}
                  </td>
                  <td className="text-body2-default text-primary px-4 py-3">
                    {row.supplier} · {row.lot_code}
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
