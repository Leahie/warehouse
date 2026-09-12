// Agent speech. Uses the browser's own synthesis, so the audio is produced on
// the listener's machine and nothing is sent anywhere -- the transcript and the
// decision behind it are still generated entirely on the GB10.

let warmed = false;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  if (!voices.length) return null;
  // Prefer a natural en-US voice; fall back to any English one.
  return (
    voices.find((v) => /en-US/i.test(v.lang) && /natural|neural|samantha|google/i.test(v.name)) ??
    voices.find((v) => /^en[-_]/i.test(v.lang)) ??
    voices[0]
  );
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Speak text aloud, cancelling anything still in progress. */
export function speak(text: string, opts: { rate?: number; onEnd?: () => void } = {}): void {
  if (!speechSupported() || !text.trim()) {
    opts.onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = opts.rate ?? 1.02;
  utter.pitch = 1;
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  utter.onend = () => opts.onEnd?.();
  utter.onerror = () => opts.onEnd?.();
  synth.speak(utter);
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}

/**
 * Chrome populates voices asynchronously and refuses to speak before a user
 * gesture. Call this from the first click so the first real line is not silent.
 */
export function warmUpSpeech(): void {
  if (warmed || !speechSupported()) return;
  warmed = true;
  window.speechSynthesis.getVoices();
  const probe = new SpeechSynthesisUtterance("");
  probe.volume = 0;
  window.speechSynthesis.speak(probe);
}
