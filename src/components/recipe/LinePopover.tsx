"use client";

import type { ReactElement, ReactNode } from "react";
import { Check, Send } from "lucide-react";
import { Chip } from "@/components/saffron";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { LineKind } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";
import { ImpossibleCard } from "./ImpossibleCard";
import { RejectionCard } from "./RejectionCard";

/** "idle" = just opened: quick actions and the ask field, no answer yet. */
export type PopoverMode =
  | "idle"
  | "substitute"
  | "explain"
  | "loading"
  | "rejected"
  | "impossible";

const ACTIONS: Record<LineKind, [string, string]> = {
  ingredient: ["Substitute…", "What is this?"],
  step: ["Explain", "Ask"],
  appliance: ["I don't have this", "Explain"],
};

const PLACEHOLDERS: Record<LineKind, string> = {
  ingredient: 'with… / "will this split?"',
  step: "Ask about this step…",
  appliance: "What do you have instead?",
};

export type LinePopoverProps = {
  kind: LineKind;
  /** Target shown in the header, e.g. "1 cup heavy cream" or a highlighted phrase. */
  label: string;
  mode: PopoverMode;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /** What the user asked, shown as a quote above the body. */
  question?: string;
  suggestions?: string[];
  /** Explanation text (mode "explain"). */
  explanation?: string;
  rejection?: { reason: string; suggestions: string[] };
  impossible?: { reason: string; suggestedSearch: string };
  /** Text next to the shimmer lines (mode "loading"). */
  loadingText?: string;
  /** The row or chip that opens the popover. It becomes the trigger. */
  children: ReactElement;
};

/** Which quick action is pressed, or null while idle. */
function activeActionIndex(kind: LineKind, mode: PopoverMode): number | null {
  if (mode === "idle") return null;
  // For steps, "Explain" is the first action and everything else counts as "Ask".
  const askMode = kind === "step" ? mode !== "explain" : mode === "explain";
  return askMode ? 1 : 0;
}

function AskField({ kind }: { kind: LineKind }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">Or ask anything</p>
      <div className="flex items-center gap-2">
        <Input aria-label="Ask about this line" placeholder={PLACEHOLDERS[kind]} />
        <Button size="icon" aria-label="Send question">
          <Send aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function SubstituteBody({
  kind,
  suggestions,
  onPick,
}: {
  kind: LineKind;
  suggestions: string[];
  onPick: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {kind === "appliance"
            ? "Suggested alternatives"
            : "Suggested swaps (no allergens from your list)"}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((suggestion) => (
            <Chip
              key={suggestion}
              variant="default"
              size="sm"
              className="cursor-pointer hover:border-saffron"
              onClick={onPick}
            >
              {suggestion}
            </Chip>
          ))}
        </div>
      </div>
      <AskField kind={kind} />
    </div>
  );
}

function ExplainBody({ explanation }: { explanation: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed">
      <p className="text-foreground">{explanation}</p>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Check size={14} aria-hidden="true" className="text-sage" />
        Saved as a tip
      </p>
    </div>
  );
}

function LoadingBody({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <p className="text-xs font-medium text-saffron-ink">{text}</p>
    </div>
  );
}

export function LinePopover({
  kind,
  label,
  mode,
  open,
  onOpenChange,
  question,
  suggestions = [],
  explanation,
  rejection,
  impossible,
  loadingText = "Saffron is thinking…",
  children,
}: LinePopoverProps) {
  const [first, second] = ACTIONS[kind];
  const current = activeActionIndex(kind, mode);
  const close = () => onOpenChange?.(false);

  let body: ReactNode = null;
  if (mode === "idle") {
    body = <AskField kind={kind} />;
  } else if (mode === "substitute") {
    body = <SubstituteBody kind={kind} suggestions={suggestions} onPick={close} />;
  } else if (mode === "explain") {
    body = <ExplainBody explanation={explanation ?? ""} />;
  } else if (mode === "loading") {
    body = <LoadingBody text={loadingText} />;
  } else if (mode === "rejected" && rejection) {
    body = (
      <RejectionCard
        reason={rejection.reason}
        suggestions={rejection.suggestions}
        onSuggest={close}
      />
    );
  } else if (mode === "impossible" && impossible) {
    body = (
      <ImpossibleCard reason={impossible.reason} suggestedSearch={impossible.suggestedSearch} />
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={children} />
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-2rem))] gap-2.5 p-3 text-sm"
      >
        <p className="text-sm text-muted-foreground">
          About: <b className="font-semibold text-foreground">{label}</b>
        </p>

        <div
          role="group"
          aria-label="Quick actions"
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        >
          {[first, second].map((action, index) => {
            const pressed = index === current;
            return (
              <button
                key={action}
                type="button"
                aria-pressed={pressed}
                className={cn(
                  "min-h-9 rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  pressed
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {action}
              </button>
            );
          })}
        </div>

        {question ? (
          <p className="rounded-lg bg-saffron-soft/60 px-3 py-2 text-sm text-saffron-ink">
            “{question}”
          </p>
        ) : null}

        {body}

        <button
          type="button"
          className="min-h-9 self-start rounded-md text-sm font-medium text-saffron-ink outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Continue in chat →
        </button>
      </PopoverContent>
    </Popover>
  );
}
