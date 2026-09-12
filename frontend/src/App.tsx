import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { MainAlertsPage } from "@/routes/main/MainAlertsPage";
import { LogsPage } from "@/routes/logs/LogsPage";
import { DatabasePage } from "@/routes/database/DatabasePage";
import { VoicePage } from "@/routes/voice/VoicePage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<MainAlertsPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="database" element={<DatabasePage />} />
          <Route path="voice" element={<VoicePage />} />
          <Route path="voice/:sessionId" element={<VoicePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
