import { cn } from "@/lib/utils";

export type VoiceTurn = {
  who: "you" | "saffron";
  text: string;
};

export type VoiceTranscriptProps = {
  turns: VoiceTurn[];
  className?: string;
};

export function VoiceTranscript({ turns, className }: VoiceTranscriptProps) {
  if (turns.length === 0) return null;

  return (
    <div role="log" aria-label="Voice conversation" className={cn("flex flex-col gap-2", className)}>
      {turns.map((turn, index) => {
        const mine = turn.who === "you";
        return (
          <div key={index} className={cn("flex", mine ? "justify-end" : "justify-start")}>
            <p
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-base leading-snug text-ink",
                mine ? "rounded-br-md bg-muted" : "rounded-bl-md bg-saffron-soft"
              )}
            >
              <span className="sr-only">{mine ? "You: " : "Saffron: "}</span>
              {turn.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
