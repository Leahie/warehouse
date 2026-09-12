import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import voiceData from "@/assets/data/voice_sessions.json";
import alertsData from "@/assets/data/alerts.json";
import { ChatBubble } from "@/components/voice/ChatBubble";
import { StageChip } from "@/components/voice/StageChip";
import { VoiceSidebar } from "@/components/voice/VoiceSidebar";
import type { AlertCard } from "@/types/alert";
import type { ChatMessage, VoiceSession } from "@/types/voice";
import { useVoiceSessions } from "@/api/useLiveData";
import { useDockMic } from "@/audio/useDockMic";
import { speechSupported, stopSpeaking } from "@/audio/speak";

const seedSessions = voiceData as VoiceSession[];
const seedIds = new Set(seedSessions.map((s) => s.session_id));

// A scratch conversation so the dock can be demonstrated without a matching
// order on file. Every turn that does not resolve to an order lands here
// instead of disappearing.
const SCRATCH_PREFIX = "VS-S-";
const isScratch = (id: string | null | undefined) => !!id?.startsWith(SCRATCH_PREFIX);
const newScratchId = () => `${SCRATCH_PREFIX}${Date.now().toString(36)}`;

function blankScratch(id: string = newScratchId()): VoiceSession {
  return {
    session_id: id,
    stage: "parsing",
    is_alert: false,
    created_at: new Date().toISOString(),
    summary: null,
    messages: [],
  };
}
const alerts = alertsData as AlertCard[];

