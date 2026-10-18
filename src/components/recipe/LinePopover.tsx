"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Check, Send } from "lucide-react";
import { Chip } from "@/components/saffron";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LineKind } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";
import { ImpossibleCard } from "./ImpossibleCard";
import { RejectionCard } from "./RejectionCard";

/** "idle" = just opened: quick actions and the ask field, no answer yet. */
export type PopoverMode =
  | "idle"
  | "substitute"
  | "explain"
  | "answer"
  | "loading"
  | "rejected"
  | "impossible"
  | "error";

/** What the user did inside the popover. The parent decides what each one runs. */
export type PopoverAction =
  | { type: "substitute" }
  | { type: "ask" }
  | { type: "explain" }
  | { type: "missing_appliance" }
  /** Text from the ask field. On an ingredient, "with …" means a substitution. */
  | { type: "submit"; text: string }
  /** One of the swap chips, or a rejection chip. */
  | { type: "swap"; message: string }
  | { type: "search"; query: string }
  | { type: "retry" };

/**
 * A phrase selected inside one line. Offsets are relative to that line's row, so the popover
 * stays attached to the phrase when the page scrolls.
 */
export type SelectionAnchor = {
  lineId: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type QuickAction = { label: string; action: PopoverAction; edit: boolean };

// The two quick actions per kind. `edit` actions are disabled while another edit runs.
const QUICK_ACTIONS: Record<LineKind, [QuickAction, QuickAction]> = {
  ingredient: [
    { label: "Substitute…", action: { type: "substitute" }, edit: false },
    { label: "What is this?", action: { type: "explain" }, edit: false },
  ],
  step: [
    { label: "Explain", action: { type: "explain" }, edit: false },
    { label: "Ask", action: { type: "ask" }, edit: false },
  ],
  appliance: [
    { label: "I don't have this", action: { type: "missing_appliance" }, edit: true },
    { label: "Explain", action: { type: "explain" }, edit: false },
  ],
};

const PLACEHOLDERS: Record<LineKind, string> = {
  ingredient: 'with… / "will this split?"',
  step: "Ask about this step…",
  appliance: "What do you have instead?",
};

const BUSY_LABEL = "Saffron is editing…";
const FALLBACK_ERROR = "Saffron couldn't finish that. Try again.";

export type LinePopoverProps = {
  kind: LineKind;
  /** Target shown in the header, e.g. "1 cup heavy cream" or a highlighted phrase. */
  label: string;
  mode: PopoverMode;
  open: boolean;
  /** `reason` is the Base UI reason, e.g. "trigger-press" or "outside-press". */
  onOpenChange?: (open: boolean, reason: string) => void;
  /** What the user asked, shown as a quote above the body. */
  question?: string;
  suggestions?: string[];
  suggestionsLoading?: boolean;
  suggestionsError?: string;
  /** Explanation or answer text (modes "explain" and "answer"). */
  explanation?: string;
  /** The text was saved as a tip under the line. */
  saved?: boolean;
  rejection?: { reason: string; suggestions: string[] };
  impossible?: { reason: string; suggestedSearch: string };
  /** Message for mode "error". */
  error?: string;
  /** Text next to the shimmer lines (mode "loading"). */
  loadingText?: string;
  /** Set when the popover is opened by a phrase selection: it anchors to that phrase. */
  selection?: SelectionAnchor | null;
  /** Another edit is running: edit actions are disabled. */
  editBusy?: boolean;
  onAction?: (action: PopoverAction) => void;
  /** The row or chip that opens the popover. It becomes the trigger. */
  children: ReactElement;
};

/** Which quick action is pressed, or null while idle. */
function activeActionIndex(kind: LineKind, mode: PopoverMode): number | null {
  if (mode === "idle") return null;
  const explaining = mode === "explain" || mode === "answer";
  // For steps, "Explain" is the first action and everything else counts as "Ask".
  if (kind === "step") return explaining ? 0 : 1;
  return explaining ? 1 : 0;
}

/** A virtual anchor over the selected phrase, read live from the row so it follows scrolling. */
function useSelectionAnchor(selection: SelectionAnchor | null | undefined) {
  return useMemo(() => {
    if (!selection) return undefined;
    return {
      getBoundingClientRect(): DOMRect {
        const row = document.querySelector<HTMLElement>(`[data-line-id="${selection.lineId}"]`);
        const rowRect = row?.getBoundingClientRect();
        return new DOMRect(
          (rowRect?.left ?? 0) + selection.left,
          (rowRect?.top ?? 0) + selection.top,
          selection.width,
          selection.height
        );
      },
    };
  }, [selection]);
}

function AskField({
  kind,
  busy,
  onSubmit,
}: {
  kind: LineKind;
  busy: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");

  function submit() {
    const value = text.trim();
    if (busy || !value) return;
    onSubmit(value);
    setText("");
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">Or ask anything</p>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Input
          aria-label="Ask about this line"
          placeholder={busy ? BUSY_LABEL : PLACEHOLDERS[kind]}
          value={text}
          maxLength={500}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send question"
          disabled={busy || !text.trim()}
        >
          <Send aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}

function SkeletonChips() {
  return (
    <div className="flex flex-wrap gap-1.5" aria-busy="true" aria-label="Loading swaps">
      <span className="h-7 w-20 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
      <span className="h-7 w-24 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
      <span className="h-7 w-28 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
    </div>
  );
}

function SubstituteBody({
  kind,
  suggestions,
  loading,
  error,
  busy,
  onAction,
}: {
  kind: LineKind;
  suggestions: string[];
  loading: boolean;
  error?: string;
  busy: boolean;
  onAction: (action: PopoverAction) => void;
}) {
  let chips: ReactNode;
  if (loading) {
    chips = <SkeletonChips />;
  } else if (error) {
    chips = (
      <div className="flex flex-wrap items-center gap-2">
        <p role="alert" className="text-sm font-medium text-tomato-ink">
          {error}
        </p>
        <Button variant="outline" size="sm" onClick={() => onAction({ type: "substitute" })}>
          Try again
        </Button>
      </div>
    );
  } else {
    chips = (
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <Chip
            key={suggestion}
            variant="default"
            size="sm"
            className="cursor-pointer hover:border-saffron"
            disabled={busy}
            onClick={() => onAction({ type: "swap", message: suggestion })}
          >
            {suggestion}
          </Chip>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {busy ? BUSY_LABEL : "Suggested swaps (no allergens from your list)"}
        </p>
        {chips}
      </div>
      <AskField
        kind={kind}
        busy={busy}
        onSubmit={(text) => onAction({ type: "submit", text })}
      />
    </div>
  );
}

function ExplainBody({ text, saved }: { text: string; saved: boolean }) {
  if (!text) return <LoadingBody text="Saffron is thinking…" />;
  return (
    <div aria-live="polite" className="flex flex-col gap-2 text-sm leading-relaxed">
      <p className="text-foreground">{text}</p>
      {saved ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Check size={14} aria-hidden="true" className="text-sage" />
          Saved as a tip
        </p>
      ) : null}
    </div>
  );
}

// Modes whose body is a new result or a new state. Focus moves to the popup when one of them appears,
// so keyboard users do not lose their place when the button they pressed is replaced.
const FOCUS_MODES: PopoverMode[] = ["loading", "explain", "answer", "rejected", "impossible", "error"];

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

function ErrorBody({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p role="alert" className="text-sm font-medium text-tomato-ink">
        {message}
      </p>
      <Button variant="outline" size="sm" className="self-start" onClick={onRetry}>
        Try again
      </Button>
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
  suggestionsLoading = false,
  suggestionsError,
  explanation = "",
  saved = false,
  rejection,
  impossible,
  error,
  loadingText = "Saffron is thinking…",
  selection,
  editBusy = false,
  onAction,
  children,
}: LinePopoverProps) {
  const quick = QUICK_ACTIONS[kind];
  const current = activeActionIndex(kind, mode);
  const anchor = useSelectionAnchor(selection);
  const act = (action: PopoverAction) => onAction?.(action);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && FOCUS_MODES.includes(mode)) popupRef.current?.focus();
  }, [mode, open]);

  let body: ReactNode = null;
  if (mode === "idle") {
    body = <AskField kind={kind} busy={editBusy} onSubmit={(text) => act({ type: "submit", text })} />;
  } else if (mode === "substitute") {
    body = (
      <SubstituteBody
        kind={kind}
        suggestions={suggestions}
        loading={suggestionsLoading}
        error={suggestionsError}
        busy={editBusy}
        onAction={act}
      />
    );
  } else if (mode === "explain" || mode === "answer") {
    body = <ExplainBody text={explanation} saved={saved} />;
  } else if (mode === "loading") {
    body = <LoadingBody text={loadingText} />;
  } else if (mode === "rejected" && rejection) {
    body = (
      <RejectionCard
        reason={rejection.reason}
        suggestions={rejection.suggestions}
        onSuggest={(suggestion) => act({ type: "swap", message: suggestion })}
        className="rounded-md"
      />
    );
  } else if (mode === "impossible" && impossible) {
    body = (
      <ImpossibleCard
        reason={impossible.reason}
        suggestedSearch={impossible.suggestedSearch}
        onSearch={() => act({ type: "search", query: impossible.suggestedSearch })}
        className="rounded-md"
      />
    );
  } else if (mode === "error") {
    body = <ErrorBody message={error ?? FALLBACK_ERROR} onRetry={() => act({ type: "retry" })} />;
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next, details) => onOpenChange?.(next, details.reason)}
    >
      <PopoverPrimitive.Trigger render={children} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          anchor={anchor}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            ref={popupRef}
            tabIndex={-1}
            data-slot="popover-content"
            className="z-50 flex w-[min(22rem,calc(100vw-2rem))] origin-(--transform-origin) flex-col gap-2.5 rounded-[20px] bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 motion-safe:data-[side=bottom]:slide-in-from-top-2 data-open:animate-in data-open:fade-in-0 motion-safe:data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 motion-safe:data-closed:zoom-out-95"
          >
            <p className="text-sm text-muted-foreground">
              About: <b className="font-semibold text-foreground">{label}</b>
            </p>

            <div
              role="group"
              aria-label="Quick actions"
              className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1"
            >
              {quick.map((item, index) => {
                const pressed = index === current;
                const disabled = editBusy && item.edit;
                return (
                  <button
                    key={item.label}
                    type="button"
                    aria-pressed={pressed}
                    disabled={disabled}
                    onClick={() => act(item.action)}
                    className={cn(
                      "min-h-9 min-w-0 truncate rounded-[4px] px-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                      pressed
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {disabled ? BUSY_LABEL : item.label}
                  </button>
                );
              })}
            </div>

            {question ? (
              <p className="rounded-md bg-saffron-soft/60 px-3 py-2 text-sm text-saffron-ink">
                “{question}”
              </p>
            ) : null}

            {body}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
