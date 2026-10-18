"use client";

import type { Ref } from "react";
import { cn } from "@/lib/utils";

export type ChatLauncherProps = {
  onClick: () => void;
  /** Lets the parent return focus here after the panel closes. */
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
};

export function ChatLauncher({ onClick, buttonRef, className }: ChatLauncherProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={cn(
        "fixed right-4 bottom-4 z-40 inline-flex h-12 items-center gap-2.5 rounded-full bg-ink px-5 text-sm font-semibold text-background shadow-lg outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:right-6 sm:bottom-6",
        className
      )}
    >
      <span aria-hidden="true" className="size-2.5 rounded-full bg-saffron" />
      Ask Saffron
    </button>
  );
}
