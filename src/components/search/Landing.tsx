"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/saffron";
import { isRecipeUrl } from "@/lib/mocks/search";
import { ConstraintChips } from "./ConstraintChips";
import { SearchBox } from "./SearchBox";

const EXAMPLES = [
  "butter chicken",
  "something with spinach",
  "15-minute breakfast",
  "weeknight pasta",
];

export function Landing() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [constraints, setConstraints] = useState<string[]>([]);
  const [readyBy, setReadyBy] = useState("19:30");

  function toggleConstraint(label: string) {
    setConstraints((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label]
    );
  }

  function submit() {
    if (!query.trim()) {
      return;
    }
    // A pasted link imports the recipe directly. Otherwise the mock search
    // screen shows its fixture results.
    router.push(
      isRecipeUrl(query) ? "/mocks/recipe" : "/mocks/search?state=running"
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8 px-4 py-16 text-center sm:py-24">
      <div className="flex flex-col items-center gap-3">
        <h1 className="font-display text-[2rem] leading-tight font-semibold tracking-tight text-ink sm:text-[2.75rem]">
          What do you want to cook?
        </h1>
        <p className="text-muted-foreground">
          Find a recipe, then click any line to ask, swap or adapt it.
        </p>
      </div>

      <div className="w-full">
        <SearchBox value={query} onChange={setQuery} onSubmit={submit} />
      </div>

      <ConstraintChips
        selected={constraints}
        onToggle={toggleConstraint}
        readyBy={readyBy}
        onReadyByChange={setReadyBy}
      />

      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-sm text-muted-foreground">Try:</span>
        {EXAMPLES.map((example) => (
          <Chip
            key={example}
            size="sm"
            onClick={() => setQuery(example)}
          >
            {example}
          </Chip>
        ))}
      </div>
    </section>
  );
}
