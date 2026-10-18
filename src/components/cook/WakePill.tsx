"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Loader2, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type WakeState = "off" | "armed" | "listening" | "thinking" | "speaking";

export type WakePillProps = {
  state: WakeState;
  className?: string;
};

// Three bars that bounce while the mic hears speech, or a waveform while Saffron talks.
function LevelBars({ count, height }: { count: number; height: string }) {
  const reduce = useReducedMotion();

  return (
    <span aria-hidden="true" className={cn("inline-flex items-end gap-0.5", height)}>
      {Array.from({ length: count }, (_, i) => (
        <motion.span
          key={i}
          className="h-full w-0.5 origin-bottom rounded-full bg-saffron"
          animate={reduce ? undefined : { scaleY: [0.35, 1, 0.5, 0.9, 0.35] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

export function WakePill({ state, className }: WakePillProps) {
  let content: ReactNode;

  switch (state) {
    case "armed":
      content = (
        <>
          <span aria-hidden="true" className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-saffron opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2.5 rounded-full bg-saffron" />
          </span>
          <span>Listening for “Hey Saffron”</span>
        </>
      );
      break;
    case "listening":
      content = (
        <>
          <LevelBars count={3} height="h-4" />
          <span>Listening…</span>
        </>
      );
      break;
    case "thinking":
      content = (
        <>
          <Loader2 size={16} aria-hidden="true" className="shrink-0 animate-spin text-saffron-ink motion-reduce:animate-none" />
          <span>Thinking…</span>
        </>
      );
      break;
    case "speaking":
      content = (
        <>
          <LevelBars count={5} height="h-4" />
          <span>Speaking…</span>
        </>
      );
      break;
    case "off":
    default:
      content = (
        <>
          <MicOff size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Mic off</span>
        </>
      );
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium text-ink",
        className
      )}
    >
      {content}
    </span>
  );
}
