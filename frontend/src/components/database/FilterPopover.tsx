import { useEffect, useRef } from "react";
import type { OrderStatus } from "@/types/order";
import { STATUS_LABELS } from "@/constants/statuses";
import { Selector } from "@/components/Selector";

export type ColumnKey =
  | "date"
  | "time_process_finished"
  | "item"
  | "industry"
  | "quantity"
  | "quality"
  | "supplier_lot"
  | "status";

export type ColumnFilterState = {
  date?: string;
  time_process_finished?: string;
  item?: string;
  industry?: string;
  quantity?: string;
  quality?: string;
  supplier_lot?: string;
  status?: OrderStatus[];
};

type Props = {
  column: ColumnKey;
  title: string;
  draft: ColumnFilterState;
  options?: string[];
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
  options = [],
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
      className="animate-dropdown border-core absolute top-full left-0 z-40 mt-2 w-80 rounded-large border bg-core-surface p-4 shadow-card"
      role="dialog"
      aria-label={`Filter ${title}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-h4-default text-primary m-0">Filter {title}</h4>
        <button
          type="button"
          aria-label="Close"
          className="text-tertiary hover:text-primary text-sm"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {column === "date" ? (
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-body3-default text-secondary">Pick specific date:</span>
            <input
              type="date"
              className="border-core text-body2-default w-full rounded-small border px-3 py-2"
              value={draft.date ?? ""}
              onChange={(e) => onChange({ ...draft, date: e.target.value })}
            />
          </label>
          {options.length > 0 ? (
            <div>
              <span className="text-body3-default text-tertiary block mb-1">Or choose an order date:</span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {options.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={[
                      "text-body3-default rounded-small px-2 py-1 border transition-colors",
                      draft.date === d
                        ? "bg-brand-green text-on-brand border-brand-green"
                        : "bg-core-surface-ii text-secondary border-core hover:border-brand-green",
                    ].join(" ")}
                    onClick={() => onChange({ ...draft, date: d })}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {column === "time_process_finished" ? (
        <div className="flex flex-col gap-1">
          <span className="text-body3-default text-secondary">Contains time text (e.g. 14:):</span>
          <input
            type="text"
            placeholder="e.g. 14: or 15:30"
            className="border-core text-body2-default w-full rounded-small border px-3 py-2"
            value={draft.time_process_finished ?? ""}
            onChange={(e) => onChange({ ...draft, time_process_finished: e.target.value })}
          />
        </div>
      ) : null}

      {column === "item" || column === "industry" || column === "quality" || column === "supplier_lot" ? (
        <div className="flex flex-col gap-1">
          <Selector
            label={`Select or type ${title}:`}
            placeholder={`Type to search ${title.toLowerCase()}…`}
            options={options}
            value={(draft[column] as string | undefined) ?? ""}
            onChange={(val) => onChange({ ...draft, [column]: val })}
            allowCustom
          />
        </div>
      ) : null}

      {column === "quantity" ? (
        <div className="flex flex-col gap-1">
          <span className="text-body3-default text-secondary">Exact received quantity:</span>
          <input
            type="number"
            placeholder="e.g. 40"
            className="border-core text-body2-default w-full rounded-small border px-3 py-2"
            value={draft.quantity ?? ""}
            onChange={(e) => onChange({ ...draft, quantity: e.target.value })}
          />
        </div>
      ) : null}

      {column === "status" ? (
        <div className="flex flex-col gap-2">
          <span className="text-body3-default text-secondary font-medium">Select statuses:</span>
          {STATUS_OPTIONS.map((status) => {
            const checked = draft.status?.includes(status) ?? false;
            return (
              <label key={status} className="text-body2-default text-primary flex cursor-pointer items-center gap-2">
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

      <div className="mt-4 flex justify-end gap-2 border-t border-core/60 pt-3">
        <button
          type="button"
          className="text-body2-default text-secondary rounded-small px-3 py-1.5 hover:bg-core-surface-ii"
          onClick={onClear}
        >
          Clear
        </button>
        <button
          type="button"
          className="text-body2-heavy rounded-small bg-brand-green px-4 py-1.5 text-on-brand hover:opacity-90"
          onClick={onApply}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
