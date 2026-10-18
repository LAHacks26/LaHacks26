import { Pencil } from "lucide-react";
import { AllergenBadge, SectionLabel } from "@/components/saffron";
import { Button } from "@/components/ui/button";

export type AllergySummaryCardProps = {
  allergies: string[];
  onEdit: () => void;
};

export function AllergySummaryCard({ allergies, onEdit }: AllergySummaryCardProps) {
  return (
    <section
      aria-labelledby="allergy-summary-heading"
      className="flex flex-col gap-4 rounded-2xl border border-transparent bg-card p-5 shadow-border sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex flex-col gap-3">
        <SectionLabel as="h2" className="text-[11px]">
          <span id="allergy-summary-heading">Your allergies</span>
        </SectionLabel>
        {allergies.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {allergies.map((allergen) => (
              <li key={allergen}>
                <AllergenBadge allergen={allergen} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">None set</p>
        )}
      </div>

      <Button variant="outline" size="lg" className="h-11 ps-2 self-start bg-background sm:self-auto" onClick={onEdit}>
        <Pencil aria-hidden="true" />
        Edit
      </Button>
    </section>
  );
}
