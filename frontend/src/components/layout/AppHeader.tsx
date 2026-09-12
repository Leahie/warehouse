import { Link, useLocation, useNavigate } from "react-router-dom";
import { Selector } from "@/components/Selector";
import { APP_ROUTES } from "@/constants/routes";

function MenuIcon() {
  return (
    <span className="flex w-4 flex-col gap-1" aria-hidden>
      <span className="block h-0.5 w-full bg-current" />
      <span className="block h-0.5 w-full bg-current" />
      <span className="block h-0.5 w-full bg-current" />
    </span>
  );
}

export function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const current =
    APP_ROUTES.find(
      (route) => location.pathname === route.path || location.pathname.startsWith(`${route.path}/`),
    ) ?? null;

  return (
    <header className="bg-brand-green relative z-40 flex h-14 items-center justify-between gap-4 px-8">
      <Link to="/" className="text-wordmark text-on-brand no-underline">
        WareInHouse
      </Link>

      <Selector
        className="w-64"
        placeholder="Go to page…"
        leading={<MenuIcon />}
        options={APP_ROUTES.map((route) => ({ value: route.path, label: route.label }))}
        value={current?.path ?? ""}
        onChange={(path) => navigate(path || "/")}
      />
    </header>
  );
}
