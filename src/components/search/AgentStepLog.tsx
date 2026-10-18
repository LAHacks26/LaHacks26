"use client";

import { Check } from "lucide-react";
import { SectionLabel } from "@/components/saffron";
import type { AgentStep } from "@/lib/mocks/search";
import "./search.css";

export type AgentStepLogProps = {
  steps: AgentStep[];
};

export function AgentStepLog({ steps }: AgentStepLogProps) {
  return (
    <section aria-labelledby="agent-steps-heading" className="mx-auto w-full max-w-3xl">
      <SectionLabel as="h2" className="mb-3">
        <span id="agent-steps-heading">Agent steps</span>
      </SectionLabel>
      <ol aria-live="polite" className="flex flex-col gap-2.5">
        {steps.map((step, index) => {
          const done = step.status === "done";
          return (
            <li key={index} className="search-step-enter flex items-start gap-3 text-sm">
              <span className="flex h-5 w-4 shrink-0 items-center justify-center">
                {done ? (
                  <Check aria-hidden="true" className="size-4 text-sage" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="size-2 animate-pulse rounded-full bg-saffron motion-reduce:animate-none"
                  />
                )}
              </span>
              <span className={done ? "text-muted-foreground" : "font-medium text-ink"}>
                <span className="sr-only">{done ? "Done: " : "In progress: "}</span>
                {step.text}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
