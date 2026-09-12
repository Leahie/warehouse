// Microphone capture for the dock. Records at whatever rate the browser gives,
// downsamples to the 16 kHz mono WAV Whisper wants, and posts it to /api/audio.

import { useCallback, useRef, useState } from "react";
import { downsample, encodeWav } from "./wav";
import { speak, warmUpSpeech } from "./speak";
import { API_BASE } from "@/api/client";

const TARGET_RATE = 16000;

export type DockTurn = {
  event_id: string;
  mode: "receive" | "clarification_answer" | "ambiguous" | "unmatched";
  candidates?: { po_id: string; supplier: string; score: number }[];
  utterance: string;
  reply: string;
  order?: { order_id: string; status?: string } | null;
};

export type MicState = "idle" | "recording" | "thinking" | "speaking" | "error";

export function useDockMic(
  opts: {
    workerId?: string;
    /** Order shown on screen; lets "yes" resolve against the right question. */
    contextOrderId?: string | null;
    /** Conversation the turn belongs to, so the server can group it. */
    sessionId?: string | null;
    onTurn?: (t: DockTurn) => void;
  } = {},
) {
  const { workerId = "W-17", contextOrderId, sessionId, onTurn } = opts;
  // Read at send time, not capture time, so a late selection still counts.
  const contextRef = useRef<string | null | undefined>(contextOrderId);
  contextRef.current = contextOrderId;
  const sessionRef = useRef<string | null | undefined>(sessionId);
  sessionRef.current = sessionId;
  const [state, setState] = useState<MicState>("idle");
  const [status, setStatus] = useState("");
  const [lastTurn, setLastTurn] = useState<DockTurn | null>(null);

  const chunks = useRef<Float32Array[]>([]);
  const sourceRate = useRef(TARGET_RATE);
  const teardown = useRef<(() => void) | null>(null);

  const start = useCallback(async () => {
    warmUpSpeech(); // must happen inside the click, or Chrome stays mute
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      sourceRate.current = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      chunks.current = [];
      processor.onaudioprocess = (e) => {
        chunks.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(ctx.destination);
      teardown.current = () => {
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      };
      setState("recording");
      setStatus("Listening… speak the packing slip.");
    } catch (err) {
      setState("error");
      setStatus(err instanceof Error ? err.message : "microphone unavailable");
    }
  }, []);

  const stop = useCallback(async () => {
    teardown.current?.();
    teardown.current = null;

    const total = chunks.current.reduce((n, p) => n + p.length, 0);
    if (!total) {
      setState("idle");
      setStatus("Nothing recorded.");
      return;
    }
    const merged = new Float32Array(total);
    let offset = 0;
    for (const part of chunks.current) {
      merged.set(part, offset);
      offset += part.length;
    }
    const wav = encodeWav(downsample(merged, sourceRate.current, TARGET_RATE), TARGET_RATE);

    setState("thinking");
    setStatus("Transcribing on the GB10…");
    try {
      const body = new FormData();
      body.append("file", wav, "dock.wav");
      body.append("worker_id", workerId);
      if (contextRef.current) body.append("context_order_id", contextRef.current);
      if (sessionRef.current) body.append("session_id", sessionRef.current);
      const res = await fetch(`${API_BASE}/audio`, { method: "POST", body });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.detail || "upload failed");

      const turn = payload as DockTurn;
      setLastTurn(turn);
      onTurn?.(turn);
      setStatus(`Heard: “${turn.utterance}”`);

      if (turn.reply) {
        setState("speaking");
        speak(turn.reply, { onEnd: () => setState("idle") });
      } else {
        setState("idle");
      }
    } catch (err) {
      setState("error");
      setStatus(err instanceof Error ? err.message : "upload failed");
    }
  }, [workerId, onTurn]);

  const toggle = useCallback(() => {
    if (state === "recording") void stop();
    else if (state === "idle" || state === "error") void start();
  }, [state, start, stop]);

  return { state, status, lastTurn, start, stop, toggle };
}
