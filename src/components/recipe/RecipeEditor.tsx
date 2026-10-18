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
import { ChatDock } from "@/components/chat/ChatDock";
import { CookMode } from "@/components/cook/CookMode";
import { TimerTray } from "@/components/cook/TimerTray";
import { useTimerAlarms } from "@/components/cook/useTimerAlarms";
import { unlockChime } from "@/lib/cook/chime";
import { useChatStore } from "@/lib/store/chatStore";
import { readCookState, useCookStore, type CookTimer } from "@/lib/store/cookStore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { parseAllergies, readAllergies, readAllergiesRaw, subscribeAllergies } from "@/lib/allergies";
import type { EditAction } from "@/lib/ai/contracts";
import { AiClientError, explainStream, requestEdit, suggestSwaps } from "@/lib/api/aiClient";
import type { LineKind, LineRef, Recipe } from "@/lib/recipe/schema";
import { formatClock, readyByStatus, stepClockTimes } from "@/lib/recipe/schedule";
import { canonicalTemperatureSelection, type UnitSystem } from "@/lib/recipe/units";
import { useRecipeStore } from "@/lib/store/recipeStore";
import type { PopoverAction, SelectionAnchor } from "./LinePopover";
import { type ActiveLine, RecipeView } from "./RecipeView";
import { createRecipeSession, type RecipeSession } from "./recipeSession";
import type { SavedDocument } from "@/lib/saved/contracts";
import { SaveControls } from "./SaveControls";
import { readSavedDraft } from "@/lib/store/savedDraft";

// The interactive recipe page (PRD §5.3, §5.4). Owns the popover state machine and the AI calls,
// and reads the working copy, edit lock, glow and undo toast from the store.

const TOAST_MS = 8000;
const NO_TIMERS: CookTimer[] = [];
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
  sourceRecipeId?: string;
  recipe: Recipe;
  readyBy?: string;
  savedDocument?: SavedDocument;
  forkedFromSlug?: string;
  draftKey?: string;
};

function subscribeMinute(onChange: () => void) {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
}
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverMinute = () => null;

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

export function RecipeEditor(props: RecipeEditorProps) {
  // Navigation must also reset popovers, retry closures and selection state.
  const recipeKey = props.savedDocument ? `saved:${props.savedDocument.id}` : props.draftKey ?? props.sourceRecipeId!;
  return <RecipeEditorSession key={`${recipeKey}:${props.readyBy ?? ""}`} recipeKey={recipeKey} {...props} />;
}

