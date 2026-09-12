export type StatusBreakdown = {
  pending_clarification: number;
  committed: number;
  flagged: number;
};

export type LogsMode = "multiple" | "single";

export type LogsQuery = {
  mode: LogsMode;
  start: string;
  end: string;
  manufacturers: string[];
};

export type LogsAggregateFile = {
  manufacturers: Record<string, Record<string, StatusBreakdown>>;
  examples?: Record<string, unknown>;
  note?: string;
};
