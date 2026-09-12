export type VoiceStage =
  | "parsing"
  | "confirming"
  | "correction"
  | "logging_data"
  | "done";

export type ChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  state?: "speaking" | "parsed";
  at: string;
};

export type VoiceSession = {
  session_id: string;
  stage: VoiceStage;
  messages: ChatMessage[];
  summary: string | null;
  is_alert: boolean;
  order_id?: string;
  item?: string;
  supplier?: string;
  lot_code?: string;
  created_at: string;
};
