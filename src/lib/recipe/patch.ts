import { RecipeSchema, type AiEditResult, type LineRef, type PatchOp, type Recipe, type Step, type Tip } from "./schema";

// Pure patch engine shared by client and server (PRD §6.3).

export class PatchError extends Error {}

type LineKind = LineRef["kind"];

const ID_PREFIX: Record<LineKind, string> = { ingredient: "i", step: "s", appliance: "a" };

function fail(message: string): never {
  throw new PatchError(message);
}

/** Numeric part of an ID like "i12" for the given prefix, or 0 when it has another shape. */
function numberOf(id: string, prefix: string): number {
  if (!id.startsWith(prefix)) return 0;
  const digits = id.slice(prefix.length);
  return /^\d+$/.test(digits) ? Number(digits) : 0;
}

function maxNumber(ids: string[], prefix: string): number {
  return ids.reduce((max, id) => Math.max(max, numberOf(id, prefix)), 0);
}

function nextTipId(recipe: Recipe): string {
  const lines: { tips: Tip[] }[] = [...recipe.ingredients, ...recipe.steps, ...recipe.appliances];
  const tipIds = lines.flatMap((line) => line.tips.map((tip) => tip.id));
  return `t${maxNumber(tipIds, "t") + 1}`;
}

function hasLine(recipe: Recipe, kind: LineKind, id: string): boolean {
  if (kind === "ingredient") return recipe.ingredients.some((x) => x.id === id);
  if (kind === "step") return recipe.steps.some((x) => x.id === id);
  return recipe.appliances.some((x) => x.id === id);
}

function lineTips(recipe: Recipe, kind: LineKind, id: string): Tip[] | undefined {
  if (kind === "ingredient") return recipe.ingredients.find((x) => x.id === id)?.tips;
  if (kind === "step") return recipe.steps.find((x) => x.id === id)?.tips;
  return recipe.appliances.find((x) => x.id === id)?.tips;
}

function allLineIds(recipe: Recipe): Set<string> {
  return new Set([
    ...recipe.ingredients.map((x) => x.id),
    ...recipe.steps.map((x) => x.id),
    ...recipe.appliances.map((x) => x.id),
  ]);
}

function parseRecipe(candidate: unknown): Recipe {
  const parsed = RecipeSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail(`result: ${issue.path.map(String).join(".")} ${issue.message}`);
  }
  return parsed.data;
}

/**
 * Server-side, before validation: gives every newly created ingredient, step and appliance
 * (add_ingredient, insert_step, add_appliance) the next free ID ("i12", "s9", "a4") when its ID is
 * already used or repeated, and rewrites references to it in later ops. Returns new ops; never mutates.
 */
