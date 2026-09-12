import type { VoiceStage } from "@/types/voice";

const STAGE_LABEL: Record<VoiceStage, string> = {
  parsing: "Parsing…",
  confirming: "Confirming…",
  correction: "Correction…",
  logging_data: "Logging data…",
  done: "Done",
};

type Props = {
  stage: VoiceStage;
};

export function StageChip({ stage }: Props) {
  return (
    <span className="text-body2-heavy text-primary rounded-small bg-brand-brown-soft px-3 py-1">
      {STAGE_LABEL[stage]}
    </span>
  );
}
