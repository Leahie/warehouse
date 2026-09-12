import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  value: string;
  onChange: (day: string) => void;
  min?: string;
  max?: string;
  allowAll?: boolean;
  allLabel?: string;
  ariaLabel?: string;
  align?: "left" | "right";
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatLabel(iso: string) {
  return parseDay(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10h17" />
    </svg>
  );
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  allowAll = true,
  allLabel = "All days",
  ariaLabel = "Choose a day",
  align = "right",
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initial = parseDay(value || max || formatKey(new Date()));
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  useEffect(() => {
    if (!value) return;
    const next = parseDay(value);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  }, [value]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuBox(null);
      return;
    }
    function sync() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = 288;
      const left =
        align === "right"
          ? Math.max(8, rect.right - width)
          : Math.min(rect.left, window.innerWidth - width - 8);
      setMenuBox({ top: rect.bottom + 8, left });
    }
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open, align]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const minDate = min ? parseDay(min) : null;
  const maxDate = max ? parseDay(max) : null;

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const startPad = first.getDay();
    const count = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const days: (string | null)[] = Array.from({ length: startPad }, () => null);
    for (let day = 1; day <= count; day += 1) {
      days.push(formatKey(new Date(cursor.year, cursor.month, day)));
    }
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [cursor.year, cursor.month]);

  function inRange(iso: string) {
    const date = parseDay(iso);
    if (minDate && date < minDate) return false;
    if (maxDate && date > maxDate) return false;
    return true;
  }

  const triggerLabel = value ? formatLabel(value) : allLabel;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={[
          "text-body2-heavy flex items-center gap-2 rounded-small border px-3 py-2 transition-colors",
          open || (allowAll && value)
            ? "border-brand-green bg-brand-green-soft text-accent"
            : "border-core bg-core-surface text-primary hover:border-brand-green hover:bg-brand-green-soft/50",
        ].join(" ")}
        onClick={() => setOpen((prev) => !prev)}
      >
        <CalendarIcon />
        <span>{triggerLabel}</span>
      </button>

      {open && menuBox
        ? createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label={ariaLabel}
          className="animate-dropdown border-core fixed w-72 overflow-hidden rounded-default border bg-core-surface p-3 shadow-card"
          style={{ top: menuBox.top, left: menuBox.left, zIndex: 9999 }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-h3-default text-primary flex h-8 w-8 items-center justify-center rounded-small hover:bg-core-surface-ii"
              aria-label="Previous month"
              onClick={() =>
                setCursor((prev) => {
                  const date = new Date(prev.year, prev.month - 1, 1);
                  return { year: date.getFullYear(), month: date.getMonth() };
                })
              }
            >
              ‹
            </button>
            <p className="text-body2-heavy text-primary m-0">{monthLabel(cursor.year, cursor.month)}</p>
            <button
              type="button"
              className="text-h3-default text-primary flex h-8 w-8 items-center justify-center rounded-small hover:bg-core-surface-ii"
              aria-label="Next month"
              onClick={() =>
                setCursor((prev) => {
                  const date = new Date(prev.year, prev.month + 1, 1);
                  return { year: date.getFullYear(), month: date.getMonth() };
                })
              }
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 text-center">
            {WEEKDAYS.map((day) => (
              <span key={day} className="text-body3-default text-tertiary py-1">
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {cells.map((iso, index) => {
              if (!iso) return <span key={`empty-${index}`} />;
              const enabled = inRange(iso);
              const selected = iso === value;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!enabled}
                  className={[
                    "text-body2-default h-8 rounded-small",
                    selected
                      ? "bg-brand-green text-on-brand font-semibold"
                      : enabled
                        ? "text-primary hover:bg-brand-green-soft"
                        : "cursor-not-allowed text-tertiary opacity-35",
                  ].join(" ")}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                >
                  {parseDay(iso).getDate()}
                </button>
              );
            })}
          </div>

          {allowAll ? (
            <button
              type="button"
              className={[
                "text-body2-heavy mt-2 w-full rounded-small px-3 py-1.5",
                value
                  ? "text-accent hover:bg-brand-green-soft"
                  : "bg-brand-green text-on-brand",
              ].join(" ")}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {allLabel}
            </button>
          ) : null}
        </div>,
        document.body,
      )
    : null}
    </div>
  );
}
