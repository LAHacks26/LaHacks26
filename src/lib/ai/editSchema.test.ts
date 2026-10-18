import { describe, expect, it } from "vitest";
import { FLAT_EDIT_GEMINI_SCHEMA, FlatEditOpSchema, FlatOpError, type FlatEditOp, flatOpToPatchOp, flatResultToDraft } from "./editSchema";

const coconut = {
  id: "i10",
  qty: 1,
  unit: "cup",
  item: "coconut milk",
  note: "",
  group: "",
  allergens: [],
};

describe("flatOpToPatchOp", () => {
  it("converts update_ingredient, passing through only the fields that were set", () => {
    const op = flatOpToPatchOp({ op: "update_ingredient", id: "i9", item: "coconut milk", qty: null });
    expect(op).toEqual({ op: "update_ingredient", id: "i9", item: "coconut milk", qty: null });
  });

  it("converts add_ingredient, dropping empty note and group and filling tips", () => {
    const op = flatOpToPatchOp({ op: "add_ingredient", after: "i8", ingredient: coconut });
    expect(op).toEqual({
      op: "add_ingredient",
      after: "i8",
      ingredient: { id: "i10", qty: 1, unit: "cup", item: "coconut milk", allergens: [], tips: [] },
    });
  });

  it("converts remove_ingredient", () => {
    expect(flatOpToPatchOp({ op: "remove_ingredient", id: "i3" })).toEqual({ op: "remove_ingredient", id: "i3" });
  });

  it("converts update_step, including a null timer that removes it", () => {
    const op = flatOpToPatchOp({
      op: "update_step",
      id: "s2",
      text: "Whisk the coconut milk with the spices.",
      estMin: 5,
      timer: null,
      ingredientIds: ["i10"],
      applianceIds: [],
    });
    expect(op).toEqual({
      op: "update_step",
      id: "s2",
      text: "Whisk the coconut milk with the spices.",
      estMin: 5,
      timer: null,
      ingredientIds: ["i10"],
      applianceIds: [],
    });
  });

  it("converts insert_step with a timer and defaults after to null", () => {
    const op = flatOpToPatchOp({
      op: "insert_step",
      step: {
        id: "s9",
        text: "Press the tofu between towels for 15 minutes.",
        estMin: 15,
        ingredientIds: [],
        applianceIds: [],
        timer: { min: 15, max: 15 },
      },
    });
    expect(op).toEqual({
      op: "insert_step",
      after: null,
      step: {
        id: "s9",
        text: "Press the tofu between towels for 15 minutes.",
        ingredientIds: [],
        applianceIds: [],
        estMin: 15,
        timer: { min: 15, max: 15 },
        tips: [],
      },
    });
  });

  it("converts remove_step", () => {
    expect(flatOpToPatchOp({ op: "remove_step", id: "s4" })).toEqual({ op: "remove_step", id: "s4" });
  });

  it("converts add_appliance and fills tips", () => {
    expect(
      flatOpToPatchOp({ op: "add_appliance", appliance: { id: "a4", name: "Whisk" } }),
    ).toEqual({ op: "add_appliance", appliance: { id: "a4", name: "Whisk", tips: [] } });
  });

  it("converts remove_appliance", () => {
    expect(flatOpToPatchOp({ op: "remove_appliance", id: "a2" })).toEqual({ op: "remove_appliance", id: "a2" });
  });

  it("converts add_tip with its target and text", () => {
    const target = { kind: "ingredient" as const, id: "i9", selectedText: "heavy cream" };
    expect(flatOpToPatchOp({ op: "add_tip", target, text: "Coconut milk splits if it boils." })).toEqual({
      op: "add_tip",
      target,
      text: "Coconut milk splits if it boils.",
    });
  });

  it.each<[string, FlatEditOp]>([
    ["update_ingredient without id", { op: "update_ingredient", item: "x" }],
    ["add_ingredient without ingredient", { op: "add_ingredient", after: null }],
    ["remove_ingredient without id", { op: "remove_ingredient" }],
    ["update_step without id", { op: "update_step", text: "x" }],
    ["insert_step without step", { op: "insert_step", after: null }],
    ["remove_step without id", { op: "remove_step" }],
    ["add_appliance without appliance", { op: "add_appliance" }],
    ["remove_appliance without id", { op: "remove_appliance" }],
    ["add_tip without text", { op: "add_tip", target: { kind: "step", id: "s1" } }],
    ["add_tip without target", { op: "add_tip", text: "Tip." }],
  ])("rejects %s", (_name, op) => {
    expect(() => flatOpToPatchOp(op)).toThrow(FlatOpError);
  });

  it("rejects bad values that the PatchOp schema forbids", () => {
    expect(() => flatOpToPatchOp({ op: "add_ingredient", after: null, ingredient: { ...coconut, qty: 0 } })).toThrow(
      FlatOpError,
    );
    expect(() =>
      flatOpToPatchOp({
        op: "insert_step",
        after: null,
        step: { id: "s9", text: "Wait.", estMin: 5, ingredientIds: [], applianceIds: [], timer: { min: 9, max: 3 } },
      }),
    ).toThrow(FlatOpError);
    expect(() => flatOpToPatchOp({ op: "remove_ingredient", id: "x3" })).toThrow(FlatOpError);
    expect(() => flatOpToPatchOp({ op: "remove_step", id: "i3" })).toThrow(FlatOpError);
  });

  it("rejects an op name outside the flat enum at the Gemini schema level", () => {
    expect(FlatEditOpSchema.safeParse({ op: "replace_everything" }).success).toBe(false);
  });
});

describe("flatResultToDraft", () => {
  it("converts every op in a patch and keeps the meta", () => {
    const result = flatResultToDraft({
      kind: "patch",
      summary: "Swapped heavy cream for coconut milk",
      ops: [
        { op: "update_ingredient", id: "i9", item: "coconut milk" },
        { op: "remove_step", id: "s7" },
      ],
      meta: { times: { totalMin: 50, activeMin: 25 } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.ops).toEqual([
      { op: "update_ingredient", id: "i9", item: "coconut milk" },
      { op: "remove_step", id: "s7" },
    ]);
    expect(result.draft.meta).toEqual({ times: { totalMin: 50, activeMin: 25 } });
  });

  it("names the failing op by index", () => {
    const result = flatResultToDraft({
      kind: "patch",
      summary: "Change",
      ops: [{ op: "remove_step", id: "s1" }, { op: "remove_step" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/^ops\[1\] remove_step requires "id"/);
  });

  it("leaves ops undefined for non-patch kinds", () => {
    const result = flatResultToDraft({ kind: "answer", text: "Coconut milk is thinner." });
    expect(result).toEqual({ ok: true, draft: { kind: "answer", text: "Coconut milk is thinner.", ops: undefined } });
  });
});

describe("FLAT_EDIT_GEMINI_SCHEMA", () => {
  it("has no oneOf or const, which Gemini handles poorly", () => {
    const text = JSON.stringify(FLAT_EDIT_GEMINI_SCHEMA);
    expect(text).not.toContain('"oneOf"');
    expect(text).not.toContain('"const"');
    expect(text).not.toContain('"$schema"');
  });

  it("lists every op name in the op enum", () => {
    const text = JSON.stringify(FLAT_EDIT_GEMINI_SCHEMA);
    for (const name of ["update_ingredient", "add_ingredient", "remove_ingredient", "update_step", "insert_step", "remove_step", "add_appliance", "remove_appliance", "add_tip"]) {
      expect(text).toContain(`"${name}"`);
    }
  });
});
