type IconProps = {
  className?: string;
  label?: string;
  size?: number;
};

export function LoadingIcon({ className = "", label = "Loading", size = 20 }: IconProps) {
  return (
    <span role="status" aria-label={label} className={`inline-flex ${className}`}>
      <svg
        className="loading-icon text-accent"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

type PanelProps = {
  label?: string;
  className?: string;
};

/** Compact card that pops in the same way alert rows do. */
export function LoadingPanel({ label = "Loading…", className = "" }: PanelProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`card-surface animate-card-in inline-flex items-center gap-3 px-5 py-3.5 ${className}`}
    >
      <LoadingIcon label={label} size={22} />
      <p className="text-body1-default text-secondary m-0">{label}</p>
    </div>
  );
}
