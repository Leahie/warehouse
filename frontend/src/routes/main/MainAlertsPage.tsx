import { useMemo, useState } from "react";
import alertsData from "@/assets/data/alerts.json";
import { AlertCard } from "@/components/alerts/AlertCard";
import {
  AlertSummary,
  type AlertStats,
  type SeverityFilter,
} from "@/components/alerts/AlertSummary";
import { InfiniteSentinel } from "@/components/InfiniteSentinel";
import { LoadingPanel } from "@/components/LoadingIcon";
import { WEEK_MS } from "@/constants/statuses";
import type { AlertCard as AlertCardType } from "@/types/alert";
import { useAlerts, useAllAlerts } from "@/api/useLiveData";

const fallbackAlerts = alertsData as AlertCardType[];

function isWithinLastWeek(iso: string, now = Date.now()) {
  const t = new Date(iso).getTime();
  return now - t <= WEEK_MS && t <= now;
}

function localDayKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(isoDay: string, days: number) {
  const date = new Date(`${isoDay}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDayKey(date);
}

function mostCommon(values: string[]) {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function summarize(alerts: AlertCardType[]): AlertStats {
  return {
    total: alerts.length,
    topIssue: mostCommon(alerts.map((alert) => alert.reason)),
    topSupplier: mostCommon(alerts.map((alert) => alert.supplier)),
    critical: alerts.filter((alert) => alert.severity === "critical").length,
    warning: alerts.filter((alert) => alert.severity === "warning").length,
    info: alerts.filter((alert) => alert.severity === "info").length,
  };
}

function groupByDay(alerts: AlertCardType[]) {
  const groups = new Map<string, AlertCardType[]>();
  for (const alert of alerts) {
    const key = localDayKey(alert.created_at);
    const list = groups.get(key);
    if (list) list.push(alert);
    else groups.set(key, [alert]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, items]) => ({
      day,
      label: new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
      alerts: items,
    }));
}

export function MainAlertsPage() {
  const { data: alerts, hasMore, loadMore, isLive, isLoading } = useAlerts(fallbackAlerts);
  const { data: allAlerts } = useAllAlerts(fallbackAlerts);
  const [selectedDay, setSelectedDay] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("all");

  const weekly = useMemo(
    () =>
      alerts
        .filter((alert) => isWithinLastWeek(alert.created_at))
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [alerts],
  );

  const weeklyAll = useMemo(
    () => allAlerts.filter((alert) => isWithinLastWeek(alert.created_at)),
    [allAlerts],
  );

  const dayScoped = useMemo(() => {
    if (!selectedDay) return weekly;
    return weekly.filter((alert) => localDayKey(alert.created_at) === selectedDay);
  }, [weekly, selectedDay]);

  const stats = useMemo(() => {
    const scoped = selectedDay
      ? weeklyAll.filter((alert) => localDayKey(alert.created_at) === selectedDay)
      : weeklyAll;
    return summarize(scoped);
  }, [weeklyAll, selectedDay]);

  const visible = useMemo(() => {
    if (severity === "all") return dayScoped;
    return dayScoped.filter((alert) => alert.severity === severity);
  }, [dayScoped, severity]);

  const groups = useMemo(() => groupByDay(visible), [visible]);

  const maxDay = localDayKey(new Date());
  const minDay = addDays(maxDay, -6);

  return (
    <section className="page-pad flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h1 className="text-h1-default text-primary m-0">Alerts</h1>
        {!isLive && (
          <span className="text-body2-default text-secondary" title="Showing bundled sample data">
            offline sample
          </span>
        )}
      </div>

      <div className="mb-4 shrink-0">
        <AlertSummary
          stats={stats}
          selectedDay={selectedDay}
          onDayChange={setSelectedDay}
          minDay={minDay}
          maxDay={maxDay}
          severity={severity}
          onSeverityChange={setSeverity}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-1">
        {isLoading && weekly.length === 0 ? (
          <div className="flex justify-center py-10">
            <LoadingPanel label="Loading alerts…" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-body1-default text-secondary">
            {selectedDay || severity !== "all"
              ? "No alerts match these filters."
              : "No alerts in the last 7 days."}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.day} className="flex flex-col gap-3">
              <h2 className="text-h4-default text-primary m-0">{group.label}</h2>
              {group.alerts.map((alert, index) => (
                <AlertCard key={alert.alert_id} alert={alert} index={index} />
              ))}
            </section>
          ))
        )}
        <InfiniteSentinel
          onVisible={loadMore}
          disabled={!hasMore || isLoading}
          label={hasMore ? "Loading more alerts…" : ""}
        />
      </div>
    </section>
  );
}