export function normalizePatchIds(recipe: Recipe, ops: PatchOp[]): PatchOp[] {
  const live: Record<LineKind, Set<string>> = {
    ingredient: new Set(recipe.ingredients.map((x) => x.id)),
    step: new Set(recipe.steps.map((x) => x.id)),
    appliance: new Set(recipe.appliances.map((x) => x.id)),
  };
  const highest: Record<LineKind, number> = {
    ingredient: maxNumber(recipe.ingredients.map((x) => x.id), ID_PREFIX.ingredient),
    step: maxNumber(recipe.steps.map((x) => x.id), ID_PREFIX.step),
    appliance: maxNumber(recipe.appliances.map((x) => x.id), ID_PREFIX.appliance),
  };
  // Old ID -> new ID for entities the patch renumbered. Later ops are rewritten through this map.
  const renames: Record<LineKind, Map<string, string>> = {
    ingredient: new Map(),
    step: new Map(),
    appliance: new Map(),
  };

  const rename = (kind: LineKind, id: string): string => renames[kind].get(id) ?? id;

  // Keeps a new entity's ID when it is free, otherwise takes the next free number for its prefix.
  const claim = (kind: LineKind, id: string): string => {
    let finalId = id;
    if (live[kind].has(id)) {
      highest[kind] += 1;
      finalId = `${ID_PREFIX[kind]}${highest[kind]}`;
      renames[kind].set(id, finalId);
    } else {
      renames[kind].delete(id);
    }
    live[kind].add(finalId);
    highest[kind] = Math.max(highest[kind], numberOf(finalId, ID_PREFIX[kind]));
    return finalId;
  };

  return ops.map((op): PatchOp => {
    switch (op.op) {
      case "update_ingredient":
        return { ...op, id: rename("ingredient", op.id) };
      case "add_ingredient": {
        const after = op.after === null ? null : rename("ingredient", op.after);
        const id = claim("ingredient", op.ingredient.id);
        return { ...op, after, ingredient: { ...op.ingredient, id, tips: [] } };
      }
      case "remove_ingredient": {
        const id = rename("ingredient", op.id);
        live.ingredient.delete(id);
        return { ...op, id };
      }
      case "update_step":
        return {
          ...op,
          id: rename("step", op.id),
          ...(op.ingredientIds !== undefined && {
            ingredientIds: op.ingredientIds.map((x) => rename("ingredient", x)),
          }),
          ...(op.applianceIds !== undefined && {
            applianceIds: op.applianceIds.map((x) => rename("appliance", x)),
          }),
        };
      case "insert_step": {
        const after = op.after === null ? null : rename("step", op.after);
        const id = claim("step", op.step.id);
        return {
          ...op,
          after,
          step: {
            ...op.step,
            id,
            ingredientIds: op.step.ingredientIds.map((x) => rename("ingredient", x)),
            applianceIds: op.step.applianceIds.map((x) => rename("appliance", x)),
            tips: [],
          },
        };
      }
      case "remove_step": {
        const id = rename("step", op.id);
        live.step.delete(id);
        return { ...op, id };
      }
      case "add_appliance": {
        const id = claim("appliance", op.appliance.id);
        return { ...op, appliance: { ...op.appliance, id, tips: [] } };
      }
      case "remove_appliance": {
        const id = rename("appliance", op.id);
        live.appliance.delete(id);
        return { ...op, id };
      }
      case "add_tip":
        return { ...op, target: { ...op.target, id: rename(op.target.kind, op.target.id) } };
    }
  });
}

/**
 * Returns one message per problem (empty array = valid): unknown IDs in update/remove/after/target,
 * step refs to ingredients or appliances that won't exist after the patch, duplicate new IDs,
 * and removing every ingredient or every step. Messages are fed back to Gemini on retry.
 */
export function validatePatch(recipe: Recipe, ops: PatchOp[]): string[] {
  const problems: string[] = [];
  const live: Record<LineKind, Set<string>> = {
    ingredient: new Set(recipe.ingredients.map((x) => x.id)),
    step: new Set(recipe.steps.map((x) => x.id)),
    appliance: new Set(recipe.appliances.map((x) => x.id)),
  };
  // Step refs are checked against the recipe after the whole patch, not at the point of the op.
  // A removal drops the pending checks for its ID, since removing it also strips those refs.
  let refChecks: { at: string; kind: LineKind; id: string }[] = [];

  const requireLine = (at: string, kind: LineKind, id: string, suffix = "") => {
    if (!live[kind].has(id)) problems.push(`${at}: unknown ${kind} "${id}"${suffix}`);
  };
  const claimNew = (at: string, kind: LineKind, id: string) => {
    if (live[kind].has(id)) problems.push(`${at}: duplicate ${kind} ID "${id}"`);
    live[kind].add(id);
  };
  const collectRefs = (at: string, ingredientIds?: string[], applianceIds?: string[]) => {
    for (const id of ingredientIds ?? []) refChecks.push({ at, kind: "ingredient", id });
    for (const id of applianceIds ?? []) refChecks.push({ at, kind: "appliance", id });
  };

  ops.forEach((op, i) => {
    const at = `ops[${i}] ${op.op}`;
    switch (op.op) {
      case "update_ingredient":
        requireLine(at, "ingredient", op.id);
        break;
      case "add_ingredient":
        if (op.after !== null) requireLine(at, "ingredient", op.after, " (after)");
        claimNew(at, "ingredient", op.ingredient.id);
        break;
      case "remove_ingredient":
        requireLine(at, "ingredient", op.id);
        live.ingredient.delete(op.id);
        refChecks = refChecks.filter((c) => !(c.kind === "ingredient" && c.id === op.id));
        break;
      case "update_step":
        requireLine(at, "step", op.id);
        collectRefs(at, op.ingredientIds, op.applianceIds);
        break;
      case "insert_step":
        if (op.after !== null) requireLine(at, "step", op.after, " (after)");
        claimNew(at, "step", op.step.id);
        collectRefs(at, op.step.ingredientIds, op.step.applianceIds);
        break;
      case "remove_step":
        requireLine(at, "step", op.id);
        live.step.delete(op.id);
        break;
      case "add_appliance":
        claimNew(at, "appliance", op.appliance.id);
        break;
      case "remove_appliance":
        requireLine(at, "appliance", op.id);
        live.appliance.delete(op.id);
        refChecks = refChecks.filter((c) => !(c.kind === "appliance" && c.id === op.id));
        break;
      case "add_tip":
        requireLine(at, op.target.kind, op.target.id);
        break;
    }
  });

  for (const check of refChecks) {
    if (!live[check.kind].has(check.id)) {
      problems.push(`${check.at}: unknown ${check.kind} "${check.id}" (not in the recipe after this patch)`);
    }
  }
  if (live.ingredient.size === 0) {
    problems.push("result: the patch removes every ingredient; a recipe needs at least one");
  }
  if (live.step.size === 0) {
    problems.push("result: the patch removes every step; a recipe needs at least one");
  }

  // Structural checks (timer ranges, ID shapes) come from applyPatch's final parse.
  if (problems.length === 0) {
    try {
      applyPatch(recipe, ops);
    } catch (error) {
      if (error instanceof PatchError) problems.push(error.message);
      else throw error;
    }
  }
  return problems;
}

