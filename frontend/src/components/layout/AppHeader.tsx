import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { APP_ROUTES } from "@/constants/routes";

export function AppHeader() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <header className="bg-brand-green relative z-40 flex h-14 items-center justify-between px-8">
      <Link to="/" className="text-wordmark text-on-brand no-underline">
        WareInHouse
      </Link>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          className="text-on-brand flex h-10 w-10 items-center justify-center rounded-small hover:bg-white/10"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="flex w-5 flex-col gap-1.5" aria-hidden>
            <span className="block h-0.5 w-full bg-current" />
            <span className="block h-0.5 w-full bg-current" />
            <span className="block h-0.5 w-full bg-current" />
          </span>
        </button>

        {open ? (
          <nav className="animate-dropdown border-core absolute right-0 mt-2 min-w-56 overflow-hidden rounded-default border bg-core-surface shadow-card">
            {APP_ROUTES.map((route) => (
              <NavLink
                key={route.path}
                to={route.path}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  [
                    "text-body2-default block px-4 py-3 no-underline transition-colors",
                    isActive
                      ? "bg-brand-green-soft text-accent"
                      : "text-primary hover:bg-core-surface-ii",
                  ].join(" ")
                }
              >
                {route.label}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
