import type { AlertCard as AlertCardType } from "@/types/alert";

function formatAlertTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Props = {
  alert: AlertCardType;
  index: number;
};

export function AlertCard({ alert, index }: Props) {
  return (
    <article
      className="card-surface animate-card-in relative overflow-hidden p-6"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {alert.severity === "critical" ? (
        <span
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: "var(--color-status-flagged)" }}
          aria-hidden
        />
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <h3 className="text-h3-default text-primary m-0">{alert.reason}</h3>
        <time className="text-body3-default text-tertiary shrink-0" dateTime={alert.created_at}>
          {formatAlertTime(alert.created_at)}
        </time>
      </div>

      <p className="text-body1-default text-secondary mt-3 mb-0">{alert.ai_summary}</p>

      <p className="text-body3-default text-tertiary mt-4 mb-0 text-right">
        {alert.lot_code} · {alert.supplier}
      </p>
    </article>
  );
}
