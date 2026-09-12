import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import voiceData from "@/assets/data/voice_sessions.json";
import alertsData from "@/assets/data/alerts.json";
import { ChatBubble } from "@/components/voice/ChatBubble";
import { StageChip } from "@/components/voice/StageChip";
import { VoiceSidebar } from "@/components/voice/VoiceSidebar";
import type { AlertCard } from "@/types/alert";
import type { VoiceSession } from "@/types/voice";
import { useVoiceSessions } from "@/api/useLiveData";
import { useDockMic } from "@/audio/useDockMic";
import { speechSupported, stopSpeaking } from "@/audio/speak";

const seedSessions = voiceData as VoiceSession[];
const seedIds = new Set(seedSessions.map((s) => s.session_id));
const alerts = alertsData as AlertCard[];

function newBlankSession(): VoiceSession {
  return {
    session_id: `VS-${Date.now()}`,
    stage: "parsing",
    is_alert: false,
    created_at: new Date().toISOString(),
    summary: null,
    messages: [
      {
        id: `sys-${Date.now()}`,
        role: "system",
        text: "Parsing…",
        at: new Date().toISOString(),
      },
      {
        id: `user-speaking-${Date.now()}`,
        role: "user",
        text: "…",
        state: "speaking",
        at: new Date().toISOString(),
      },
    ],
  };
}

