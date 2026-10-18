import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getSharedRecipe } from "@/lib/saved/repository";
import { AppHeader } from "@/components/shell/AppHeader";
import { RecipeEditor } from "@/components/recipe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your recipe copy · Saffron", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function ForkPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ draft?: string | string[] }>;
}) {
  const shared = await getSharedRecipe((await params).slug);
  if (!shared) notFound();
  const parsed = z.uuid().safeParse((await searchParams).draft);
  const draft = parsed.success ? parsed.data : randomUUID();
  return <div className="flex min-h-dvh flex-1 flex-col"><AppHeader /><main className="flex-1">
    <p className="mx-auto max-w-5xl px-6 pt-5 text-sm text-muted-foreground">Your own unsaved copy. Changes here leave the shared recipe unchanged.</p>
    <RecipeEditor recipe={shared.recipe} forkedFromSlug={shared.slug} draftKey={`fork:${shared.slug}:${draft}`} />
  </main></div>;
}
