import type { VoiceSession } from "@/types/voice";

type Props = {
  sessions: VoiceSession[];
  activeId: string | null;
  onSelect: (sessionId: string) => void;
};

export function VoiceSidebar({ sessions, activeId, onSelect }: Props) {
  const archived = sessions.filter((s) => s.stage === "done");

  return (
    <aside className="border-core flex w-64 shrink-0 flex-col border-r bg-core-surface">
      <div className="border-core text-h5-default text-primary border-b px-4 py-3">Logs</div>
      <ul className="m-0 list-none overflow-y-auto p-2">
        {archived.map((session) => {
          const active = session.session_id === activeId;
          return (
            <li key={session.session_id}>
              <button
                type="button"
                className={[
                  "text-body2-default mb-1 w-full rounded-default px-3 py-2 text-left transition-colors",
                  active ? "bg-brand-green-soft text-accent" : "text-primary hover:bg-core-surface-ii",
                  session.is_alert ? "border-l-4" : "",
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
                <span className={session.is_alert ? "text-negative" : undefined}>
                  {session.summary ?? "Untitled log"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
