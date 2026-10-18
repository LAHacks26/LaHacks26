"use client";

import { useEffect, useState, type CSSProperties, type ReactElement } from "react";
import { SectionLabel } from "@/components/saffron";
import type { LineKind, Recipe } from "@/lib/recipe/schema";
import "./recipe.css";
import { ApplianceChips } from "./ApplianceChips";
import { AskSaffronFab } from "./AskSaffronFab";
import { EditToast } from "./EditToast";
import { formatIngredient, IngredientList } from "./IngredientList";
import { LinePopover, type PopoverMode } from "./LinePopover";
import { RecipeHeader } from "./RecipeHeader";
import { type ReadyBy, StatsStrip } from "./StatsStrip";
import { StepList } from "./StepList";

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
  question?: string;
  suggestions?: string[];
  explanation?: string;
  rejection?: { reason: string; suggestions: string[] };
  impossible?: { reason: string; suggestedSearch: string };
  loadingText?: string;
};

export type RecipeViewProps = {
  recipe: Recipe;
  /** The user's allergy list. Matching ingredients get a warning badge. */
  allergies?: string[];
  /** Defaults to the recipe's base servings. */
  servings?: number;
  unit?: "us" | "metric";
  readyBy?: ReadyBy;
  /** Shared view: no popovers, no chat button, no edit toast. */
  readOnly?: boolean;
  /** Forces the popover open on one line (used by the mock states). */
  active?: ActiveLine | null;
  /** Phrase highlighted inside a step. */
  highlight?: { stepId: string; text: string };
  glowIds?: string[];
  /** How long the glow lasts, in milliseconds. Defaults to 2000. */
  glowMs?: number;
  /** Tip IDs that start expanded. */
  openTipIds?: string[];
  /** Undo toast after an edit. */
  toast?: { summary: string; linesChanged: number };
};

/** A live click: a step opens idle (quick actions only); the other kinds open with suggestions. */
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
  allergies = [],
  servings = recipe.servings,
  unit = "us",
  readyBy,
  readOnly = false,
  active: initialActive = null,
  highlight,
  glowIds = [],
  glowMs = 2000,
  openTipIds = [],
  toast,
}: RecipeViewProps) {
  const [active, setActive] = useState<ActiveLine | null>(initialActive);
  const interactive = !readOnly;

  // Forced mock states: bring the target line (or the first glowing line) into view on mount.
  const focusId = initialActive?.id ?? glowIds[0];
  useEffect(() => {
    if (!focusId) return;
    const target = document.querySelector<HTMLElement>(`[data-line-id="${focusId}"]`);
    target?.scrollIntoView({ block: "center" });
  }, [focusId]);

  function renderLine(kind: LineKind) {
    return function lineWithPopover(id: string, row: ReactElement) {
      const current = active && active.kind === kind && active.id === id ? active : null;
      return (
        <LinePopover
          kind={kind}
          label={current?.label ?? lineLabel(recipe, kind, id, highlight)}
          mode={current?.mode ?? "idle"}
          open={current !== null}
          onOpenChange={(next) =>
            setActive((prev) => {
              if (next) return defaultActive(recipe, kind, id);
              return prev && prev.kind === kind && prev.id === id ? null : prev;
            })
          }
          question={current?.question}
          suggestions={current?.suggestions}
          explanation={current?.explanation}
          rejection={current?.rejection}
          impossible={current?.impossible}
          loadingText={current?.loadingText}
        >
          {row}
        </LinePopover>
      );
    };
  }

  const selectedId = (kind: LineKind) =>
    active && active.kind === kind ? active.id : undefined;

  const glowStyle = { "--glow-duration": `${glowMs}ms` } as CSSProperties;

  return (
    <>
      <article
        style={glowStyle}
        className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pt-8 pb-28 sm:px-6 sm:pt-12"
      >
        <RecipeHeader recipe={recipe} mode={readOnly ? "readOnly" : "edit"} />

        <StatsStrip recipe={recipe} servings={servings} unit={unit} readyBy={readyBy} />

        <section className="flex flex-col gap-3">
          <SectionLabel className="px-3">Ingredients</SectionLabel>
          <IngredientList
            ingredients={recipe.ingredients}
            allergies={allergies}
            selectedId={selectedId("ingredient")}
            glowIds={glowIds}
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
                openTipIds={openTipIds}
                renderLine={interactive ? renderLine("appliance") : undefined}
              />
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <SectionLabel className="px-3">Steps</SectionLabel>
          <StepList
            steps={recipe.steps}
            highlight={highlight}
            glowIds={glowIds}
            selectedId={selectedId("step")}
            openTipIds={openTipIds}
            renderLine={interactive ? renderLine("step") : undefined}
          />
        </section>
      </article>

      {interactive ? <AskSaffronFab /> : null}
      {interactive && toast ? (
        <EditToast summary={toast.summary} linesChanged={toast.linesChanged} />
      ) : null}
    </>
  );
}
