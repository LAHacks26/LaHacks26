"use client";

import { useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { SectionLabel } from "@/components/saffron";
import type { LineKind, Recipe } from "@/lib/recipe/schema";
import "./recipe.css";
import { ApplianceChips } from "./ApplianceChips";
import { AskSaffronFab } from "./AskSaffronFab";
import { EditToast } from "./EditToast";
import { formatIngredient, IngredientList } from "./IngredientList";
import {
  LinePopover,
  type PopoverAction,
  type PopoverMode,
  type SelectionAnchor,
} from "./LinePopover";
import { RecipeHeader } from "./RecipeHeader";
import { type ReadyBy, StatsStrip } from "./StatsStrip";
import { StepList } from "./StepList";

import { scaleIngredient } from "@/lib/recipe/scale";
import { convertTemperaturesInText, displayTemperatureSelection } from "@/lib/recipe/units";

const DEFAULT_SWAPS = ["coconut yogurt", "oat milk", "silken tofu"];

/** Alternatives for a live "I don't have this" click, based on the appliance name. */
function applianceAlternatives(name: string): string[] {
  const lower = name.toLowerCase();
  if (lower.includes("blender")) return ["Immersion blender", "Food processor", "Mash by hand"];
  if (lower.includes("skillet")) return ["Dutch oven", "Wok", "Large saucepan"];
  if (lower.includes("oven")) return ["Stovetop skillet", "Air fryer", "Toaster oven on broil"];
  return ["Large saucepan", "Dutch oven", "Air fryer"];
}

/** The popover state for one line. Used for the forced mock states and for live clicks. */
export type ActiveLine = {
  kind: LineKind;
  id: string;
  mode: PopoverMode;
  /** Overrides the header label. */
  label?: string;
  /** The user's typed question, shown as a quote. */
  question?: string;
  suggestions?: string[];
  suggestionsLoading?: boolean;
  suggestionsError?: string;
  explanation?: string;
  saved?: boolean;
  rejection?: { reason: string; suggestions: string[] };
  impossible?: { reason: string; suggestedSearch: string };
  error?: string;
  loadingText?: string;
  /** The phrase this popover was opened for, if any (PRD §5.4). */
  selectedText?: string;
  selection?: SelectionAnchor;
};

export type LineTarget = { kind: LineKind; id: string };

export type RecipeViewProps = {
  recipe: Recipe;
  chatDock?: ReactNode;
  onContinueChat?: (line: ActiveLine) => void;
  /** The user's allergy list. Matching ingredients get a warning badge. */
  allergies?: string[];
  /** Defaults to the recipe's base servings. */
  servings?: number;
  unit?: "us" | "metric";
  readyBy?: ReadyBy;
  onServingsChange?: (servings: number) => void;
  onUnitChange?: (unit: "us" | "metric") => void;
  stepTimes?: Date[];
  /** Shared view: no popovers, no chat button, no edit toast. */
  readOnly?: boolean;
  /**
   * The open popover. When `onOpenLine` is set, RecipeView is controlled: the parent owns this
   * state. When it is not set (mock pages), RecipeView keeps the state itself, starting from this value.
   */
  active?: ActiveLine | null;
  /** A line was clicked and should open its popover. */
  onOpenLine?: (kind: LineKind, id: string) => void;
  /** The open popover should close. */
  onCloseLine?: () => void;
  /** A quick action, chip, ask field submit or retry inside the open popover. */
  onAction?: (action: PopoverAction) => void;
  /** True while a phrase selection is opening its popover. Read at click time, so it is a function. */
  isPhraseGesture?: () => boolean;
  /** The line an edit is running on. It shimmers. */
  editingTarget?: LineTarget | null;
  /** An edit is running: other edit actions are disabled. */
  editBusy?: boolean;
  /** Phrase highlighted inside a step. */
  highlight?: { stepId: string; text: string };
  glowIds?: string[];
  /** Changes on every edit, so the same lines glow again. */
  glowKey?: number;
  /** How long the glow lasts, in milliseconds. Defaults to 2000. */
  glowMs?: number;
  /** Tip IDs that start expanded. */
  openTipIds?: string[];
  /** Undo toast after an edit. */
  toast?: { summary: string; linesChanged: number };
  onUndo?: () => void;
};

/** A live click in mock mode: a step opens idle (quick actions only); the other kinds open with suggestions. */
function defaultActive(recipe: Recipe, kind: LineKind, id: string): ActiveLine {
  if (kind === "step") {
    return { kind, id, mode: "idle" };
  }
  if (kind === "appliance") {
    const name = recipe.appliances.find((item) => item.id === id)?.name ?? "";
    return { kind, id, mode: "substitute", suggestions: applianceAlternatives(name) };
  }
  return { kind, id, mode: "substitute", suggestions: DEFAULT_SWAPS };
}

function lineLabel(
  recipe: Recipe,
  kind: LineKind,
  id: string,
  highlight?: { stepId: string; text: string }
): string {
  if (kind === "ingredient") {
    const ingredient = recipe.ingredients.find((item) => item.id === id);
    return ingredient ? formatIngredient(ingredient) : id;
  }
  if (kind === "appliance") {
    return recipe.appliances.find((item) => item.id === id)?.name ?? id;
  }
  if (highlight && highlight.stepId === id) {
    return `“${highlight.text}”`;
  }
  const index = recipe.steps.findIndex((step) => step.id === id);
  return index === -1 ? id : `Step ${index + 1}`;
}

export function RecipeView({
  recipe,
  chatDock,
  onContinueChat,
  allergies = [],
  servings = recipe.servings,
  unit = "us",
  readyBy,
  onServingsChange,
  onUnitChange,
  stepTimes,
  readOnly = false,
  active,
  onOpenLine,
  onCloseLine,
  onAction,
  isPhraseGesture,
  editingTarget = null,
  editBusy = false,
  highlight,
  glowIds = [],
  glowKey,
  glowMs = 2000,
  openTipIds = [],
  toast,
  onUndo,
}: RecipeViewProps) {
  const controlled = onOpenLine !== undefined;
  const [localActive, setLocalActive] = useState<ActiveLine | null>(active ?? null);
  const current = controlled ? (active ?? null) : localActive;
  const interactive = !readOnly;

  // Forced mock states: bring the target line (or the first glowing line) into view on mount.
  const [focusId] = useState(() => (controlled ? undefined : (active?.id ?? glowIds[0])));
  useEffect(() => {
    if (!focusId) return;
    const target = document.querySelector<HTMLElement>(`[data-line-id="${focusId}"]`);
    target?.scrollIntoView({ block: "center" });
  }, [focusId]);

  function renderLine(kind: LineKind) {
    return function lineWithPopover(id: string, row: ReactElement) {
      const line = current && current.kind === kind && current.id === id ? current : null;
      return (
        <LinePopover
          kind={kind}
          label={line?.label ?? lineLabel(recipe, kind, id, highlight)}
          mode={line?.mode ?? "idle"}
          open={line !== null}
          onOpenChange={(next, reason) => {
            // A phrase popover owns its line: the click that follows a phrase selection must not toggle
            // it, and a click on the open phrase's own row leaves it alone. Keyboard opens are not
            // trigger-press gestures during a phrase selection, so Enter and Space always open a line.
            if (reason === "trigger-press" && (line?.selectedText || isPhraseGesture?.())) return;
            if (next) {
              if (controlled) onOpenLine?.(kind, id);
              else setLocalActive(defaultActive(recipe, kind, id));
            } else if (line) {
              if (controlled) onCloseLine?.();
              else setLocalActive(null);
            }
          }}
          question={line?.question}
          suggestions={line?.suggestions}
          suggestionsLoading={line?.suggestionsLoading}
          suggestionsError={line?.suggestionsError}
          explanation={line?.explanation}
          saved={line?.saved}
          rejection={line?.rejection}
          impossible={line?.impossible}
          error={line?.error}
          loadingText={line?.loadingText}
          selection={line?.selection}
          editBusy={editBusy}
          onAction={onAction}
          onContinueChat={line && onContinueChat ? () => onContinueChat(line) : undefined}
        >
          {row}
        </LinePopover>
      );
    };
  }

  const selectedId = (kind: LineKind) =>
    current && current.kind === kind ? current.id : undefined;
  const editingId = (kind: LineKind) =>
    editingTarget && editingTarget.kind === kind ? editingTarget.id : undefined;

  const glowStyle = { "--glow-duration": `${glowMs}ms` } as CSSProperties;

  return (
    <>
      <article
        style={glowStyle}
        className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pt-8 pb-28 sm:px-6 sm:pt-12"
      >
        <RecipeHeader recipe={recipe} mode={readOnly ? "readOnly" : "edit"} />

        <StatsStrip recipe={recipe} servings={servings} unit={unit} readyBy={readyBy} onServingsChange={onServingsChange} onUnitChange={onUnitChange} />

        <section className="flex flex-col gap-3">
          <SectionLabel className="px-3">Ingredients</SectionLabel>
          <IngredientList
            ingredients={recipe.ingredients.map((ingredient) => scaleIngredient(ingredient, servings, recipe.servings))}
            unit={unit}
            allergies={allergies}
            selectedId={selectedId("ingredient")}
            glowIds={glowIds}
            glowKey={glowKey}
            editingId={editingId("ingredient")}
            openTipIds={openTipIds}
            renderLine={interactive ? renderLine("ingredient") : undefined}
          />
        </section>

        {recipe.appliances.length > 0 ? (
          <section className="flex flex-col gap-3">
            <SectionLabel className="px-3">Appliances</SectionLabel>
            <div className="px-3">
              <ApplianceChips
                appliances={recipe.appliances}
                selectedId={selectedId("appliance")}
                glowIds={glowIds}
                glowKey={glowKey}
                editingId={editingId("appliance")}
                openTipIds={openTipIds}
                renderLine={interactive ? renderLine("appliance") : undefined}
              />
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <SectionLabel className="px-3">Steps</SectionLabel>
          <StepList
            steps={recipe.steps.map((step) => ({ ...step, text: convertTemperaturesInText(step.text, unit) }))}
            clockTimes={stepTimes}
            highlight={highlight ? { ...highlight, text: displayTemperatureSelection(recipe.steps.find((step) => step.id === highlight.stepId)?.text ?? highlight.text, unit, highlight.text) } : undefined}
            glowIds={glowIds}
            glowKey={glowKey}
            selectedId={selectedId("step")}
            editingId={editingId("step")}
            openTipIds={openTipIds}
            renderLine={interactive ? renderLine("step") : undefined}
          />
        </section>
      </article>

      {interactive ? (chatDock ?? <AskSaffronFab />) : null}
      {interactive && toast ? (
        <EditToast
          summary={toast.summary}
          linesChanged={toast.linesChanged}
          onUndo={onUndo}
        />
      ) : null}
    </>
  );
}
