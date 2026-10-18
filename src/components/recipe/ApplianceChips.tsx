import type { ReactElement, ReactNode } from "react";
import { Chip } from "@/components/saffron";
import type { Appliance } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";
import { TipBlock } from "./TipBlock";

export type ApplianceChipsProps = {
  appliances: Appliance[];
  selectedId?: string;
  glowIds?: string[];
  /** Changes on every edit, so the same chips glow again. */
  glowKey?: number;
  /** The chip an edit is running on. It shimmers. */
  editingId?: string;
  /** Tip IDs that start expanded. */
  openTipIds?: string[];
  onSelect?: (id: string) => void;
  /** Wraps each chip (for example in a LinePopover). The chip is passed in as a real button. */
  renderLine?: (id: string, row: ReactElement) => ReactNode;
};

export function ApplianceChips({
  appliances,
  selectedId,
  glowIds = [],
  glowKey,
  editingId,
  openTipIds = [],
  onSelect,
  renderLine,
}: ApplianceChipsProps) {
  const interactive = Boolean(onSelect || renderLine);
  const glowing = new Set(glowIds);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {appliances.map((appliance) => {
          const selected = appliance.id === selectedId;
          const glow = glowing.has(appliance.id);
          const editing = appliance.id === editingId;
          // Keyed by glowKey on the chip itself, so a new edit restarts the fade on the same chip.
          const chip = (
            <Chip
              key={glow ? glowKey : undefined}
              variant={selected ? "selected" : "default"}
              size="md"
              className={cn(
                interactive && "cursor-pointer hover:border-saffron",
                glow && "recipe-glow",
                editing && "recipe-editing"
              )}
            >
              {appliance.name}
            </Chip>
          );
          const row = interactive ? (
            <button
              type="button"
              onClick={onSelect ? () => onSelect(appliance.id) : undefined}
              data-line-id={appliance.id}
              data-selected={selected || undefined}
              className="max-w-full rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {chip}
            </button>
          ) : (
            <div data-line-id={appliance.id} data-selected={selected || undefined} className="max-w-full">
              {chip}
            </div>
          );
          return (
            <span key={appliance.id} className="inline-flex max-w-full flex-col">
              {renderLine ? renderLine(appliance.id, row) : row}
            </span>
          );
        })}
      </div>
      {appliances.flatMap((appliance) =>
        appliance.tips.map((tip) => (
          <TipBlock
            key={tip.id}
            tip={tip}
            defaultOpen={openTipIds.includes(tip.id)}
            className="ml-0"
          />
        ))
      )}
    </div>
  );
}
