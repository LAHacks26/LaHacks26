import { notFound } from "next/navigation";
import { getSharedRecipe } from "@/lib/saved/repository";
import { AppHeader } from "@/components/shell/AppHeader";
import { SharedRecipe } from "@/components/recipe/SharedRecipe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared recipe · Saffron", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const shared = await getSharedRecipe((await params).slug);
  if (!shared) notFound();
  return <div className="flex min-h-dvh flex-1 flex-col"><AppHeader /><main className="flex-1">
    <SharedRecipe recipe={shared.recipe} slug={shared.slug} />
  </main></div>;
}
