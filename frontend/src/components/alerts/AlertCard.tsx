import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();

  function handleClick() {
    navigate(`/voice?order=${encodeURIComponent(alert.order_id)}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="card-surface animate-card-in group relative cursor-pointer overflow-hidden p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-green/60 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-green"
      style={{ animationDelay: `${index * 40}ms` }}
      aria-label={`Alert: ${alert.reason}. Click to view in Voice Visualizer.`}
    >
      {alert.severity === "critical" ? (
        <span
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ background: "var(--color-status-flagged)" }}
          aria-hidden
        />
      ) : (
        <span
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ background: "var(--color-status-pending)" }}
          aria-hidden
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-h3-default text-primary m-0 group-hover:text-accent transition-colors">
            {alert.reason}
          </h3>
        </div>
        <time className="text-body3-default text-tertiary shrink-0 font-medium" dateTime={alert.created_at}>
          {formatAlertTime(alert.created_at)}
        </time>
      </div>

      <p className="text-body1-default text-secondary mt-3 mb-0">{alert.ai_summary}</p>

      <div className="mt-4 flex items-center justify-between border-t border-core/60 pt-3">
        <span className="text-body3-default text-accent flex items-center gap-1 font-semibold group-hover:underline">
          <span>Open voice conversation</span>
          <span aria-hidden>→</span>
        </span>
        <p className="text-body3-default text-tertiary m-0">
          <span className="font-mono text-xs">{alert.lot_code}</span> · {alert.supplier}
        </p>
      </div>
    </article>
  );
}
