import type { LogsMode } from "@/types/logs";

type Props = {
  start: string;
  end: string;
  mode: LogsMode | null;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onModeChange: (mode: LogsMode) => void;
};

export function TimeRangeControls({
  start,
  end,
  mode,
  onStartChange,
  onEndChange,
  onModeChange,
}: Props) {
  return (
    <div className="card-surface flex flex-wrap items-end justify-start gap-4 p-4">
      <label className="flex flex-col gap-1">
        <span className="text-body2-default text-secondary">Time range</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="border-core text-body2-default rounded-small border px-3 py-2"
            value={start}
            onChange={(e) => onStartChange(e.target.value)}
          />
          <span className="text-tertiary">–</span>
          <input
            type="date"
            className="border-core text-body2-default rounded-small border px-3 py-2"
            value={end}
            onChange={(e) => onEndChange(e.target.value)}
          />
        </div>
      </label>

      <div className="flex overflow-hidden rounded-small border border-core">
        {(["multiple", "single"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={[
              "text-body2-heavy px-4 py-2 capitalize",
              mode === option
                ? "bg-brand-green text-on-brand"
                : "bg-core-surface text-primary hover:bg-core-surface-ii",
            ].join(" ")}
            onClick={() => onModeChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
