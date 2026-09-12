import { Outlet } from "react-router-dom";
import { AppHeader } from "./AppHeader";

export function AppShell() {
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
