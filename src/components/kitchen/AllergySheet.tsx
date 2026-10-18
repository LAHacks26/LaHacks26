"use client";

import { useId, useState, type FormEvent } from "react";
import { Chip } from "@/components/saffron";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { COMMON_ALLERGENS } from "@/lib/recipe/schema";
import { MAX_ALLERGIES, MAX_ALLERGY_LENGTH, normalizeAllergies } from "@/lib/allergies";

export type AllergySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Allergen tags currently saved. */
  selected: string[];
  onSave: (allergies: string[]) => void;
};

export function AllergySheet({ open, onOpenChange, selected, onSave }: AllergySheetProps) {
  const [draft, setDraft] = useState<string[]>(() => normalizeAllergies(selected));
  const [other, setOther] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  const [dirty, setDirty] = useState(false);
  const selectedKey = JSON.stringify(normalizeAllergies(selected));
  const [lastSelectedKey, setLastSelectedKey] = useState(selectedKey);
  const otherId = useId();

  // Hydrate a directly opened sheet, but never replace an in-progress draft with a late response.
  if (open !== wasOpen || selectedKey !== lastSelectedKey) {
    setWasOpen(open);
    setLastSelectedKey(selectedKey);
    if (open && (!wasOpen || !dirty)) {
      setDraft(normalizeAllergies(selected));
      setOther("");
      setDirty(false);
    }
  }

  const common: readonly string[] = COMMON_ALLERGENS;
  const custom = draft.filter((allergen) => !common.includes(allergen));

  function toggle(allergen: string) {
    setDirty(true);
    setDraft((prev) =>
      prev.includes(allergen) ? prev.filter((item) => item !== allergen) : normalizeAllergies([...prev, allergen])
    );
  }

  function addOther(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = other.trim().toLowerCase();
    if (!value || value.length > MAX_ALLERGY_LENGTH || draft.length >= MAX_ALLERGIES) return;
    setDirty(true);
    setDraft((prev) => normalizeAllergies([...prev, value]));
    setOther("");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle className="font-display text-xl font-semibold text-ink">Allergies</SheetTitle>
          <SheetDescription>Saffron flags these in red and never suggests them.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-7 overflow-y-auto overscroll-contain p-5">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-sm font-medium text-ink">Common</legend>
            <div className="flex flex-wrap gap-2">
              {COMMON_ALLERGENS.map((allergen) => {
                const on = draft.includes(allergen);
                return (
                  <Chip
                    key={allergen}
                    variant={on ? "danger" : "default"}
                    aria-pressed={on}
                    onClick={() => toggle(allergen)}
                    disabled={!on && draft.length >= MAX_ALLERGIES}
                    className="capitalize"
                  >
                    {allergen}
                  </Chip>
                );
              })}
            </div>
          </fieldset>

          <form onSubmit={addOther} className="flex flex-col gap-3">
            <label htmlFor={otherId} className="text-sm font-medium text-ink">
              Other
            </label>
            <div className="flex gap-2">
              <Input
                id={otherId}
                value={other}
                onChange={(event) => { setDirty(true); setOther(event.target.value); }}
                placeholder="For example, sesame seed"
                autoComplete="off"
                maxLength={MAX_ALLERGY_LENGTH}
                aria-describedby={`${otherId}-limit`}
                className="h-10 text-sm"
              />
              <Button type="submit" variant="outline" className="h-10 bg-background" disabled={!other.trim() || draft.length >= MAX_ALLERGIES}>
                Add
              </Button>
            </div>
            <p id={`${otherId}-limit`} className="text-xs text-muted-foreground">
              {draft.length} of {MAX_ALLERGIES} allergies. Up to {MAX_ALLERGY_LENGTH} characters each. Select a saved allergy to remove it.
            </p>
            {custom.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {custom.map((allergen) => (
                  <Chip
                    key={allergen}
                    variant="danger"
                    aria-pressed
                    onClick={() => toggle(allergen)}
                    className="capitalize"
                  >
                    {allergen}
                  </Chip>
                ))}
              </div>
            ) : null}
          </form>
        </div>

        <SheetFooter className="border-t border-border p-5">
          <Button
            size="lg"
            className="h-11 w-full"
            onClick={() => {
              onSave(normalizeAllergies(draft));
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
