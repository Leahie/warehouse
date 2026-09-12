import alertsData from "@/assets/data/alerts.json";
import { AlertBadge } from "@/components/alerts/AlertBadge";
import { AlertCard } from "@/components/alerts/AlertCard";
import { WEEK_MS } from "@/constants/statuses";
import type { AlertCard as AlertCardType } from "@/types/alert";
import { useAlerts } from "@/api/useLiveData";

const fallbackAlerts = alertsData as AlertCardType[];

function isWithinLastWeek(iso: string, now = Date.now()) {
  const t = new Date(iso).getTime();
  return now - t <= WEEK_MS && t <= now;
}

export function MainAlertsPage() {
  const { data: alerts, isLive, isLoading } = useAlerts(fallbackAlerts);
  const weekly = alerts
    .filter((alert) => isWithinLastWeek(alert.created_at))
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  return (
    <section className="page-pad flex min-h-0 flex-1 flex-col">
      <div className="mb-6 flex items-start justify-between gap-4">
        <h1 className="text-h1-default text-primary m-0">Alerts</h1>
        <div className="flex items-center gap-3">
          {!isLive && (
            <span className="text-body2-default text-secondary" title="Showing bundled sample data">
              offline sample
            </span>
          )}
          <AlertBadge count={weekly.length} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {isLoading ? (
          <p className="text-body1-default text-secondary">Loading alerts…</p>
        ) : weekly.length === 0 ? (
          <p className="text-body1-default text-secondary">No alerts in the last 7 days.</p>
        ) : (
          weekly.map((alert, index) => (
            <AlertCard key={alert.alert_id} alert={alert} index={index} />
          ))
        )}
      </div>
    </section>
  );
}
