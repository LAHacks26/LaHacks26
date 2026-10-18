"use client";

import { ArrowRight, Search } from "lucide-react";
import { isRecipeUrl } from "@/lib/mocks/search";

export type SearchBoxProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function SearchBox({ value, onChange, onSubmit }: SearchBoxProps) {
  const isUrl = isRecipeUrl(value);
  const hintId = "search-box-hint";

  return (
    <form
      role="search"
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex h-14 items-center gap-2 rounded-2xl border-2 border-border bg-card pr-2 pl-4 shadow-md transition-[border-color,box-shadow] focus-within:border-saffron focus-within:ring-4 focus-within:ring-saffron/20">
        <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Dish or recipe link"
          aria-label="Search for a recipe or paste a link"
          aria-describedby={isUrl ? hintId : undefined}
          autoComplete="off"
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted-foreground md:text-lg"
        />
        <kbd className="hidden shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs font-medium text-muted-foreground sm:inline-block">
          Enter
        </kbd>
        <button
          type="submit"
          disabled={!value.trim()}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary ps-4 pe-3.5 text-sm font-semibold text-primary-foreground transition-colors outline-none hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        >
          {isUrl ? "Import recipe" : "Search"}
          <ArrowRight aria-hidden="true" className="size-4" />
        </button>
      </div>
      {isUrl ? (
        <p id={hintId} className="mt-2 text-center text-sm text-muted-foreground">
          We&apos;ll import this page directly. No agent needed.
        </p>
      ) : null}
    </form>
  );
}
