import type { ChatMessage } from "@/types/voice";

type Props = {
  message: ChatMessage;
  index?: number;
};

export function ChatBubble({ message, index = 0 }: Props) {
  const delay = Math.min(index, 16) * 40;
  const textDelay = delay + 50;

  if (message.role === "system") {
    return (
      <div className="animate-card-in text-body2-heavy text-primary my-2" style={{ animationDelay: `${delay}ms` }}>
        <span
          className="animate-text-in inline-block rounded-small bg-brand-brown-soft px-3 py-1"
          style={{ animationDelay: `${textDelay}ms` }}
        >
          {message.text}
        </span>
      </div>
    );
  }

  const isUser = message.role === "user";
  const speaking = message.state === "speaking";
  const parsed = message.state === "parsed";

  return (
    <div
      className={`animate-card-in my-2 flex ${isUser ? "justify-end" : "justify-start"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={[
          "text-body1-default max-w-[75%] rounded-default px-4 py-3 transition-colors duration-200",
          isUser
            ? speaking
              ? "text-tertiary"
              : "text-primary"
            : "text-primary bg-brand-brown-soft",
        ].join(" ")}
        style={
          isUser
            ? {
                background: parsed
                  ? "var(--color-bubble-parsed)"
                  : "var(--color-bubble-speaking)",
              }
            : undefined
        }
      >
        <span className="animate-text-in inline-block" style={{ animationDelay: `${textDelay}ms` }}>
          {message.text}
        </span>
      </div>
    </div>
  );
}
