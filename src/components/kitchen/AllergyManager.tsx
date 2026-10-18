"use client";

import { useState } from "react";
import { AllergySheet } from "./AllergySheet";
import { AllergySummaryCard } from "./AllergySummaryCard";

export type AllergyManagerProps = {
  initialAllergies: string[];
  /** Whether the allergy sheet starts open (used by the mock preview). */
  initialOpen?: boolean;
};

// Client wrapper: the summary card opens the sheet, and Save updates the card.
export function AllergyManager({ initialAllergies, initialOpen = false }: AllergyManagerProps) {
  const [allergies, setAllergies] = useState(initialAllergies);
  const [open, setOpen] = useState(initialOpen);

  return (
    <>
      <AllergySummaryCard allergies={allergies} onEdit={() => setOpen(true)} />
      <AllergySheet
        open={open}
        onOpenChange={setOpen}
        selected={allergies}
        onSave={setAllergies}
      />
    </>
  );
}
