"use client";

import type { Ref } from "react";
import { motion } from "motion/react";
import { EASE_OUT, useSafeReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type ChatLauncherProps = {
  onClick: () => void;
  /** Lets the parent return focus here after the panel closes. */
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
};

export function ChatLauncher({ onClick, buttonRef, className }: ChatLauncherProps) {
  const reduce = useSafeReducedMotion();

  // Full transform strings (no x/scale shorthands). The hover lift is a whileHover
  // transform, so it does not fight the entrance transform.
  const presence = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0, pointerEvents: "none" as const },
      }
    : {
        initial: { opacity: 0, transform: "translateY(0px) scale(0.95)" },
        animate: { opacity: 1, transform: "translateY(0px) scale(1)" },
        exit: {
          opacity: 0,
          transform: "translateY(0px) scale(0.95)",
          pointerEvents: "none" as const,
        },
      };

  return (
    <motion.button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      {...presence}
      whileHover={reduce ? undefined : { transform: "translateY(-2px) scale(1)" }}
      transition={{ duration: 0.15, ease: EASE_OUT }}
      className={cn(
        "fixed right-4 bottom-4 z-40 inline-flex h-12 items-center gap-2.5 rounded-full bg-ink px-5 text-sm font-semibold text-background shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/60 sm:right-6 sm:bottom-6",
        className
      )}
    >
      <span aria-hidden="true" className="size-2.5 rounded-full bg-saffron" />
      Ask Saffron
    </motion.button>
  );
}
