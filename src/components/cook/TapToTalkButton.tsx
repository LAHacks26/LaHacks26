"use client";

import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

export type TapToTalkButtonProps = {
  active: boolean;
  onPress?: () => void;
  className?: string;
};

// Backup for the wake word. 56px, so it is easy to hit from across a counter.
export function TapToTalkButton({ active, onPress, className }: TapToTalkButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label="Tap to talk to Saffron"
      onClick={onPress}
      className={cn(
        "inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-ink text-background shadow-lg outline-none transition-[box-shadow,scale] duration-150 ease-out motion-safe:hover:scale-[1.03] motion-safe:enabled:active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none",
        active && "ring-4 ring-saffron ring-offset-2 ring-offset-background",
        className
      )}
    >
      <Mic size={24} aria-hidden="true" />
    </button>
  );
}
