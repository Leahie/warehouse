import type { ChatMessage } from "@/types/voice";

type Props = {
  message: ChatMessage;
};

export function ChatBubble({ message }: Props) {
  if (message.role === "system") {
    return (
      <div className="text-body2-heavy text-primary my-2">
        <span className="rounded-small bg-brand-brown-soft px-3 py-1">{message.text}</span>
      </div>
    );
  }

  const isUser = message.role === "user";
  const speaking = message.state === "speaking";
  const parsed = message.state === "parsed";

  return (
    <div className={`my-2 flex ${isUser ? "justify-end" : "justify-start"}`}>
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
        {message.text}
      </div>
    </div>
  );
}
