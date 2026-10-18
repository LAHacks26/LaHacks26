"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { parseAllergies, readAllergies, readAllergiesRaw, subscribeAllergies } from "@/lib/allergies";
import type { EditAction } from "@/lib/ai/contracts";
import { AiClientError, explainStream, requestEdit, suggestSwaps } from "@/lib/api/aiClient";
import type { LineKind, LineRef, Recipe } from "@/lib/recipe/schema";
import { useRecipeStore } from "@/lib/store/recipeStore";
import type { PopoverAction, SelectionAnchor } from "./LinePopover";
import { type ActiveLine, RecipeView } from "./RecipeView";

// The interactive recipe page (PRD §5.3, §5.4). Owns the popover state machine and the AI calls,
// and reads the working copy, edit lock, glow and undo toast from the store.

const TOAST_MS = 8000;
const WITH_PREFIX = /^with\s+/i;
const FALLBACK_ERROR = "Saffron couldn't make that change. Try again.";
const STALE_ERROR = "The recipe changed. Try again.";
const INVALID_ERROR = "Saffron couldn't apply that change. Try again.";
const SUGGEST_ERROR = "Couldn't load swaps. Try again.";
const LOADING_TEXT: Record<EditAction, string> = {
  substitute: "Rewriting the recipe…",
  missing_appliance: "Rewriting for what you have…",
  ask: "Saffron is working on it…",
};

export type RecipeEditorProps = {
  sourceRecipeId: string;
  recipe: Recipe;
};

function messageOf(error: unknown, fallback: string): string {
  return error instanceof AiClientError ? error.message : fallback;
}

