import { useNavigate } from "react-router-dom";
import type { AlertCard as AlertCardType } from "@/types/alert";

function formatAlertTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
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
  const critical = alert.severity === "critical";

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
      className={[
        "animate-card-in group relative cursor-pointer overflow-hidden p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-green",
        critical
          ? "rounded-default border shadow-card"
          : "card-surface hover:border-brand-green/60",
      ].join(" ")}
      style={{
        animationDelay: `${index * 40}ms`,
        ...(critical
          ? {
              background: "color-mix(in srgb, var(--color-status-flagged) 18%, white)",
              borderColor: "color-mix(in srgb, var(--color-status-flagged) 35%, white)",
            }
          : {}),
      }}
      aria-label={`Alert for ${alert.item}: ${alert.reason}. Click to view in Voice Visualizer.`}
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-h3-default text-primary m-0 capitalize group-hover:text-accent transition-colors">
          {alert.item}
        </h3>
        <time className="text-body3-default text-tertiary shrink-0 font-medium" dateTime={alert.created_at}>
          {formatAlertTime(alert.created_at)}
        </time>
      </div>

      <p className="text-body1-default text-secondary mt-2 mb-0">{alert.supplier}</p>
      <p className="text-body1-default text-primary mt-1 mb-0">{alert.reason}</p>

      <div
        className={[
          "mt-4 flex items-center justify-between border-t pt-3",
          critical ? "border-[color-mix(in_srgb,var(--color-status-flagged)_28%,white)]" : "border-core/60",
        ].join(" ")}
      >
        <span className="text-body3-default text-accent flex items-center gap-1 font-semibold group-hover:underline">
          <span>Open voice conversation</span>
          <span aria-hidden>→</span>
        </span>
        <p className="text-body3-default text-tertiary m-0">
          <span className="font-mono text-xs">{alert.lot_code}</span>
        </p>
      </div>
    </article>
  );
}