/**
 * Applies ops in order without mutating `recipe`. `touchedIds` lists lines that were updated or
 * added (including the target line of add_tip), for the glow. Removed lines are not listed.
 * add_tip gets the next free tip ID ("t3"), with anchorText from target.selectedText.
 * Throws PatchError on an invalid op.
 */
export function applyPatch(recipe: Recipe, ops: PatchOp[]): { recipe: Recipe; touchedIds: string[] } {
  const r = structuredClone(recipe);
  const touched: string[] = [];
  // Pending ref checks; a removal drops the checks for its ID, since removing it also strips those refs.
  let refChecks: { at: string; kind: LineKind; id: string }[] = [];

  const collectRefs = (at: string, step: Step) => {
    for (const id of step.ingredientIds) refChecks.push({ at, kind: "ingredient", id });
    for (const id of step.applianceIds) refChecks.push({ at, kind: "appliance", id });
  };
  // Index in the step list for an insert: null means the start, otherwise right after `after`.
  const insertIndex = (at: string, after: string | null, list: { id: string }[], kind: LineKind): number => {
    if (after === null) return 0;
    const index = list.findIndex((x) => x.id === after);
    if (index < 0) fail(`${at}: unknown ${kind} "${after}" (after)`);
    return index + 1;
  };

  ops.forEach((op, i) => {
    const at = `ops[${i}] ${op.op}`;
    switch (op.op) {
      case "update_ingredient": {
        const line = r.ingredients.find((x) => x.id === op.id);
        if (!line) fail(`${at}: unknown ingredient "${op.id}"`);
        if (op.qty !== undefined) line.qty = op.qty;
        if (op.unit !== undefined) line.unit = op.unit;
        if (op.item !== undefined) line.item = op.item;
        if (op.note !== undefined) line.note = op.note;
        if (op.allergens !== undefined) line.allergens = [...op.allergens];
        touched.push(line.id);
        break;
      }
      case "add_ingredient": {
        if (hasLine(r, "ingredient", op.ingredient.id)) fail(`${at}: duplicate ingredient ID "${op.ingredient.id}"`);
        const index = insertIndex(at, op.after, r.ingredients, "ingredient");
        const ingredient = structuredClone(op.ingredient);
        r.ingredients.splice(index, 0, ingredient);
        touched.push(ingredient.id);
        break;
      }
      case "remove_ingredient": {
        const index = r.ingredients.findIndex((x) => x.id === op.id);
        if (index < 0) fail(`${at}: unknown ingredient "${op.id}"`);
        r.ingredients.splice(index, 1);
        refChecks = refChecks.filter((c) => !(c.kind === "ingredient" && c.id === op.id));
        for (const step of r.steps) {
          if (step.ingredientIds.includes(op.id)) {
            step.ingredientIds = step.ingredientIds.filter((x) => x !== op.id);
            touched.push(step.id);
          }
        }
        break;
      }
      case "update_step": {
        const step = r.steps.find((x) => x.id === op.id);
        if (!step) fail(`${at}: unknown step "${op.id}"`);
        if (op.text !== undefined) step.text = op.text;
        if (op.estMin !== undefined) step.estMin = op.estMin;
        if (op.timer !== undefined) {
          if (op.timer === null) delete step.timer;
          else step.timer = { min: op.timer.min, max: op.timer.max };
        }
        if (op.ingredientIds !== undefined) step.ingredientIds = [...op.ingredientIds];
        if (op.applianceIds !== undefined) step.applianceIds = [...op.applianceIds];
        collectRefs(at, step);
        touched.push(step.id);
        break;
      }
      case "insert_step": {
        if (hasLine(r, "step", op.step.id)) fail(`${at}: duplicate step ID "${op.step.id}"`);
        const index = insertIndex(at, op.after, r.steps, "step");
        const step = structuredClone(op.step);
        r.steps.splice(index, 0, step);
        collectRefs(at, step);
        touched.push(step.id);
        break;
      }
      case "remove_step": {
        const index = r.steps.findIndex((x) => x.id === op.id);
        if (index < 0) fail(`${at}: unknown step "${op.id}"`);
        r.steps.splice(index, 1);
        break;
      }
      case "add_appliance": {
        if (hasLine(r, "appliance", op.appliance.id)) fail(`${at}: duplicate appliance ID "${op.appliance.id}"`);
        const appliance = structuredClone(op.appliance);
        r.appliances.push(appliance);
        touched.push(appliance.id);
        break;
      }
      case "remove_appliance": {
        const index = r.appliances.findIndex((x) => x.id === op.id);
        if (index < 0) fail(`${at}: unknown appliance "${op.id}"`);
        r.appliances.splice(index, 1);
        refChecks = refChecks.filter((c) => !(c.kind === "appliance" && c.id === op.id));
        for (const step of r.steps) {
          if (step.applianceIds.includes(op.id)) {
            step.applianceIds = step.applianceIds.filter((x) => x !== op.id);
            touched.push(step.id);
          }
        }
        break;
      }
      case "add_tip": {
        const tips = lineTips(r, op.target.kind, op.target.id);
        if (!tips) fail(`${at}: unknown ${op.target.kind} "${op.target.id}"`);
        const tip: Tip = {
          id: nextTipId(r),
          text: op.text,
          ...(op.target.selectedText !== undefined ? { anchorText: op.target.selectedText } : {}),
        };
        tips.push(tip);
        touched.push(op.target.id);
        break;
      }
    }
  });

  for (const check of refChecks) {
    if (!hasLine(r, check.kind, check.id)) {
      fail(`${check.at}: unknown ${check.kind} "${check.id}" (not in the recipe after this patch)`);
    }
  }

  const parsed = parseRecipe(r);
  const existing = allLineIds(parsed);
  const touchedIds = [...new Set(touched)].filter((id) => existing.has(id));
  return { recipe: parsed, touchedIds };
}

/**
 * Applies a "patch" result: its ops, then its `meta` (times, difficulty, cleanup) on top.
 * Any other kind returns the recipe unchanged with no touched IDs.
 */
export function applyEditResult(
  recipe: Recipe,
  result: AiEditResult,
): { recipe: Recipe; touchedIds: string[] } {
  if (result.kind !== "patch") return { recipe, touchedIds: [] };
  const applied = applyPatch(recipe, result.ops ?? []);
  const meta = result.meta ?? {};
  const merged = parseRecipe({
    ...applied.recipe,
    ...(meta.times !== undefined ? { times: meta.times } : {}),
    ...(meta.difficulty !== undefined ? { difficulty: meta.difficulty } : {}),
    ...(meta.cleanup !== undefined ? { cleanup: meta.cleanup } : {}),
  });
  return { recipe: merged, touchedIds: applied.touchedIds };
}

/** Adds one tip under a line (used when an explanation finishes streaming). Returns the new recipe and tip ID. */
export function addTip(recipe: Recipe, target: LineRef, text: string): { recipe: Recipe; tipId: string } {
  const tipId = nextTipId(recipe);
  const applied = applyPatch(recipe, [{ op: "add_tip", target, text }]);
  return { recipe: applied.recipe, tipId };
}
