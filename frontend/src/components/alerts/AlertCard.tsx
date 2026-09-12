import { useNavigate } from "react-router-dom";
import type { AlertCard as AlertCardType } from "@/types/alert";

function formatAlertTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function VoiceHint() {
  return (
    <span
      className="text-accent flex shrink-0 items-center gap-0.5 opacity-0 translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0"
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="9" y="3.5" width="6" height="11" rx="3" />
        <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" />
        <path d="M12 17v3.5M9 20.5h6" />
      </svg>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}

type Props = {
  alert: AlertCardType;
  index: number;
};

export function AlertCard({ alert, index }: Props) {
  const navigate = useNavigate();
  const wash =
    alert.severity === "critical"
      ? "var(--color-status-flagged)"
      : alert.severity === "warning"
        ? "var(--color-status-pending)"
        : "var(--color-text-positive)";

  function handleClick() {
    navigate(`/voice?order=${encodeURIComponent(alert.order_id)}&focus=1`);
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
      className="card-surface animate-card-in group relative cursor-pointer overflow-hidden px-4 py-2.5 transition-all duration-200 hover:-translate-y-px hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-green"
      style={{
        animationDelay: `${index * 40}ms`,
        background: `color-mix(in srgb, ${wash} 18%, white)`,
        borderColor: `color-mix(in srgb, ${wash} 35%, white)`,
      }}
      aria-label={`Alert for ${alert.item}: ${alert.reason}. Open in Voice Visualizer.`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-h5-default text-primary m-0 truncate capitalize group-hover:text-accent transition-colors">
              {alert.item}
            </h3>
            <time className="text-body3-default text-tertiary shrink-0 font-medium" dateTime={alert.created_at}>
              {formatAlertTime(alert.created_at)}
            </time>
          </div>
          <p className="text-body2-default text-secondary mt-0.5 mb-0 truncate">
            {alert.supplier}
            <span className="text-tertiary"> · </span>
            <span className="text-primary">{alert.reason}</span>
            {alert.lot_code ? (
              <>
                <span className="text-tertiary"> · </span>
                <span className="font-mono text-xs">{alert.lot_code}</span>
              </>
            ) : null}
          </p>
        </div>
        <VoiceHint />
      </div>
    </article>
  );
}
