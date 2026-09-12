import { useEffect, useRef, useState } from "react";

type Props = {
  label?: string;
  placeholder?: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function SearchableDropdown({
  label,
  placeholder = "Search or select…",
  options,
  value,
  onChange,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep query in sync with external value
  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(query.toLowerCase().trim()),
  );

  return (
    <div className={`relative flex flex-col gap-1 ${className}`} ref={containerRef}>
      {label ? (
        <span className="text-body3-default text-secondary font-medium">{label}</span>
      ) : null}

      <div className="relative flex items-center">
        <input
          type="text"
          className="border-core text-body2-default w-full rounded-small border bg-core-surface px-3 py-2 pr-8 text-primary placeholder:text-tertiary focus:border-brand-green focus:outline-none"
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            onChange(val);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered.length > 0) {
              onChange(filtered[0]);
              setQuery(filtered[0]);
              setOpen(false);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />

        {query ? (
          <button
            type="button"
            aria-label="Clear selection"
            className="text-tertiary hover:text-primary absolute right-6 flex h-6 w-6 items-center justify-center text-xs"
            onClick={() => {
              setQuery("");
              onChange("");
            }}
          >
            ✕
          </button>
        ) : null}

        <button
          type="button"
          aria-label="Toggle options"
          tabIndex={-1}
          className="text-tertiary hover:text-primary absolute right-1 flex h-6 w-6 items-center justify-center text-xs"
          onClick={() => setOpen((prev) => !prev)}
        >
          ▾
        </button>
      </div>

      {open ? (
        <div className="animate-dropdown border-core absolute top-full left-0 z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-default border bg-core-surface py-1 shadow-card">
          {filtered.length === 0 ? (
            <div className="text-body3-default text-tertiary px-3 py-2">No matching options</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                className={[
                  "text-body2-default w-full px-3 py-1.5 text-left transition-colors",
                  opt === value
                    ? "bg-brand-green-soft text-accent font-semibold"
                    : "text-primary hover:bg-core-surface-ii",
                ].join(" ")}
                onClick={() => {
                  onChange(opt);
                  setQuery(opt);
                  setOpen(false);
                }}
              >
                {opt}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
