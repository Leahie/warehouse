import { useEffect, useRef } from "react";
import type { OrderStatus } from "@/types/order";
import { STATUS_LABELS } from "@/constants/statuses";

export type ColumnKey =
  | "date"
  | "time_process_finished"
  | "item"
  | "quantity"
  | "quality"
  | "supplier_lot"
  | "status";

export type ColumnFilterState = {
  date?: string;
  time_process_finished?: string;
  item?: string;
  quantity?: string;
  quality?: string;
  supplier_lot?: string;
  status?: OrderStatus[];
};

type Props = {
  column: ColumnKey;
  title: string;
  draft: ColumnFilterState;
  onChange: (next: ColumnFilterState) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
};

const STATUS_OPTIONS: OrderStatus[] = [
  "pending_clarification",
  "committed",
  "flagged",
];

export function FilterPopover({
  column,
  title,
  draft,
  onChange,
  onApply,
  onClear,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="animate-dropdown border-core absolute top-full left-0 z-20 mt-2 w-72 rounded-large border bg-core-surface p-4 shadow-card"
      role="dialog"
      aria-label={`Filter ${title}`}
    >
      <h4 className="text-h4-default text-primary m-0 mb-3">Filter {title}</h4>

      {column === "date" ? (
        <input
          type="date"
          className="border-core text-body2-default w-full rounded-small border px-3 py-2"
          value={draft.date ?? ""}
          onChange={(e) => onChange({ ...draft, date: e.target.value })}
        />
      ) : null}

      {column === "time_process_finished" ? (
        <input
          type="text"
          placeholder="Contains time text (e.g. 14:)"
          className="border-core text-body2-default w-full rounded-small border px-3 py-2"
          value={draft.time_process_finished ?? ""}
          onChange={(e) => onChange({ ...draft, time_process_finished: e.target.value })}
        />
      ) : null}

      {column === "item" || column === "quality" || column === "supplier_lot" ? (
        <input
          type="text"
          placeholder="Contains…"
          className="border-core text-body2-default w-full rounded-small border px-3 py-2"
          value={(draft[column] as string | undefined) ?? ""}
          onChange={(e) => onChange({ ...draft, [column]: e.target.value })}
        />
      ) : null}

      {column === "quantity" ? (
        <input
          type="number"
          placeholder="Exact received qty"
          className="border-core text-body2-default w-full rounded-small border px-3 py-2"
          value={draft.quantity ?? ""}
          onChange={(e) => onChange({ ...draft, quantity: e.target.value })}
        />
      ) : null}

      {column === "status" ? (
        <div className="flex flex-col gap-2">
          {STATUS_OPTIONS.map((status) => {
            const checked = draft.status?.includes(status) ?? false;
            return (
              <label key={status} className="text-body2-default text-primary flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const current = draft.status ?? [];
                    const next = checked
                      ? current.filter((s) => s !== status)
                      : [...current, status];
                    onChange({ ...draft, status: next });
                  }}
                />
                {STATUS_LABELS[status]}
              </label>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className="text-body2-default text-secondary rounded-small px-3 py-2 hover:bg-core-surface-ii"
          onClick={onClear}
        >
          Clear
        </button>
        <button
          type="button"
          className="text-body2-heavy rounded-small bg-brand-green px-3 py-2 text-on-brand"
          onClick={onApply}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
