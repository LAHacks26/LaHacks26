"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RecipeEditor } from "./RecipeEditor";
import { createSavedRecipeLoader } from "./savedRecipeSession";

/** Back/forward can reuse Next's page payload. Check ownership and reload the current revision
 * before enabling an editor, including when a cached page is shown again. */
export function SavedRecipeLoader({ savedId }: { savedId: string }) {
  const [loader] = useState(() => createSavedRecipeLoader(savedId));
  const result = useSyncExternalStore(loader.subscribe, loader.getSnapshot, loader.getSnapshot);
  useEffect(() => {
    void loader.start();
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void loader.start(); };
    window.addEventListener("pageshow", onPageShow);
    return () => { loader.stop(); window.removeEventListener("pageshow", onPageShow); };
  }, [loader]);
  if (result.document) return <RecipeEditor recipe={result.document.copy.recipe} savedDocument={result.document} sourceRecipeId={result.document.copy.sourceRecipeId} />;
  return <section className="mx-auto max-w-lg px-6 py-16 text-center" aria-live="polite">
    <h1 className="font-display text-2xl">{result.error ? "Couldn't open this recipe" : "Loading your saved recipe…"}</h1>
    {result.error && <><p className="my-4 text-sm text-muted-foreground">{result.error} Saves are available only in the browser that owns them.</p>
      <Button onClick={() => void loader.start()}>Retry</Button>{" "}
      <Link href="/kitchen" className="text-sm underline">My Kitchen</Link></>}
  </section>;
}