export function VoicePage() {
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState<VoiceSession[]>(seedSessions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: liveSessions } = useVoiceSessions(seedSessions);

  // Fold server-derived sessions in on every poll without discarding sessions
  // created locally (a live recording, or one opened from an alert). Seeded
  // demo sessions drop out as soon as the API returns anything real.
  useEffect(() => {
    setSessions((prev) => {
      const liveIds = new Set(liveSessions.map((s) => s.session_id));
      const localOnly = prev.filter(
        (s) => !liveIds.has(s.session_id) && !seedIds.has(s.session_id),
      );
      return [...localOnly, ...liveSessions];
    });
  }, [liveSessions]);

  // Live dock mic: record -> Whisper on the GB10 -> match -> the agent speaks back.
  const mic = useDockMic({
    onTurn: (turn) => {
      // Jump to the order this turn touched so the transcript is on screen.
      if (turn.order?.order_id) setSelectedId(`VS-${turn.order.order_id}`);
    },
  });

  // Sync with query params (?order=... or ?session=...)
  useEffect(() => {
    const orderParam = searchParams.get("order");
    const sessionParam = searchParams.get("session");

    if (sessionParam) {
      const match = sessions.find((s) => s.session_id === sessionParam);
      if (match) {
        setSelectedId(match.session_id);
        return;
      }
    }

    if (orderParam) {
      const match = sessions.find((s) => s.order_id === orderParam);
      if (match) {
        setSelectedId(match.session_id);
        return;
      }

      // If the alert exists in alerts.json but wasn't in seed sessions, dynamically create it
      const alert = alerts.find((a) => a.order_id === orderParam);
      if (alert) {
        const created: VoiceSession = {
          session_id: `VS-ALERT-${alert.alert_id}`,
          stage: "done",
          is_alert: true,
          order_id: alert.order_id,
          created_at: alert.created_at,
          summary: `Alert (${alert.reason}): ${alert.lot_code} · ${alert.supplier}`,
          messages: [
            {
              id: `m-init-${Date.now()}`,
              role: "system",
              text: "Logging data…",
              at: alert.created_at,
            },
            {
              id: `m-agent-${Date.now()}`,
              role: "agent",
              text: `Alert Record [${alert.alert_id}]: ${alert.reason}. ${alert.ai_summary}`,
              at: alert.created_at,
            },
          ],
        };
        setSessions((prev) => [created, ...prev]);
        setSelectedId(created.session_id);
      }
    }
  }, [searchParams, sessions]);

  const activeLiveId = useMemo(() => {
    const live = sessions.find((s) => s.stage !== "done");
    return live?.session_id ?? sessions[0]?.session_id ?? null;
  }, [sessions]);

  const currentId = selectedId ?? activeLiveId;
  const current = sessions.find((s) => s.session_id === currentId) ?? null;

  function playDemoStep() {
    if (!current || current.stage === "done") return;

    setSessions((prev) =>
      prev.map((session) => {
        if (session.session_id !== current.session_id) return session;

        if (session.stage === "parsing") {
          const withoutSpeaking = session.messages.filter((m) => m.state !== "speaking");
          return {
            ...session,
            stage: "confirming",
            messages: [
              ...withoutSpeaking,
              {
                id: `u-${Date.now()}`,
                role: "user",
                text: "receiving 24 flats strawberries, lot S4410, Berry Grove",
                state: "parsed",
                at: new Date().toISOString(),
              },
              {
                id: `s-${Date.now() + 1}`,
                role: "system",
                text: "Confirming…",
                at: new Date().toISOString(),
              },
              {
                id: `a-${Date.now() + 2}`,
                role: "agent",
                text: "BoL says 24 flats, packing slip says 20. Can you confirm the count on the dock?",
                at: new Date().toISOString(),
              },
            ],
          };
        }

        if (session.stage === "confirming") {
          return {
            ...session,
            stage: "correction",
            messages: [
              ...session.messages,
              {
                id: `s-${Date.now()}`,
                role: "system",
                text: "Correction…",
                at: new Date().toISOString(),
              },
              {
                id: `u-${Date.now() + 1}`,
                role: "user",
                text: "packing slip is wrong — there are 24 on the pallet",
                state: "parsed",
                at: new Date().toISOString(),
              },
            ],
          };
        }

        if (session.stage === "correction") {
          return {
            ...session,
            stage: "logging_data",
            messages: [
              ...session.messages,
              {
                id: `s-${Date.now()}`,
                role: "system",
                text: "Logging data…",
                at: new Date().toISOString(),
              },
            ],
          };
        }

        const summary =
          "24 flats strawberries, lot S4410, Berry Grove — slip mismatch noted, worker confirmed 24.";
        return {
          ...session,
          stage: "done",
          is_alert: true,
          summary,
          messages: [
            ...session.messages,
            {
              id: `a-${Date.now()}`,
              role: "agent",
              text: `Summary: ${summary}`,
              at: new Date().toISOString(),
            },
          ],
        };
      }),
    );

    setSessions((prev) => {
      const currentSession = prev.find((s) => s.session_id === current.session_id);
      if (currentSession?.stage === "done" && !prev.some((s) => s.stage !== "done")) {
        const blank = newBlankSession();
        setSelectedId(blank.session_id);
        return [...prev, blank];
      }
      return prev;
    });
  }

  function startNextLog() {
    const blank = newBlankSession();
    setSessions((prev) => [blank, ...prev]);
    setSelectedId(blank.session_id);
  }

  return (
    <section className="flex min-h-0 flex-1">
      <VoiceSidebar
        sessions={sessions}
        activeId={currentId}
        onSelect={(id) => setSelectedId(id)}
      />

      <div className="page-pad flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-h1-default text-primary m-0">Voice Visualizer</h1>
            {current?.order_id ? (
              <span className="text-body3-default rounded-small border border-core bg-core-surface-ii px-2 py-0.5 font-mono text-secondary">
                Order: {current.order_id}
              </span>
            ) : null}
          </div>
          {current ? <StageChip stage={current.stage} /> : null}
        </div>

        <div className="card-surface flex min-h-0 flex-1 flex-col overflow-hidden">
          {current?.is_alert ? (
            <div className="flex items-center gap-2 border-b border-negative/20 bg-alert-wash px-4 py-2.5">
              <span className="text-body2-heavy text-negative">! Alert Log</span>
              <span className="text-body3-default text-secondary">
                This voice interaction flagged a discrepancy or alert.
              </span>
            </div>
          ) : null}

          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {current?.messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
          </div>

          <div className="border-core flex flex-wrap items-center justify-between gap-3 border-t bg-core-surface px-4 py-3">
            <button
              type="button"
              className="text-body2-heavy rounded-small bg-brand-green px-4 py-2 text-on-brand transition-opacity disabled:opacity-40"
              disabled={!current || current.stage === "done"}
              onClick={playDemoStep}
            >
              Play demo step
            </button>
            <button
              type="button"
              className="text-body2-default text-accent rounded-small px-4 py-2 hover:bg-brand-green-soft"
              onClick={startNextLog}
            >
              Next log →
            </button>

            <div className="flex w-full items-center gap-3 border-t border-core pt-3">
              <button
                type="button"
                onClick={mic.toggle}
                disabled={mic.state === "thinking"}
                className={[
                  "text-body2-heavy rounded-small px-4 py-2 transition-opacity disabled:opacity-40",
                  mic.state === "recording"
                    ? "bg-negative text-on-brand"
                    : "bg-brand-green text-on-brand",
                ].join(" ")}
              >
                {mic.state === "recording"
                  ? "■ Stop and send"
                  : mic.state === "thinking"
                    ? "Transcribing…"
                    : "● Talk to the dock"}
              </button>

              {mic.state === "speaking" && (
                <button
                  type="button"
                  onClick={stopSpeaking}
                  className="text-body2-default text-accent rounded-small px-3 py-2 hover:bg-brand-green-soft"
                >
                  Stop audio
                </button>
              )}

              <span className="text-body3-default min-w-0 flex-1 truncate text-secondary">
                {mic.status ||
                  (speechSupported()
                    ? "Press talk, read the packing slip aloud, then stop."
                    : "This browser cannot speak; replies will show as text only.")}
              </span>
            </div>

            {mic.lastTurn?.reply && (
              <div className="w-full rounded-small bg-core-surface-ii px-3 py-2">
                <span className="text-body3-heavy text-secondary">Agent: </span>
                <span className="text-body2-default text-primary">{mic.lastTurn.reply}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