function RecipeEditorSession({ sourceRecipeId, recipe, readyBy, savedDocument, forkedFromSlug, recipeKey }: RecipeEditorProps & { recipeKey: string }) {
  const router = useRouter();
  const copy = useRecipeStore((state) => state.copy);
  const loadedKey = useRecipeStore((state) => state.recipeKey);
  const editing = useRecipeStore((state) => state.editing);
  const glow = useRecipeStore((state) => state.glow);
  const undoToast = useRecipeStore((state) => state.toast);
  const newTipIds = useRecipeStore((state) => state.newTipIds);

  // Until the store holds this recipe's working copy, show the server recipe without interaction.
  const current = copy && loadedKey === recipeKey ? copy : null;
  const view = current ? current.recipe : recipe;
  const [servings, setServings] = useState<number | null>(null);
  const [unit, setUnit] = useState<UnitSystem>("us");
  const minute = useSyncExternalStore(subscribeMinute, currentMinute, serverMinute);
  const timing = current?.readyBy && minute !== null
    ? readyByStatus(new Date(current.readyBy), view.times.totalMin, new Date(minute))
    : null;
  const readyByDisplay = timing?.kind === "ahead"
    ? { kind: "startBy" as const, startAt: formatClock(timing.startBy), readyAt: formatClock(timing.readyAt) }
    : timing ? { kind: "eta" as const, readyAt: formatClock(timing.readyAt) } : undefined;

  const stepTimes = timing && minute !== null
    ? stepClockTimes(view.steps, view.times.totalMin, timing.kind === "ahead" ? timing.startBy : new Date(minute))
    : undefined;

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
  // Closing the popover does not cancel an edit; leaving this recipe does.
  const recipeSessionRef = useRef<RecipeSession | null>(null);
  // Set for the moment after a phrase selection opens its popover, so the click that follows does not toggle it.
  const phraseGestureRef = useRef(false);
  // Re-runs the last explain or edit for "Try again".
  const retryRef = useRef<(() => void) | null>(null);

  // Cook mode (PRD §5.6) is keyed by this editor's recipeKey, so saves and forks of one source keep separate progress.
  const cooking = useCookStore((state) => state.active && state.recipeKey === recipeKey);
  const cookTimers = useCookStore((state) => (state.recipeKey === recipeKey ? state.timers : NO_TIMERS));
  // True once Start cooking is pressed: that click is the gesture the mic and chime need.
  const [armVoice, setArmVoice] = useState(false);
  const resumedRef = useRef(false);
  const loadedStepIds = current ? current.recipe.steps.map((step) => step.id).join("\n") : null;
  useTimerAlarms(recipeKey);

  // Resumes cook state after a refresh, and keeps it in step with edits (clicks, chat or voice).
  useEffect(() => {
    if (loadedStepIds === null) return;
    const ids = loadedStepIds ? loadedStepIds.split("\n") : [];
    const store = useCookStore.getState();
    if (!resumedRef.current) {
      resumedRef.current = true;
      if (store.recipeKey !== recipeKey) {
        const saved = readCookState(recipeKey);
        if (saved && (saved.active || saved.timers.length > 0)) {
          store.start(recipeKey, ids);
          if (!saved.active) useCookStore.getState().end();
        }
        return;
      }
    }
    if (store.recipeKey === recipeKey) store.syncSteps(ids);
  }, [loadedStepIds, recipeKey]);

  function startCooking() {
    if (!current) return;
    unlockChime();
    closePopover();
    setArmVoice(true);
    const ids = current.recipe.steps.map((step) => step.id);
    const saved = readCookState(recipeKey);
    const store = useCookStore.getState();
    store.start(recipeKey, ids);
    // Ended after the last step: cook it again from the top. Timers carry over; unfinished progress resumes.
    if (saved && !saved.active && ids.length > 0 && ids.every((id) => saved.doneStepIds.includes(id))) {
      for (const id of ids) store.markUndone(id);
      store.focusStep(ids[0]!);
    }
    window.scrollTo({ top: 0 });
  }

  // Loads this recipe before paint. load() restores this recipe's saved working copy when there is one.
  useLayoutEffect(() => {
    const store = useRecipeStore.getState();
    const draft = savedDocument ? readSavedDraft(savedDocument.id) : null;
    if (savedDocument) store.loadWorkingCopy(recipeKey, draft ? { ...draft.copy, savedId: savedDocument.id, sourceRecipeId: savedDocument.copy.sourceRecipeId } : savedDocument.copy);
    else if (sourceRecipeId) store.load(sourceRecipeId, recipe, readyBy);
    else store.loadWorkingCopy(recipeKey, { recipe, version: 0, undoStack: [] }, true);
    useChatStore.getState().load(recipeKey, draft?.messages ?? savedDocument?.messages);
    const scope = createRecipeSession(recipeKey);
    recipeSessionRef.current = scope;
    return () => scope.dispose();
    // The key remounts for a new source/deadline. A refreshed server object must not wipe edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeKey]);

  // Ctrl/Cmd+Z undoes, unless the user is typing in a field. Not in cook mode: there is no undo
  // toast there, so a stray keypress would silently revert a voice edit.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "z" || isTypingTarget(event.target)) return;
      const cook = useCookStore.getState();
      if (cook.active && cook.recipeKey === recipeKey) return;
      if (useRecipeStore.getState().undo()) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recipeKey]);

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
    const scope = recipeSessionRef.current;
    const snapshot = scope?.currentCopy();
    if (!scope || !snapshot) return;
    suggestRef.current?.abort();
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, scope.signal]);
    suggestRef.current = controller;
    patch(session, null, { suggestions: undefined, suggestionsLoading: true, suggestionsError: undefined });
    try {
      const suggestions = await suggestSwaps(
        { recipe: snapshot.recipe, target, allergies: readAllergies() },
        signal
      );
      if (signal.aborted || !scope.currentCopy()) return;
      patch(session, null, { suggestions, suggestionsLoading: false });
    } catch (error) {
      if (signal.aborted || !scope.currentCopy()) return;
      patch(session, null, {
        suggestionsLoading: false,
        suggestionsError: messageOf(error, SUGGEST_ERROR),
      });
    } finally {
      if (suggestRef.current === controller) suggestRef.current = null;
    }
  }

  async function runExplain(target: LineRef) {
    const scope = recipeSessionRef.current;
    const snapshot = scope?.currentCopy();
    if (!scope || !snapshot) return;
    const session = sessionRef.current;
    explainRef.current?.abort();
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, scope.signal]);
    explainRef.current = controller;
    const body = ++bodyRef.current;
    retryRef.current = () => void runExplain(target);
    patch(session, body, { mode: "explain", explanation: "", saved: false, error: undefined });

    try {
      const text = await explainStream(
        { recipe: snapshot.recipe, target, allergies: readAllergies() },
        {
          signal,
          onChunk: (textSoFar) => {
            if (!signal.aborted && scope.currentCopy()) patch(session, body, { explanation: textSoFar });
          },
        }
      );
      if (signal.aborted || !scope.currentCopy()) return;
      const tipId = scope.saveExplanation(target, text, snapshot.version);
      if (tipId === null) {
        patch(session, body, { mode: "error", error: STALE_ERROR });
        return;
      }
      patch(session, body, { explanation: text, saved: tipId !== null });
    } catch (error) {
      if (signal.aborted || !scope.currentCopy()) return;
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
    scope: RecipeSession,
  ): Promise<"done" | "stale"> {
    const snapshot = scope.currentCopy();
    if (!snapshot || !scope.ownsEdit()) return "done";
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
        scope.signal
      );
      const store = useRecipeStore.getState();
      // The working copy may have switched to another recipe while the request ran. Never apply it there.
      if (!scope.ownsEdit()) return "done";
      const result = response.result;
      // Answers and rejections are also tied to the version they were requested against.
      if (store.copy?.version !== response.baseVersion) return "stale";

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
      if (!scope.ownsEdit()) return "done";
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
    const scope = recipeSessionRef.current;
    if (!scope?.beginEdit(target)) return;
    interruptExplain();
    const session = sessionRef.current;
    const body = ++bodyRef.current;
    retryRef.current = () => void runEdit(target, action, message, question);
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
        outcome = await attemptEdit(session, body, target, action, message, question, scope);
      }
      if (outcome === "stale") settleEdit(session, body, { mode: "error", error: STALE_ERROR }, STALE_ERROR);
    } finally {
      // Never release a lock acquired by another editor while this request was pending.
      scope.finishEdit();
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
    const displayedText = selection.toString().trim();
    const row = lineElementOf(selection.anchorNode);
    if (!displayedText || !row || row !== lineElementOf(selection.focusNode)) return;

    const step = view.steps.find((item) => item.id === row.dataset.lineId);
    if (!step) return;
    const text = canonicalTemperatureSelection(normalizeText(step.text), unit, normalizeText(displayedText));
    if (!text) return;

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
    <>
    {/* Hidden, not unmounted, while cooking: SaveControls keeps autosaving voice edits. */}
    <div
      hidden={cooking}
      onMouseUp={onMouseUp}
      onPointerDown={() => {
        phraseGestureRef.current = false;
      }}
      aria-busy={current ? undefined : true}
      className={current ? undefined : "pointer-events-none opacity-60"}
    >
      <RecipeView
        headerActions={current ? <SaveControls recipeKey={recipeKey} sourceRecipeId={sourceRecipeId} forkedFromSlug={forkedFromSlug} initial={savedDocument} onStartCooking={startCooking} /> : null}
        chatDock={current ? <ChatDock recipeKey={recipeKey} initialMessages={savedDocument?.messages} /> : null}
        onContinueChat={(line) => {
          const chat = useChatStore.getState();
          const label = line.selectedText ?? line.label ?? (line.kind === "ingredient"
            ? view.ingredients.find((item) => item.id === line.id)?.item
            : line.kind === "appliance" ? view.appliances.find((item) => item.id === line.id)?.name
              : `Step ${view.steps.findIndex((item) => item.id === line.id) + 1}`) ?? line.id;
          chat.attach(targetOf(line), label);
          if (line.question) chat.append({ role: "user", content: line.question });
          if (line.explanation) chat.append({ role: "assistant", content: line.explanation });
          closePopover();
        }}
        servings={servings ?? view.servings}
        unit={unit}
        onServingsChange={setServings}
        onUnitChange={setUnit}
        stepTimes={stepTimes}
        recipe={view}
        readyBy={readyByDisplay}
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
    {cooking && current ? (
      <CookMode recipeKey={recipeKey} recipe={view} allergies={allergies} unit={unit} armOnStart={armVoice} />
    ) : null}
    {/* Timers keep running after End cooking. Bottom-left, clear of the chat button. */}
    {!cooking && cookTimers.length > 0 ? (
      <div className="fixed bottom-4 left-4 z-20">
        <TimerTray timers={cookTimers} onCancel={(id) => useCookStore.getState().cancelTimer(id)} />
      </div>
    ) : null}
    </>
  );
}
