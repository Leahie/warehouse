type Props = {
  className?: string;
  label?: string;
};

export function LoadingIcon({ className = "", label = "Loading" }: Props) {
  return (
    <span role="status" aria-label={label} className={`inline-flex ${className}`}>
      <svg
        className="loading-icon text-accent"
        width="20"
        height="20"
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
