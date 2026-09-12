type Props = {
  count: number;
};

export function AlertBadge({ count }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-body2-heavy text-negative inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2"
        style={{ background: "var(--color-alert-wash)" }}
        aria-label={`${count} alerts in the last 7 days`}
      >
        ! {count}
      </span>
      <span className="text-body3-default text-tertiary">last 7 days</span>
    </div>
  );
}
