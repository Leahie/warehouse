import { useRef, useState } from "react";
import { downsample, encodeWav } from "../audio/wav";
import { useEventStream } from "../hooks/useEventStream";

const TARGET_RATE = 16000;

export function VoicePane() {
  const events = useEventStream("voice");
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("");
  const chunks = useRef<Float32Array[]>([]);
  const sampleRate = useRef(TARGET_RATE);
  const stopRef = useRef<(() => void) | null>(null);

  async function start() {
    setStatus("Allow the microphone, then speak the packing slip.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    sampleRate.current = ctx.sampleRate;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    chunks.current = [];
    processor.onaudioprocess = (event) => {
      chunks.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    stopRef.current = () => {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      void ctx.close();
    };
    setRecording(true);
    setStatus("Recording…");
  }

  async function stop() {
    stopRef.current?.();
    stopRef.current = null;
    setRecording(false);
    const total = chunks.current.reduce((n, part) => n + part.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const part of chunks.current) {
      merged.set(part, offset);
      offset += part.length;
    }
    const pcm = downsample(merged, sampleRate.current, TARGET_RATE);
    const wav = encodeWav(pcm, TARGET_RATE);
    setStatus("Sending to Whisper on this box…");
    try {
      const body = new FormData();
      body.append("file", wav, "dock.wav");
      body.append("worker_id", "W-17");
      const res = await fetch("/api/audio", { method: "POST", body });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.detail || "upload failed");
      setStatus(`Heard: ${payload.utterance || "(empty)"}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "record failed");
    }
  }

  async function upload(file: File) {
    setStatus("Sending clip to Whisper…");
    const body = new FormData();
    body.append("file", file);
    body.append("worker_id", "W-17");
    const res = await fetch("/api/audio", { method: "POST", body });
    const payload = await res.json();
    if (!res.ok) {
      setStatus(payload.detail || "upload failed");
      return;
    }
    setStatus(`Heard: ${payload.utterance || "(empty)"}`);
  }

  return (
    <section className="pane">
      <h2>Voice processing</h2>
      <div className="mic-bar">
        {recording ? (
          <button type="button" className="mic-stop" onClick={() => void stop()}>
            Stop
          </button>
        ) : (
          <button type="button" onClick={() => void start().catch((err) => setStatus(String(err)))}>
            Record packing slip
          </button>
        )}
        <label className="upload">
          Upload wav
          <input
            type="file"
            accept="audio/*,.wav,.webm,.mp3,.m4a"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="muted">
        The GB10 has no mic. Record here from your laptop over localhost (SSH tunnel or Cursor
        port-forward to :5173), or drop a wav. Whisper on this box transcribes; the matcher
        compares that to the on-file PO + BOL.
      </p>
      {status ? <p className="mic-status">{status}</p> : null}
      <ol className="transcript">
        {events.map((event) => (
          <li key={event.seq} className={`line ${event.kind}`}>
            <span className="kind">{event.kind}</span>
            <span className="body">
              {String(
                event.payload.utterance ||
                  event.payload.question ||
                  event.payload.item ||
                  event.entity_id,
              )}
              {event.payload.quantity != null ? ` · qty ${String(event.payload.quantity)}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