/** The line element (a row or chip with data-line-id) that holds a DOM node, if any. */
function lineElementOf(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  return element?.closest<HTMLElement>("[data-line-id]") ?? null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function targetOf(line: ActiveLine): LineRef {
  return line.selectedText
    ? { kind: line.kind, id: line.id, selectedText: line.selectedText }
    : { kind: line.kind, id: line.id };
}

/** Keeps the phrase on a tip when the model returns the same line without it. */
function withSelection(tip: LineRef, target: LineRef): LineRef {
  if (tip.kind !== target.kind || tip.id !== target.id) return tip;
  return target.selectedText && !tip.selectedText ? { ...tip, selectedText: target.selectedText } : tip;
}

export function RecipeEditor({ sourceRecipeId, recipe }: RecipeEditorProps) {
  const router = useRouter();
  const copy = useRecipeStore((state) => state.copy);
  const editing = useRecipeStore((state) => state.editing);
  const glow = useRecipeStore((state) => state.glow);
  const undoToast = useRecipeStore((state) => state.toast);
  const newTipIds = useRecipeStore((state) => state.newTipIds);

  // Until the store holds this recipe's working copy, show the server recipe without interaction.
  const current = copy && copy.sourceRecipeId === sourceRecipeId ? copy : null;
  const view = current ? current.recipe : recipe;

  // The server render has no allergy list, and the first client render reads the saved one, so
  // a server-rendered page with no badges can briefly differ from the hydrated one. The list is
  // only used for badges and the AI requests.
  const allergiesRaw = useSyncExternalStore(subscribeAllergies, readAllergiesRaw, () => null);
  const allergies = useMemo(() => parseAllergies(allergiesRaw), [allergiesRaw]);

  const [active, setActive] = useState<ActiveLine | null>(null);
  // Mirrors `active` so async results read the latest popover, not the one from their render.
  const activeRef = useRef<ActiveLine | null>(null);
  // Bumped whenever the popover opens or closes. Results for an older popover are dropped.
  const sessionRef = useRef(0);
  // Bumped whenever an explain or edit starts or the view switches. Only the latest may write into the popover.
  const bodyRef = useRef(0);
  const explainRef = useRef<AbortController | null>(null);
  const suggestRef = useRef<AbortController | null>(null);
  // Aborted on unmount only. Closing the popover does not cancel an edit, which may still apply.
  const mountRef = useRef<AbortController | null>(null);
  // Set for the moment after a phrase selection opens its popover, so the click that follows does not toggle it.
  const phraseGestureRef = useRef(false);
  // Re-runs the last explain or edit for "Try again".
  const retryRef = useRef<(() => void) | null>(null);

  // Loads this recipe before paint. load() restores this recipe's saved working copy when there is one.
  useLayoutEffect(() => {
    useRecipeStore.getState().load(sourceRecipeId, recipe);
    // Reload only when the source changes. A new server object for the same recipe must not wipe edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceRecipeId]);

  // Each mount gets its own abort controller. Unmount cancels the requests still in flight.
  useEffect(() => {
    const controller = new AbortController();
    mountRef.current = controller;
    return () => {
      controller.abort();
      explainRef.current?.abort();
      suggestRef.current?.abort();
    };
  }, []);

  // Ctrl/Cmd+Z undoes, unless the user is typing in a field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "z" || isTypingTarget(event.target)) return;
      if (useRecipeStore.getState().undo()) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The undo toast goes away on its own after a few seconds.
  useEffect(() => {
    if (!undoToast) return;
    const timer = window.setTimeout(() => useRecipeStore.getState().dismissToast(), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [undoToast]);

  function commit(next: ActiveLine | null) {
    activeRef.current = next;
    setActive(next);
  }

  /** Writes into the open popover while its session (and body, when given) is current. Returns false when it was dropped. */
  function patch(session: number, body: number | null, fields: Partial<ActiveLine>): boolean {
    const line = activeRef.current;
    if (!line || sessionRef.current !== session) return false;
    if (body !== null && bodyRef.current !== body) return false;
    commit({ ...line, ...fields });
    return true;
  }

  /**
   * An edit outcome that the popover cannot show (it closed, or the view moved on) becomes a toast,
   * so nothing is dropped silently.
   */
  function settleEdit(session: number, body: number, fields: Partial<ActiveLine>, toastText: string) {
    if (!patch(session, body, fields)) toast(toastText);
  }

  function closePopover() {
    sessionRef.current += 1;
    explainRef.current?.abort();
    explainRef.current = null;
    suggestRef.current?.abort();
    suggestRef.current = null;
    retryRef.current = null;
    commit(null);
  }

  /** Stops a streaming explanation and makes its late results stale, when the user switches view. */
  function interruptExplain() {
    explainRef.current?.abort();
    explainRef.current = null;
    bodyRef.current += 1;
  }

  function openLine(kind: LineKind, id: string, selection?: SelectionAnchor, selectedText?: string) {
    closePopover();
    const session = sessionRef.current;
    const base = { kind, id, selection, selectedText };
    if (kind === "ingredient") {
      commit({ ...base, mode: "substitute", suggestionsLoading: true });
      void prefetchSwaps(session, { kind, id });
    } else {
      commit({ ...base, mode: "idle" });
    }
  }

  async function prefetchSwaps(session: number, target: LineRef) {
    const snapshot = useRecipeStore.getState().copy;
    if (!snapshot) return;
    suggestRef.current?.abort();
    const controller = new AbortController();
    suggestRef.current = controller;
    patch(session, null, { suggestions: undefined, suggestionsLoading: true, suggestionsError: undefined });
    try {
      const suggestions = await suggestSwaps(
        { recipe: snapshot.recipe, target, allergies: readAllergies() },
        controller.signal
      );
      if (controller.signal.aborted) return;
      patch(session, null, { suggestions, suggestionsLoading: false });
    } catch (error) {
      if (controller.signal.aborted) return;
      patch(session, null, {
        suggestionsLoading: false,
        suggestionsError: messageOf(error, SUGGEST_ERROR),
      });
    } finally {
      if (suggestRef.current === controller) suggestRef.current = null;
    }
  }

  async function runExplain(target: LineRef) {
    const snapshot = useRecipeStore.getState().copy;
    if (!snapshot || snapshot.sourceRecipeId !== sourceRecipeId) return;
    const session = sessionRef.current;
    explainRef.current?.abort();
    const controller = new AbortController();
    explainRef.current = controller;
    const body = ++bodyRef.current;
    retryRef.current = () => void runExplain(target);
    patch(session, body, { mode: "explain", explanation: "", saved: false, error: undefined });

    try {
      const text = await explainStream(
        { recipe: snapshot.recipe, target, allergies: readAllergies() },
        {
          signal: controller.signal,
          onChunk: (textSoFar) => patch(session, body, { explanation: textSoFar }),
        }
      );
      if (controller.signal.aborted) return;
      const tipId = useRecipeStore.getState().addTip(target, text);
      patch(session, body, { explanation: text, saved: tipId !== null });
    } catch (error) {
      if (controller.signal.aborted) return;
      patch(session, body, { mode: "error", error: messageOf(error, FALLBACK_ERROR) });
    } finally {
      if (explainRef.current === controller) explainRef.current = null;
    }
  }

  /** One request and its result. "stale" means the recipe moved on, so the caller may retry once. */
  async function attemptEdit(
    session: number,
    body: number,
    target: LineRef,
    action: EditAction,
    message: string | undefined,
    question: string | undefined,
    signal: AbortSignal,
  ): Promise<"done" | "stale"> {
    const snapshot = useRecipeStore.getState().copy;
    if (!snapshot || snapshot.sourceRecipeId !== sourceRecipeId) return "done";
    try {
      const response = await requestEdit(
        {
          recipe: snapshot.recipe,
          baseVersion: snapshot.version,
          target,
          action,
          message,
          allergies: readAllergies(),
        },
        signal
      );
      const store = useRecipeStore.getState();
      // The working copy may have switched to another recipe while the request ran. Never apply it there.
      if (store.copy?.sourceRecipeId !== sourceRecipeId) return "done";
      const result = response.result;

      if (result.kind === "patch") {
        const outcome = store.applyEdit(result, response.baseVersion);
        if (outcome === "stale") return "stale";
        if (outcome === "ignored") {
          settleEdit(session, body, { mode: "error", error: INVALID_ERROR }, INVALID_ERROR);
          return "done";
        }
        // Applied. The store sets the glow and the toast. Close the popover unless a newer
        // explanation or edit has taken it over.
        if (sessionRef.current === session && bodyRef.current === body) closePopover();
        return "done";
      }

      if (result.kind === "rejected") {
        const reason = result.reason ?? "That swap won't work.";
        settleEdit(
          session,
          body,
          { mode: "rejected", rejection: { reason, suggestions: result.suggestions ?? [] } },
          reason
        );
      } else if (result.kind === "impossible") {
        const reason = result.reason ?? "Saffron can't make that change.";
        settleEdit(
          session,
          body,
          {
            mode: "impossible",
            impossible: { reason, suggestedSearch: result.suggestedSearch ?? "" },
          },
          reason
        );
      } else if (result.kind === "answer" || result.kind === "tip") {
        const text = result.text ?? "";
        const tipTarget = result.kind === "tip" && result.target ? result.target : target;
        const tipId = store.addTip(withSelection(tipTarget, target), text);
        patch(session, body, { mode: "answer", explanation: text, saved: tipId !== null, question });
      }
      return "done";
    } catch (error) {
      if (signal.aborted) return "done";
      const message = messageOf(error, FALLBACK_ERROR);
      settleEdit(session, body, { mode: "error", error: message }, message);
      return "done";
    }
  }

  async function runEdit(
    target: LineRef,
    action: EditAction,
    message: string | undefined,
    question?: string,
  ) {
    const store = useRecipeStore.getState();
    const signal = mountRef.current?.signal;
    if (!signal || store.editing || !store.copy || store.copy.sourceRecipeId !== sourceRecipeId) return;
    const session = sessionRef.current;
    const body = ++bodyRef.current;
    retryRef.current = () => void runEdit(target, action, message, question);
    store.setEditing(target);
    patch(session, body, {
      mode: "loading",
      loadingText: LOADING_TEXT[action],
      question,
      error: undefined,
      rejection: undefined,
      impossible: undefined,
    });

    try {
      // A stale result means the recipe changed while the request ran. Re-run once on the fresh copy.
      let outcome: "done" | "stale" = "stale";
      for (let attempt = 0; attempt < 2 && outcome === "stale"; attempt++) {
        outcome = await attemptEdit(session, body, target, action, message, question, signal);
      }
      if (outcome === "stale") settleEdit(session, body, { mode: "error", error: STALE_ERROR }, STALE_ERROR);
    } finally {
      // applyEdit clears the lock itself. Clear it here only when nothing else did.
      const state = useRecipeStore.getState();
      if (state.editing) state.setEditing(null);
    }
  }

  function runCommand(action: PopoverAction) {
    const line = activeRef.current;
    if (!line) return;
    const session = sessionRef.current;
    const target = targetOf(line);

    switch (action.type) {
      case "substitute":
        if (line.kind !== "ingredient") return;
        interruptExplain();
        patch(session, null, { mode: "substitute" });
        if (!line.suggestions && !line.suggestionsLoading) void prefetchSwaps(session, target);
        return;
      case "ask":
        interruptExplain();
        patch(session, null, { mode: "idle" });
        return;
      case "explain":
        void runExplain(target);
        return;
      case "missing_appliance":
        void runEdit(target, "missing_appliance", undefined);
        return;
      case "submit": {
        const text = action.text.trim();
        if (!text) return;
        if (line.kind === "ingredient" && WITH_PREFIX.test(text)) {
          const replacement = text.replace(WITH_PREFIX, "").trim();
          if (replacement) void runEdit(target, "substitute", replacement, text);
          return;
        }
        void runEdit(target, "ask", text, text);
        return;
      }
      case "swap":
        // A chip on a rejection. Only an ingredient swap is a substitution; anything else is a question.
        if (line.kind === "ingredient") void runEdit(target, "substitute", action.message);
        else void runEdit(target, "ask", action.message, action.message);
        return;
      case "search":
        router.push(`/?q=${encodeURIComponent(action.query)}`);
        return;
      case "retry":
        retryRef.current?.();
        return;
    }
  }

  // Phrase selection (PRD §5.4): a selection inside one step opens that step's popover, anchored to the phrase.
  function onMouseUp(event: MouseEvent<HTMLDivElement>) {
    if (!current) return;
    // Clicks inside the popover (Explain, chips, the ask field) keep the page selection. That is not a new phrase.
    if (event.target instanceof Element && event.target.closest('[data-slot="popover-content"]')) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const text = selection.toString().trim();
    const row = lineElementOf(selection.anchorNode);
    if (!text || !row || row !== lineElementOf(selection.focusNode)) return;

    const step = view.steps.find((item) => item.id === row.dataset.lineId);
    if (!step || !normalizeText(step.text).includes(normalizeText(text))) return;

    // The same phrase is already open: nothing to do.
    if (active && active.kind === "step" && active.id === step.id && active.selectedText === text) return;

    const range = selection.getRangeAt(0).getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    phraseGestureRef.current = true;
    window.setTimeout(() => {
      phraseGestureRef.current = false;
    }, 0);
    openLine(
      "step",
      step.id,
      {
        lineId: step.id,
        left: range.left - rowRect.left,
        top: range.top - rowRect.top,
        width: range.width,
        height: range.height,
      },
      text
    );
  }

  const highlight =
    active && active.kind === "step" && active.selectedText
      ? { stepId: active.id, text: active.selectedText }
      : undefined;

  return (
    <div
      onMouseUp={onMouseUp}
      onPointerDown={() => {
        phraseGestureRef.current = false;
      }}
      aria-busy={current ? undefined : true}
      className={current ? undefined : "pointer-events-none opacity-60"}
    >
      <RecipeView
        recipe={view}
        allergies={allergies}
        readOnly={!current}
        active={active}
        onOpenLine={(kind, id) => openLine(kind, id)}
        onCloseLine={closePopover}
        onAction={runCommand}
        isPhraseGesture={() => phraseGestureRef.current}
        editingTarget={editing?.target ?? null}
        editBusy={editing !== null}
        highlight={highlight}
        glowIds={glow?.ids ?? []}
        glowKey={glow?.key}
        openTipIds={newTipIds}
        toast={undoToast ? { summary: undoToast.summary, linesChanged: undoToast.linesChanged } : undefined}
        onUndo={() => useRecipeStore.getState().undo()}
      />
    </div>
  );
}
