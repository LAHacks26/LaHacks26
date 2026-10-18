import { formatIngredientQty, type UnitSystem } from "@/lib/recipe/units";
import type { ReactElement, ReactNode } from "react";
import { AllergenBadge } from "@/components/saffron";
import type { Ingredient } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";
import { TipBlock } from "./TipBlock";

const FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [3 / 8, "⅜"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];

/** 0.5 → "½", 1.5 → "1 ½", 0.333 → "⅓", 0.99 → "1", 2 → "2". */
export function formatQty(qty: number | null): string {
  if (qty === null) return "";
  let whole = Math.floor(qty);
  let frac = qty - whole;
  if (frac > 0.98) {
    whole += 1;
    frac = 0;
  }
  if (frac < 0.02) return String(whole);
  const match = FRACTIONS.find(([value]) => Math.abs(frac - value) < 0.02);
  if (match) return whole > 0 ? `${whole} ${match[1]}` : match[1];
  return String(Number(qty.toFixed(2)));
}

/** "1 ½ cup heavy cream". Notes are rendered separately. */
export function formatIngredient(ingredient: Ingredient): string {
  return [formatQty(ingredient.qty), ingredient.unit, ingredient.item]
    .filter((part) => part && part.length > 0)
    .join(" ");
}

/** Ingredient allergens that appear in the user's list (case-insensitive). */
export function matchingAllergens(ingredient: Ingredient, allergies: string[]): string[] {
  const mine = new Set(allergies.map((a) => a.trim().toLowerCase()).filter(Boolean));
  return ingredient.allergens.filter((a) => mine.has(a.trim().toLowerCase()));
}

export type IngredientListProps = {
  ingredients: Ingredient[];
  unit?: UnitSystem;
  allergies: string[];
  selectedId?: string;
  glowIds?: string[];
  /** Changes on every edit, so the same rows glow again. */
  glowKey?: number;
  /** The row an edit is running on. It shimmers. */
  editingId?: string;
  /** Tip IDs that start expanded. */
  openTipIds?: string[];
  onSelect?: (id: string) => void;
  /**
   * Wraps each row (for example in a LinePopover). The row is passed in as a real
   * button, so the wrapper can make it the popover trigger.
   */
  renderLine?: (id: string, row: ReactElement) => ReactNode;
};

type Group = { label?: string; items: Ingredient[] };

function groupIngredients(ingredients: Ingredient[]): Group[] {
  const groups: Group[] = [];
  for (const ingredient of ingredients) {
    const last = groups[groups.length - 1];
    if (last && last.label === ingredient.group) {
      last.items.push(ingredient);
    } else {
      groups.push({ label: ingredient.group, items: [ingredient] });
    }
  }
  return groups;
}

export function IngredientList({
  ingredients,
  unit = "us",
  allergies,
  selectedId,
  glowIds = [],
  glowKey,
  editingId,
  openTipIds = [],
  onSelect,
  renderLine,
}: IngredientListProps) {
  const interactive = Boolean(onSelect || renderLine);
  const glowing = new Set(glowIds);

  return (
    <div className="flex flex-col gap-1">
      {groupIngredients(ingredients).map((group, groupIndex) => (
        <div key={`${group.label ?? "all"}-${groupIndex}`} className="flex flex-col">
          {group.label ? (
            <p className="px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground">
              {group.label}
            </p>
          ) : null}
          <ul className="flex flex-col">
            {group.items.map((ingredient) => {
              const selected = ingredient.id === selectedId;
              const glow = glowing.has(ingredient.id);
              const editing = ingredient.id === editingId;
              const matches = matchingAllergens(ingredient, allergies);
              const className = cn(
                "relative isolate flex min-h-11 w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-base leading-snug text-foreground",
                interactive
                  ? "cursor-pointer outline-none transition-[background-color] duration-150 ease-out hover:bg-saffron-soft/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                  : "cursor-default",
                selected && "bg-saffron-soft ring-2 ring-saffron",
                editing && "recipe-editing"
              );
              const content = (
                <>
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-2.5 shrink-0 rounded-full border-[1.5px] border-saffron"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span>
                      <span className="font-medium tabular-nums">
                        {formatIngredientQty(ingredient, unit)}
                      </span>{" "}
                      {ingredient.item}
                      {ingredient.note ? (
                        <span className="text-muted-foreground">, {ingredient.note}</span>
                      ) : null}
                    </span>
                    {matches.length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {matches.map((allergen) => (
                          <AllergenBadge key={allergen} allergen={allergen} />
                        ))}
                      </span>
                    ) : null}
                  </span>
                  {/* Keyed by glowKey, so a new edit restarts the fade even on the same rows. */}
                  {glow ? (
                    <span
                      key={glowKey}
                      aria-hidden="true"
                      className="recipe-glow pointer-events-none absolute inset-0 -z-10 rounded-lg"
                    />
                  ) : null}
                </>
              );
              const row = interactive ? (
                <button
                  type="button"
                  onClick={onSelect ? () => onSelect(ingredient.id) : undefined}
                  data-line-id={ingredient.id}
                  data-selected={selected || undefined}
                  data-glow={glow || undefined}
                  className={className}
                >
                  {content}
                </button>
              ) : (
                <div
                  data-line-id={ingredient.id}
                  data-selected={selected || undefined}
                  data-glow={glow || undefined}
                  className={className}
                >
                  {content}
                </div>
              );

              return (
                <li key={ingredient.id} className="flex flex-col">
                  {renderLine ? renderLine(ingredient.id, row) : row}
                  {ingredient.tips.map((tip) => (
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
          </ul>
        </div>
      ))}
    </div>
  );
}
