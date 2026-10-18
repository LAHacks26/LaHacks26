"use client";

import { motion, useReducedMotion } from "motion/react";
import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LiveAgentViewProps = {
  currentUrl: string;
  status: "browsing" | "reading" | "done";
};

const STATUS_LABEL: Record<LiveAgentViewProps["status"], string> = {
  browsing: "Browsing for recipes",
  reading: "Reading the recipe",
  done: "Finished",
};

// Skeleton lines that stand in for a page the agent is reading.
const LINES = [
  { width: "62%" },
  { width: "88%" },
  { width: "74%" },
  { width: "40%" },
  { width: "81%" },
];

// Where the saffron cursor drifts, as percentages of the frame.
const CURSOR_LEFT = ["18%", "64%", "40%", "76%", "18%"];
const CURSOR_TOP = ["24%", "46%", "68%", "34%", "24%"];

export function LiveAgentView({ currentUrl, status }: LiveAgentViewProps) {
  const reduceMotion = useReducedMotion();
  const cursorMoves = !reduceMotion && status !== "done";
  const displayUrl = currentUrl.replace(/^https?:\/\//, "");

  return (
    <section
      aria-label="Live view of the agent browsing"
      className="mx-auto w-full max-w-3xl"
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        {/* Browser chrome */}
        <div className="flex items-center gap-3 border-b border-border bg-secondary px-4 py-2.5">
          <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </div>
          <p className="min-w-0 flex-1 truncate rounded-md bg-card px-3 py-1 font-mono text-xs text-muted-foreground">
            {displayUrl}
          </p>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-tomato-ink">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full bg-tomato",
                status !== "done" && "animate-pulse motion-reduce:animate-none"
              )}
            />
            agent
          </span>
        </div>

        {/* 16:9 page area */}
        <div className="relative aspect-video overflow-hidden bg-background">
          <div className="flex h-full flex-col gap-3 p-5 sm:p-8" aria-hidden="true">
            <div className="h-1/4 min-h-10 w-full rounded-xl bg-saffron-soft animate-pulse motion-reduce:animate-none" />
            {LINES.map((line, index) => (
              <div
                key={index}
                style={{ width: line.width, animationDelay: `${index * 150}ms` }}
                className="h-2.5 rounded-full bg-border animate-pulse motion-reduce:animate-none"
              />
            ))}
          </div>

          <motion.span
            aria-hidden="true"
            initial={{ left: CURSOR_LEFT[0], top: CURSOR_TOP[0] }}
            animate={
              cursorMoves
                ? { left: CURSOR_LEFT, top: CURSOR_TOP }
                : { left: CURSOR_LEFT[0], top: CURSOR_TOP[0] }
            }
            transition={
              cursorMoves
                ? { duration: 9, ease: "easeInOut", repeat: Infinity }
                : { duration: 0 }
            }
            className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-saffron shadow-md ring-4 ring-saffron/25"
          />
        </div>

        {/* Footer: status and the fallback link */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <p className="text-sm text-muted-foreground">{STATUS_LABEL[status]}</p>
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Open live view
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
