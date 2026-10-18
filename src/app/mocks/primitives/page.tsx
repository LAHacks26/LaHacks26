"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Chip } from "@/components/saffron/Chip";
import { Meter } from "@/components/saffron/Meter";
import { AllergenBadge } from "@/components/saffron/AllergenBadge";
import { SectionLabel } from "@/components/saffron/SectionLabel";
import { TimerChip } from "@/components/saffron/TimerChip";
import { LogoMark } from "@/components/saffron/LogoMark";

// Client page so the interactive Chip demo can pass a real onClick handler.
export default function PrimitivesPage() {
  const [clicks, setClicks] = useState(0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-10 sm:py-14">
      <header>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Primitives
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Shared Saffron building blocks in every variant. Hover the meters for
          the tooltip.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <SectionLabel>Chip · variants</SectionLabel>
        <div className="flex flex-wrap items-center gap-3">
          <Chip>Default</Chip>
          <Chip variant="selected">Selected</Chip>
          <Chip variant="sage">Sage</Chip>
          <Chip variant="danger">Danger</Chip>
        </div>
        <SectionLabel>Chip · sizes and icons</SectionLabel>
        <div className="flex flex-wrap items-center gap-3">
          <Chip size="sm">Small</Chip>
          <Chip size="md">Medium</Chip>
          <Chip variant="selected" size="sm" icon={<Check />}>
            With icon
          </Chip>
        </div>
        <SectionLabel>Chip · clickable (onClick renders a button)</SectionLabel>
        <div className="flex flex-wrap items-center gap-3">
          <Chip variant="selected" onClick={() => setClicks((n) => n + 1)}>
            Substitute: Greek yogurt
          </Chip>
          <Chip size="sm" onClick={() => setClicks((n) => n + 1)}>
            Vegan
          </Chip>
          <span className="text-sm text-muted-foreground">Clicks: {clicks}</span>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionLabel>Meter</SectionLabel>
        <div className="flex flex-col gap-5">
          <Meter label="Difficulty" score={2} reason="Mostly simple steps, one tricky sear." />
          <Meter label="Cleanup" score={3} reason="Three pans and a blender."
            detail={<span>2 pans · 1 pot · blender</span>} />
          <Meter label="Cleanup" score={5} detail={<span>No reason set: detail shows inline.</span>} />
          <Meter label="Difficulty" score={0} />
          <Meter label="Difficulty" score={5} reason="Needs a thermometer and a long rest." />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionLabel>Allergen badge</SectionLabel>
        <div className="flex flex-wrap items-center gap-3">
          <AllergenBadge allergen="Contains dairy" />
          <AllergenBadge allergen="Peanuts" />
          <AllergenBadge allergen="Gluten" />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionLabel>Section label</SectionLabel>
        <SectionLabel as="h3">Ingredients (h3)</SectionLabel>
        <SectionLabel as="h4">Appliances (h4)</SectionLabel>
      </section>

      <section className="flex flex-col gap-4">
        <SectionLabel>Timer chip</SectionLabel>
        <div className="flex flex-wrap items-center gap-3">
          <TimerChip label="30 min" state="idle" />
          <TimerChip label="8:42 left" state="running" />
          <TimerChip label="Done" state="done" />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionLabel>Logo mark</SectionLabel>
        <div className="flex flex-wrap items-end gap-8">
          <LogoMark size="sm" />
          <LogoMark size="lg" />
        </div>
      </section>
    </div>
  );
}
