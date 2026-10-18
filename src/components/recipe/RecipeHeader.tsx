import type { Recipe } from "@/lib/recipe/schema";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type RecipeHeaderProps = {
  recipe: Recipe;
  mode: "edit" | "readOnly";
  actions?: ReactNode;
};

export function RecipeHeader({ recipe, mode, actions }: RecipeHeaderProps) {
  const { title, source } = recipe;
  const readOnly = mode === "readOnly";

  return (
    <header className="flex flex-col gap-4">
      {readOnly ? (
        <p className="inline-flex w-fit items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Shared recipe · read-only
        </p>
      ) : null}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="font-display text-[30px] leading-[1.15] font-semibold tracking-tight text-foreground sm:text-[40px]">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            from {source.siteName}
            {source.author ? <> · {source.author}</> : null}
            {" · "}
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm font-medium text-saffron-ink underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              original ↗
            </a>
          </p>
        </div>

        <div className="flex flex-wrap gap-2 sm:shrink-0">
          {actions ?? (readOnly ? (
            <>
              <Button variant="outline" size="lg">
                Start cooking
              </Button>
              <Button size="lg">Make it mine</Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="lg">
                Save
              </Button>
              <Button variant="outline" size="lg">
                Share
              </Button>
              <Button size="lg">Start cooking</Button>
            </>
          ))}
        </div>
      </div>
    </header>
  );
}