export function VoicePage() {
  const [searchParams] = useSearchParams();
  const { sessionId: routeSessionId } = useParams();
  const navigate = useNavigate();
  // Three layers, kept apart so a 4-second poll cannot wipe local work:
  //   liveSessions  derived from the API, replaced wholesale on every poll
  //   localSessions created in the browser (a blank log, an alert drill-down)
  //   overrides     local edits to any session, which win over the live copy
  const [localSessions, setLocalSessions] = useState<VoiceSession[]>([]);
  const [overrides, setOverrides] = useState<Record<string, VoiceSession>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The mic callback runs long after render, so it reads sessions through a ref.
  const sessionsRef = useRef<VoiceSession[]>([]);
  // The order the worker is looking at, sent with each recording.
  const currentOrderRef = useRef<string | null>(null);
  const currentIdRef = useRef<string | null>(null);
  const { data: liveSessions, isLoading } = useVoiceSessions(seedSessions);

  const sessions = useMemo(() => {
    const liveIds = new Set(liveSessions.map((s) => s.session_id));
    const localOnly = localSessions.filter(
      (s) => !liveIds.has(s.session_id) && !seedIds.has(s.session_id),
    );
    return [...localOnly, ...liveSessions].map((s) => overrides[s.session_id] ?? s);
  }, [liveSessions, localSessions, overrides]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Live dock mic: record -> Whisper on the GB10 -> match -> the agent speaks back.
  const mic = useDockMic({
    contextOrderId: currentOrderRef.current,
    sessionId: currentIdRef.current,
    onTurn: (turn) => {
      const viewing = currentIdRef.current;
      const orderThread = turn.order?.order_id ? `VS-${turn.order.order_id}` : null;

      // Where the exchange lives. A thread already tied to an order stays put.
      // An ad-hoc thread that has just identified an order graduates into that
      // order's conversation, carrying every message with it so nothing splits.
      const startedIn = viewing ?? newScratchId();
      const targetId = isScratch(startedIn) && orderThread ? orderThread : startedIn;
      const migrating = targetId !== startedIn;

      const now = new Date().toISOString();
      const heard: ChatMessage = {
        id: `u-${turn.event_id}`,
        role: "user",
        text: turn.utterance,
        state: "parsed",
        at: now,
      };
      const said: ChatMessage = {
        id: `a-${turn.event_id}`,
        role: "agent",
        text: turn.reply,
        at: now,
      };

      // Show the exchange now. Waiting for the next poll makes the dock feel
      // broken, and an unresolved turn never arrives from the server at all.
      setOverrides((prev) => {
        const find = (id: string) =>
          prev[id] ?? sessionsRef.current.find((s) => s.session_id === id) ?? null;
        const carried = migrating ? find(startedIn)?.messages ?? [] : [];
        const base = find(targetId) ?? blankScratch(targetId);
        const merged: VoiceSession = {
          ...base,
          session_id: targetId,
          order_id: turn.order?.order_id ?? base.order_id,
          is_alert: turn.order?.status === "flagged" || base.is_alert,
          stage: turn.mode === "clarification_answer" ? "logging_data" : "confirming",
          messages: [...carried, ...base.messages, heard, said],
        };
        const next: Record<string, VoiceSession> = { ...prev, [targetId]: merged };
        if (migrating) delete next[startedIn];
        return next;
      });

      if (migrating) {
        setLocalSessions((prev) => prev.filter((s) => s.session_id !== startedIn));
      } else if (isScratch(targetId)) {
        setLocalSessions((prev) =>
          prev.some((s) => s.session_id === targetId) ? prev : [blankScratch(targetId), ...prev],
        );
      }

      if (currentIdRef.current !== targetId) {
        setSelectedId(targetId);
        navigate(`/voice/${encodeURIComponent(targetId)}`);
      }
    },
  });

  // Sync with query params (?order=... or ?session=...)
  //
  // This effect also depends on `sessions`, which gets a fresh identity on every
  // poll. Without a guard it re-applies the deep link every few seconds and
  // yanks the selection back, so a click in the sidebar appears to do nothing.
  // Honour a given ?order=/?session= once, then leave the user alone.
  const appliedDeepLink = useRef<string | null>(null);
  useEffect(() => {
    const orderParam = searchParams.get("order");
    const sessionParam = searchParams.get("session");
    const key = `${sessionParam ?? ""}|${orderParam ?? ""}`;
    if (key === "|") return;
    if (appliedDeepLink.current === key) return;

    if (sessionParam) {
      const match = sessions.find((s) => s.session_id === sessionParam);
      if (match) {
        appliedDeepLink.current = key;
        setSelectedId(match.session_id);
        return;
      }
    }

    if (orderParam) {
      const match = sessions.find((s) => s.order_id === orderParam);
      if (match) {
        appliedDeepLink.current = key;
        setSelectedId(match.session_id);
        navigate(`/voice/${encodeURIComponent(match.session_id)}`, { replace: true });
        return;
      }

      // An alert is the outcome of a conversation, so open that conversation --
      // the worker saying what they counted and the agent questioning it. Only
      // when no exchange was ever recorded do we fall back to a placeholder, and
      // it says so rather than presenting itself as the conversation.
      const alert = alerts.find((a) => a.order_id === orderParam);
      if (alert) {
        const placeholder: VoiceSession = {
          session_id: `VS-ALERT-${alert.alert_id}`,
          stage: "done",
          is_alert: true,
          order_id: alert.order_id,
          created_at: alert.created_at,
          summary: `No recorded conversation for ${alert.order_id}`,
          messages: [
            {
              id: `m-note-${alert.alert_id}`,
              role: "system",
              text:
                `No voice exchange was recorded for ${alert.order_id}. ` +
                `This alert was raised from the paperwork: ${alert.reason}.`,
              at: alert.created_at,
            },
          ],
        };
        appliedDeepLink.current = key;
        setLocalSessions((prev) =>
          prev.some((s) => s.session_id === placeholder.session_id)
            ? prev
            : [placeholder, ...prev],
        );
        setSelectedId(placeholder.session_id);
        navigate(`/voice/${encodeURIComponent(placeholder.session_id)}`, { replace: true });
      }
    }
  }, [searchParams, sessions]);

  const activeLiveId = useMemo(() => {
    const live = sessions.find((s) => s.stage !== "done");
    return live?.session_id ?? sessions[0]?.session_id ?? null;
  }, [sessions]);

  // The URL owns the selection so a conversation can be linked and reloaded.
  const currentId = routeSessionId ?? selectedId ?? activeLiveId;
  const current = sessions.find((s) => s.session_id === currentId) ?? null;

  useEffect(() => {
    currentOrderRef.current = current?.order_id ?? null;
    currentIdRef.current = currentId;
  }, [current, currentId]);

  function playDemoStep() {
    if (!current || current.stage === "done") return;

    setOverrides((prev) => {
      const advanced = ((session: VoiceSession): VoiceSession => {
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
      })(current);
      return { ...prev, [current.session_id]: advanced };
    });
  }

  /** Open an empty conversation that is not attached to any order on file. */
  function openScratch() {
    const blank = blankScratch();
    setLocalSessions((prev) => [blank, ...prev]);
    setOverrides((prev) => ({ ...prev, [blank.session_id]: blank }));
    setSelectedId(blank.session_id);
    navigate(`/voice/${encodeURIComponent(blank.session_id)}`);
  }

  return (
    <section className="flex min-h-0 flex-1">
      <VoiceSidebar
        sessions={sessions}
        activeId={currentId}
        onSelect={(id) => {
          setSelectedId(id);
          navigate(`/voice/${encodeURIComponent(id)}`);
        }}
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
            {isLoading && !current ? (
              <p className="text-body2-default text-secondary">Loading voice logs…</p>
            ) : (
              current?.messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))
            )}
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
              className="text-body2-default text-accent rounded-small border border-core px-4 py-2 hover:bg-brand-green-soft"
              onClick={openScratch}
            >
              + Blank session
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
