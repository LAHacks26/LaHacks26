"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { AnimatePresence, motion, type TargetAndTransition } from "motion/react";
import { Check, Search, Send, X } from "lucide-react";
import { Chip } from "@/components/saffron";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EASE_DRAWER, EASE_OUT, useSafeReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type ChatAttachment =
  | { kind: "edit"; summary: string }
  | { kind: "impossible"; reason: string; suggestedSearch: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  attachment?: ChatAttachment;
};

/** A recipe line attached to the conversation, e.g. "Step 4 · until charred". */
export type ContextChip = {
  id: string;
  label: string;
};

export type ChatPanelProps = {
  messages: ChatMessage[];
  contextChips: ContextChip[];
  onSend: (text: string) => void;
  onClose: () => void;
  onRemoveChip: (id: string) => void;
  /** Reverts the edit attached to a message. */
  onUndo?: (messageId: string) => void;
  /** Runs the "Search instead" suggestion. */
  onSearch?: (query: string) => void;
  /** Shows the typing indicator after the last message. */
  typing?: boolean;
};

const DESKTOP_QUERY = "(min-width: 640px)";

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isDesktop() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function serverIsDesktop() {
  return true;
}

export function ChatPanel({
  messages,
  contextChips,
  onSend,
  onClose,
  onRemoveChip,
  onUndo,
  onSearch,
  typing = false,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduce = useSafeReducedMotion();
  // Read on the first client render, so a panel opened after hydration starts with
  // the right variant (no flash of the desktop grow). The server snapshot is desktop.
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, serverIsDesktop);

  // Desktop grows from the launcher (bottom right). Mobile slides up as a drawer.
  // Reduced motion keeps the opacity fade only. Every variant uses the same
  // transform function list, so switching variants never interpolates across lists.
  const panelMotion: { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition } =
    reduce
      ? {
          initial: { opacity: 0 },
          animate: { opacity: 1, transition: { duration: 0.15, ease: EASE_OUT } },
          exit: { opacity: 0, pointerEvents: "none" as const, transition: { duration: 0.15, ease: EASE_OUT } },
        }
      : desktop
        ? {
            initial: { opacity: 0, transform: "translateY(0%) scale(0.95)" },
            animate: {
              opacity: 1,
              transform: "translateY(0%) scale(1)",
              transition: { duration: 0.2, ease: EASE_OUT },
            },
            exit: {
              opacity: 0,
              transform: "translateY(0%) scale(0.95)",
              pointerEvents: "none" as const,
              transition: { duration: 0.15, ease: EASE_OUT },
            },
          }
        : {
            initial: { transform: "translateY(100%) scale(1)" },
            animate: {
              transform: "translateY(0%) scale(1)",
              transition: { duration: 0.5, ease: EASE_DRAWER },
            },
            exit: {
              transform: "translateY(100%) scale(1)",
              pointerEvents: "none" as const,
              transition: { duration: 0.5, ease: EASE_DRAWER },
            },
          };

  // New messages rise in. Reduced motion keeps the fade.
  const bubbleMotion: { initial: TargetAndTransition; animate: TargetAndTransition } = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, transform: "translateY(8px)" },
        animate: { opacity: 1, transform: "translateY(0px)" },
      };

  // Focus the message input when the panel opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Full-screen on mobile: stop the page behind it from scrolling.
  useEffect(() => {
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Keep the newest message in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, typing]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <motion.section
      role="dialog"
      aria-modal="true"
      aria-label="Ask Saffron"
      initial={panelMotion.initial}
      animate={panelMotion.animate}
      exit={panelMotion.exit}
      style={{ transformOrigin: "bottom right" }}
      className="fixed inset-0 z-50 flex flex-col bg-card sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[600px] sm:max-h-[calc(100dvh-3rem)] sm:w-[400px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:shadow-xl"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-saffron" />
          <span className="font-display text-lg font-bold tracking-tight text-ink">Ask Saffron</span>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close chat" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </header>

      <div
        ref={listRef}
        role="log"
        aria-label="Conversation"
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {/* initial={false}: messages present at first render do not animate. */}
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={bubbleMotion.initial}
              animate={bubbleMotion.animate}
              transition={{ duration: 0.2, ease: EASE_OUT }}
            >
              <ChatBubble message={message} onUndo={onUndo} onSearch={onSearch} />
            </motion.div>
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {typing ? (
            <motion.div
              key="typing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: EASE_OUT }}
            >
              <TypingIndicator />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {contextChips.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 pt-3">
          {contextChips.map((chip) => (
            <span key={chip.id} className="inline-flex items-center gap-0.5">
              <Chip variant="selected" size="sm">
                {chip.label}
              </Chip>
              <button
                type="button"
                aria-label={`Remove ${chip.label}`}
                onClick={() => onRemoveChip(chip.id)}
                className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <form onSubmit={submit} className="flex items-center gap-2 p-3">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about this recipe"
          aria-label="Message Saffron"
          autoComplete="off"
          className="h-10 flex-1 rounded-full px-4 text-sm"
        />
        <Button
          type="submit"
          size="icon-lg"
          aria-label="Send"
          disabled={!draft.trim()}
          className="shrink-0 rounded-full"
        >
          <Send aria-hidden="true" />
        </Button>
      </form>
    </motion.section>
  );
}

function ChatBubble({
  message,
  onUndo,
  onSearch,
}: {
  message: ChatMessage;
  onUndo?: (messageId: string) => void;
  onSearch?: (query: string) => void;
}) {
  const mine = message.role === "user";
  const attachment = message.attachment;

  return (
    <div className={cn("flex flex-col gap-2", mine ? "items-end" : "items-start")}>
      <p
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed text-ink",
          mine ? "rounded-br-md bg-muted" : "rounded-bl-md bg-saffron-soft"
        )}
      >
        {message.text}
      </p>

      {attachment?.kind === "edit" ? (
        <div className="flex max-w-[85%] items-center gap-2 rounded-full bg-sage-soft py-1.5 pr-1.5 pl-3 text-xs font-medium text-ink">
          <Check size={14} aria-hidden="true" className="shrink-0 text-sage" />
          <span>{attachment.summary}</span>
          <button
            type="button"
            onClick={() => onUndo?.(message.id)}
            className="rounded-full px-2 py-1 font-semibold text-saffron-ink underline underline-offset-2 outline-none hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Undo
          </button>
        </div>
      ) : null}

      {attachment?.kind === "impossible" ? (
        <div className="flex max-w-[85%] flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <p className="text-sm text-ink">{attachment.reason}</p>
          <Button
            variant="outline"
            size="sm"
            className="h-auto min-h-8 justify-start whitespace-normal text-left"
            onClick={() => onSearch?.(attachment.suggestedSearch)}
          >
            <Search aria-hidden="true" />
            <span>Search instead: {attachment.suggestedSearch}</span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div role="status" className="flex items-start">
      <span className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-saffron-soft px-4 py-3">
        <span className="sr-only">Saffron is typing</span>
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            aria-hidden="true"
            className="size-1.5 animate-bounce rounded-full bg-saffron-ink motion-reduce:animate-none"
            style={{ animationDelay: `${dot * 150}ms` }}
          />
        ))}
      </span>
    </div>
  );
}
