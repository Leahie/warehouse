import { useEventStream } from "../hooks/useEventStream";

export function VoicePane() {
  const events = useEventStream("voice");
  return (
    <section className="pane">
      <h2>Voice processing</h2>
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
