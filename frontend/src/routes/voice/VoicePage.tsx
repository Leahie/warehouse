import { useMemo, useState } from "react";
import voiceData from "@/assets/data/voice_sessions.json";
import { ChatBubble } from "@/components/voice/ChatBubble";
import { StageChip } from "@/components/voice/StageChip";
import { VoiceSidebar } from "@/components/voice/VoiceSidebar";
import type { VoiceSession } from "@/types/voice";

const seedSessions = voiceData as VoiceSession[];

function newBlankSession(): VoiceSession {
  return {
    session_id: `VS-${Date.now()}`,
    stage: "parsing",
    is_alert: false,
    created_at: new Date().toISOString(),
    summary: null,
    messages: [
      {
        id: "sys-1",
        role: "system",
        text: "Parsing…",
        at: new Date().toISOString(),
      },
      {
        id: "user-speaking",
        role: "user",
        text: "…",
        state: "speaking",
        at: new Date().toISOString(),
      },
    ],
  };
}

export function VoicePage() {
  const [sessions, setSessions] = useState<VoiceSession[]>(seedSessions);

  const activeId = useMemo(() => {
    const live = sessions.find((s) => s.stage !== "done");
    return live?.session_id ?? sessions[0]?.session_id ?? null;
  }, [sessions]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const currentId = selectedId ?? activeId;
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

        // logging_data -> done + open next
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

    // After finishing, append a fresh chat if needed
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
    setSessions((prev) => [...prev, blank]);
    setSelectedId(blank.session_id);
  }

  return (
    <section className="flex min-h-0 flex-1">
      <VoiceSidebar
        sessions={sessions}
        activeId={currentId}
        onSelect={(id) => setSelectedId(id)}
      />

      <div className="page-pad flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-h1-default text-primary m-0">Voice Visualizer</h1>
          {current ? <StageChip stage={current.stage} /> : null}
        </div>

        <div className="card-surface flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-1 overflow-y-auto p-4">
            {current?.messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
          </div>

          <div className="border-core flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
            <button
              type="button"
              className="text-body2-heavy rounded-small bg-brand-green px-4 py-2 text-on-brand disabled:opacity-40"
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
          </div>
        </div>
      </div>
    </section>
  );
}
