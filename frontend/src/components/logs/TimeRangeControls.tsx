import { DatePicker } from "@/components/DatePicker";
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
    <div className="card-surface relative z-50 flex flex-wrap items-end justify-start gap-4 p-4">
      <div className="flex flex-col gap-1">
        <span className="text-body2-default text-secondary">Time range</span>
        <div className="flex items-center gap-2">
          <DatePicker
            value={start}
            onChange={onStartChange}
            max={end}
            allowAll={false}
            ariaLabel="Start date"
            align="left"
          />
          <span className="text-tertiary">–</span>
          <DatePicker
            value={end}
            onChange={onEndChange}
            min={start}
            allowAll={false}
            ariaLabel="End date"
            align="left"
          />
        </div>
      </div>

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
