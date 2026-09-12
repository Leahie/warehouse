import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type SelectorOption = {
  value: string;
  label: string;
};

type Props = {
  label?: string;
  placeholder?: string;
  options: Array<string | SelectorOption>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  clearable?: boolean;
  /** When true, typing updates the value immediately (column contains-filters). */
  allowCustom?: boolean;
  leading?: ReactNode;
};

function asOptions(options: Array<string | SelectorOption>): SelectorOption[] {
  return options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

export function Selector({
  label,
  placeholder = "Search or select…",
  options,
  value,
  onChange,
  className = "",
  clearable = true,
  allowCustom = false,
  leading,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalized = useMemo(() => asOptions(options), [options]);
  const selected = normalized.find((option) => option.value === value);
  const selectedLabel = selected?.label ?? (allowCustom ? value : "");

  const filterText = typing ? query : "";
  const filtered = normalized.filter((option) =>
    option.label.toLowerCase().includes(filterText.toLowerCase().trim()),
  );

  const inputValue = typing ? query : selectedLabel;

  useEffect(() => {
    setActiveIndex(0);
  }, [filterText, open]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuBox(null);
      return;
    }
    function sync() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setMenuBox({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setTyping(false);
      setQuery("");
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function closeAndRevert() {
    setOpen(false);
    setTyping(false);
    setQuery("");
  }

  function commit(next: string) {
    onChange(next);
    setTyping(false);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange("");
    setTyping(false);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  const menu =
    open && menuBox ? (
      <div
        ref={menuRef}
        role="listbox"
        className="animate-dropdown border-core fixed z-50 max-h-56 overflow-y-auto rounded-default border bg-core-surface py-1 shadow-card"
        style={{ top: menuBox.top, left: menuBox.left, width: menuBox.width }}
      >
        {filtered.length === 0 ? (
          <div className="text-body3-default text-tertiary px-3 py-2">No matching options</div>
        ) : (
          filtered.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={[
                "text-body2-default w-full px-3 py-1.5 text-left transition-colors",
                option.value === value
                  ? "bg-brand-green-soft text-accent font-semibold"
                  : index === activeIndex
                    ? "bg-core-surface-ii text-primary"
                    : "text-primary hover:bg-core-surface-ii",
              ].join(" ")}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(option.value)}
            >
              {option.label}
            </button>
          ))
        )}
      </div>
    ) : null;

  return (
    <div className={`relative flex flex-col gap-1 ${className}`} ref={containerRef}>
      {label ? (
        <span className="text-body3-default text-secondary font-medium">{label}</span>
      ) : null}

      <div
        ref={triggerRef}
        className={[
          "border-core flex w-full items-center rounded-small border bg-core-surface",
          "focus-within:border-brand-green",
        ].join(" ")}
      >
        {leading ? (
          <span className="text-tertiary flex shrink-0 items-center pl-2.5">{leading}</span>
        ) : null}

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-label={label ?? placeholder}
          className="text-body2-default min-w-0 flex-1 bg-transparent px-3 py-2 text-primary placeholder:text-tertiary focus:outline-none"
          placeholder={placeholder}
          value={inputValue}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            const next = event.target.value;
            setTyping(true);
            setQuery(next);
            setOpen(true);
            if (allowCustom) onChange(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (filtered[activeIndex]) {
                commit(filtered[activeIndex].value);
              } else if (allowCustom) {
                setOpen(false);
                setTyping(false);
              }
            } else if (event.key === "Escape") {
              closeAndRevert();
            }
          }}
        />

        {clearable && value ? (
          <button
            type="button"
            aria-label="Clear selection"
            className="text-tertiary hover:text-primary flex h-8 w-8 shrink-0 items-center justify-center text-xs"
            onMouseDown={(event) => event.preventDefault()}
            onClick={clear}
          >
            ✕
          </button>
        ) : null}

        <button
          type="button"
          aria-label="Toggle options"
          tabIndex={-1}
          className="text-tertiary hover:text-primary flex h-8 w-8 shrink-0 items-center justify-center text-xs"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setOpen((prev) => !prev);
            if (!open) inputRef.current?.focus();
          }}
        >
          ▾
        </button>
      </div>

      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
