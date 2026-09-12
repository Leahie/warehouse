import type { VoiceSession } from "@/types/voice";

type Props = {
  sessions: VoiceSession[];
  activeId: string | null;
  onSelect: (sessionId: string) => void;
};

export function VoiceSidebar({ sessions, activeId, onSelect }: Props) {
  const activeUnfinished = sessions.filter((s) => s.stage !== "done");
  const archived = sessions.filter((s) => s.stage === "done");

  return (
    <aside className="border-core flex w-72 shrink-0 flex-col border-r bg-core-surface">
      <div className="border-core flex items-center justify-between border-b px-4 py-3">
        <span className="text-h5-default text-primary font-semibold">Voice Logs</span>
        <span className="text-body3-default text-tertiary">{sessions.length} total</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {activeUnfinished.length > 0 ? (
          <div className="mb-3">
            <span className="text-body3-default text-tertiary px-2 py-1 font-semibold uppercase tracking-wider">
              In Progress
            </span>
            <ul className="mt-1 list-none p-0">
              {activeUnfinished.map((session) => {
                const active = session.session_id === activeId;
                return (
                  <li key={session.session_id}>
                    <button
                      type="button"
                      className={[
                        "text-body2-default mb-1 w-full rounded-default px-3 py-2 text-left transition-colors",
                        active
                          ? "bg-brand-green-soft text-accent font-semibold"
                          : "text-primary hover:bg-core-surface-ii",
                      ].join(" ")}
                      onClick={() => onSelect(session.session_id)}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">Active Voice Session</span>
                        <span className="text-xs text-brand-green font-medium">Live</span>
                      </div>
                      <div className="text-body3-default text-tertiary mt-0.5 truncate">
                        Stage: {session.stage}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div>
          <span className="text-body3-default text-tertiary px-2 py-1 font-semibold uppercase tracking-wider">
            Logged Conversations
          </span>
          <ul className="mt-1 list-none p-0">
            {archived.map((session) => {
              const active = session.session_id === activeId;
              return (
                <li key={session.session_id}>
                  <button
                    type="button"
                    className={[
                      "text-body2-default mb-1 w-full rounded-default px-3 py-2 text-left transition-colors",
                      active
                        ? "ring-2 ring-brand-green bg-brand-green-soft/40 text-primary font-medium"
                        : "text-primary hover:bg-core-surface-ii",
                      session.is_alert ? "border-l-4" : "border-l-2 border-transparent",
                    ].join(" ")}
                    style={
                      session.is_alert
                        ? {
                            borderLeftColor: "var(--color-status-flagged)",
                            background: active ? undefined : "var(--color-alert-wash)",
                          }
                        : undefined
                    }
                    onClick={() => onSelect(session.session_id)}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span
                        className={[
                          "line-clamp-2 text-sm leading-snug",
                          session.is_alert ? "text-negative font-semibold" : "text-primary",
                        ].join(" ")}
                      >
                        {session.is_alert ? "⚠ " : ""}{session.summary ?? "Completed log"}
                      </span>
                    </div>
                    {session.order_id ? (
                      <span className="text-body3-default text-tertiary mt-1 block font-mono text-[11px]">
                        {session.order_id}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </aside>
  );
}
