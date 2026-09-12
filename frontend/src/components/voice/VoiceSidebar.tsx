import type { VoiceSession } from "@/types/voice";

type Props = {
  sessions: VoiceSession[];
  activeId: string | null;
  onSelect: (sessionId: string) => void;
  onNewSession: () => void;
  /** Arrived from an alert: show only that conversation until cleared. */
  focusedId?: string | null;
  onClearFocus?: () => void;
};

function formatLogTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function sessionTitle(session: VoiceSession) {
  if (session.item) return session.item;
  if (session.stage !== "done") return "Active Voice Session";
  return session.summary ?? "Completed log";
}

function LogCard({
  session,
  active,
  onSelect,
}: {
  session: VoiceSession;
  active: boolean;
  onSelect: (sessionId: string) => void;
}) {
  const live = session.stage !== "done";

  return (
    <button
      type="button"
      className={[
        "mb-1 w-full rounded-default px-3 py-2 text-left transition-colors outline-none focus:outline-none focus-visible:outline-none",
        active ? "bg-brand-green-soft" : "hover:bg-core-surface-ii",
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
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={[
            "text-h5-default m-0 truncate capitalize",
            session.is_alert ? "text-negative" : "text-primary",
          ].join(" ")}
        >
          {sessionTitle(session)}
        </span>
        {live ? (
          <span className="text-xs shrink-0 font-medium text-brand-green">Live</span>
        ) : (
          <time
            className="text-body3-default text-tertiary shrink-0 font-medium"
            dateTime={session.created_at}
          >
            {formatLogTime(session.created_at)}
          </time>
        )}
      </div>
      {session.supplier || session.lot_code ? (
        <p className="text-body2-default text-secondary mt-0.5 mb-0 truncate">
          {session.supplier ?? "Unknown farm"}
          {session.lot_code ? (
            <>
              <span className="text-tertiary"> · </span>
              <span className="text-primary font-mono text-xs">{session.lot_code}</span>
            </>
          ) : null}
        </p>
      ) : live ? (
        <p className="text-body3-default text-tertiary mt-0.5 mb-0 truncate">
          Stage: {session.stage}
        </p>
      ) : session.order_id ? (
        <p className="text-body3-default text-tertiary mt-0.5 mb-0 truncate font-mono text-[11px]">
          {session.order_id}
        </p>
      ) : null}
    </button>
  );
}

export function VoiceSidebar({
  sessions,
  activeId,
  onSelect,
  onNewSession,
  focusedId,
  onClearFocus,
}: Props) {
  const visible = focusedId
    ? sessions.filter((s) => s.session_id === focusedId)
    : sessions;
  const activeUnfinished = visible.filter((s) => s.stage !== "done");
  const archived = visible.filter((s) => s.stage === "done");

  return (
    <aside className="border-core flex min-h-0 w-72 shrink-0 flex-col border-r bg-core-surface">
      <div className="border-core flex flex-col gap-2 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-h5-default text-primary font-semibold">Voice Logs</span>
          <span className="text-body3-default text-tertiary">
            {focusedId ? "1 shown" : `${sessions.length} total`}
          </span>
        </div>
        <button
          type="button"
          onClick={onNewSession}
          className="text-body2-heavy rounded-small bg-brand-green px-3 py-2 text-on-brand transition-opacity hover:opacity-90"
        >
          + New session
        </button>
        {focusedId && (
          <button
            type="button"
            onClick={onClearFocus}
            className="text-body3-default text-accent rounded-small px-2 py-1 text-left hover:bg-brand-green-soft"
          >
            ← Show all conversations
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {activeUnfinished.length > 0 ? (
          <div className="mb-3">
            <span className="text-body3-default text-tertiary px-2 py-1 font-semibold uppercase tracking-wider">
              In Progress
            </span>
            <ul className="mt-1 list-none p-0">
              {activeUnfinished.map((session) => (
                <li key={session.session_id}>
                  <LogCard
                    session={session}
                    active={session.session_id === activeId}
                    onSelect={onSelect}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <span className="text-body3-default text-tertiary px-2 py-1 font-semibold uppercase tracking-wider">
            Logged Conversations
          </span>
          <ul className="mt-1 list-none p-0">
            {archived.map((session) => (
              <li key={session.session_id}>
                <LogCard
                  session={session}
                  active={session.session_id === activeId}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
