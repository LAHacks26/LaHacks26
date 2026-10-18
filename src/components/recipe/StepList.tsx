import type { ReactElement, ReactNode } from "react";
import { TimerChip } from "@/components/saffron";
import type { Step, Timer } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";
import { TipBlock } from "./TipBlock";

export type StepListProps = {
  steps: Step[];
  /** Phrase to highlight inside one step. */
  highlight?: { stepId: string; text: string };
  glowIds?: string[];
  selectedId?: string;
  /** Tip IDs that start expanded. */
  openTipIds?: string[];
  onSelect?: (id: string) => void;
  /** Wraps each row (for example in a LinePopover). See IngredientList. */
  renderLine?: (id: string, row: ReactElement) => ReactNode;
};

function timerLabel(timer: Timer): string {
  return timer.min === timer.max ? `${timer.min} min` : `${timer.min}–${timer.max} min`;
}

function withHighlight(text: string, phrase: string): ReactNode {
  const index = text.indexOf(phrase);
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-saffron/35 px-0.5 text-foreground">
        {text.slice(index, index + phrase.length)}
      </mark>
      {text.slice(index + phrase.length)}
    </>
  );
}

export function StepList({
  steps,
  highlight,
  glowIds = [],
  selectedId,
  openTipIds = [],
  onSelect,
  renderLine,
}: StepListProps) {
  const interactive = Boolean(onSelect || renderLine);
  const glowing = new Set(glowIds);

  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => {
        const selected = step.id === selectedId;
        const glow = glowing.has(step.id);
        const phrase = highlight?.stepId === step.id ? highlight.text : undefined;
        const className = cn(
          "flex min-h-11 w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-base leading-relaxed text-foreground",
          interactive
            ? "cursor-pointer outline-none transition-colors hover:bg-saffron-soft/50 focus-visible:ring-3 focus-visible:ring-ring/50"
            : "cursor-default",
          selected && "bg-saffron-soft ring-2 ring-saffron",
          glow && "recipe-glow"
        );
        const content = (
          <>
            <span
              aria-hidden="true"
              className="font-display w-6 shrink-0 text-lg leading-snug font-semibold text-saffron-ink tabular-nums"
            >
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col items-start gap-2">
              <span>{phrase ? withHighlight(step.text, phrase) : step.text}</span>
              {step.timer ? <TimerChip label={timerLabel(step.timer)} /> : null}
            </span>
          </>
        );
        const row = interactive ? (
          <button
            type="button"
            onClick={onSelect ? () => onSelect(step.id) : undefined}
            data-line-id={step.id}
            data-selected={selected || undefined}
            data-glow={glow || undefined}
            className={className}
          >
            {content}
          </button>
        ) : (
          <div
            data-line-id={step.id}
            data-selected={selected || undefined}
            data-glow={glow || undefined}
            className={className}
          >
            {content}
          </div>
        );

        return (
          <li key={step.id} className="flex flex-col">
            {renderLine ? renderLine(step.id, row) : row}
            {step.tips.map((tip) => (
              <TipBlock
                key={tip.id}
                tip={tip}
                defaultOpen={openTipIds.includes(tip.id)}
                className="ml-9"
              />
            ))}
          </li>
        );
      })}
    </ol>
  );
}
