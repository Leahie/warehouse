import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
  /**
   * Searchable text field when true. When false, the trigger is a solid
   * dropdown button — click to pick, no typing.
   */
  editable?: boolean;
  leading?: ReactNode;
  /**
   * When false, the option list stays in the same dialog as the input so a
   * parent popover does not treat a click as "outside" and close.
   */
  portal?: boolean;
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
  editable = true,
  leading,
  portal = true,
}: Props) {
  const [open, setOpen] = useState(!portal);
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function setTriggerEl(node: HTMLElement | null) {
    triggerRef.current = node;
  }

  const normalized = useMemo(() => asOptions(options), [options]);
  const selected = normalized.find((option) => option.value === value);
  const selectedLabel = selected?.label ?? (allowCustom && editable ? value : "");

  const filterText = editable && typing ? query : "";
  const filtered = normalized.filter((option) =>
    option.label.toLowerCase().includes(filterText.toLowerCase().trim()),
  );

  const inputValue = typing ? query : selectedLabel;
  const displayLabel = selectedLabel || placeholder;

  useEffect(() => {
    setActiveIndex(0);
  }, [filterText, open]);

  useLayoutEffect(() => {
    if (!open || !portal) {
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
  }, [open, portal]);

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
    if (portal) setOpen(false);
  }

  function clear() {
    onChange("");
    setTyping(false);
    setQuery("");
    if (portal) setOpen(false);
    if (portal) inputRef.current?.blur();
  }

  function moveActive(delta: number) {
    setOpen(true);
    setActiveIndex((index) => {
      const last = Math.max(filtered.length - 1, 0);
      return Math.min(Math.max(index + delta, 0), last);
    });
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (filtered[activeIndex]) {
        commit(filtered[activeIndex].value);
      } else if (editable && allowCustom) {
        setOpen(false);
        setTyping(false);
      } else if (!editable) {
        setOpen((prev) => !prev);
      }
    } else if (event.key === " " && !editable) {
      event.preventDefault();
      setOpen((prev) => !prev);
    } else if (event.key === "Escape") {
      closeAndRevert();
    }
  }

  const menuBody =
    filtered.length === 0 ? (
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
    );

  const menu =
    open && (portal ? menuBox : true) ? (
      <div
        ref={menuRef}
        data-selector-menu=""
        role="listbox"
        className={
          portal
            ? "animate-dropdown border-core fixed z-50 max-h-56 overflow-y-auto rounded-default border bg-core-surface py-1 shadow-card"
            : "border-core mt-1 max-h-44 overflow-y-auto rounded-default border bg-core-surface-ii/50 py-1"
        }
        style={
          portal && menuBox
            ? {
                top: menuBox.top,
                width: editable ? menuBox.width : Math.max(menuBox.width, 220),
                left: editable
                  ? menuBox.left
                  : Math.max(8, menuBox.left + menuBox.width - Math.max(menuBox.width, 220)),
              }
            : undefined
        }
      >
        {menuBody}
      </div>
    ) : null;

  return (
    <div className={`relative flex flex-col gap-1 ${className}`} ref={containerRef}>
      {label ? (
        <span className="text-body3-default text-secondary font-medium">{label}</span>
      ) : null}

      {editable ? (
        <div
          ref={setTriggerEl}
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
            onKeyDown={onTriggerKeyDown}
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
      ) : (
        <button
          ref={setTriggerEl}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={label ?? placeholder}
          className={[
            "text-body2-heavy inline-flex items-center gap-2 rounded-small px-3 py-2",
            "bg-brand-green-soft text-accent transition-opacity hover:opacity-90",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
          ].join(" ")}
          onClick={() => setOpen((prev) => !prev)}
          onKeyDown={onTriggerKeyDown}
        >
          {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
          <span className="min-w-0 flex-1 truncate text-left">{displayLabel}</span>
          <span className="shrink-0 text-xs" aria-hidden>
            ▾
          </span>
        </button>
      )}

      {menu ? (portal ? createPortal(menu, document.body) : menu) : null}
    </div>
  );
}
