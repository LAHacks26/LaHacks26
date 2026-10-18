import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { getSavedRecipe } from "@/lib/saved/repository";
import { SavedRecipeLoader } from "@/components/recipe/SavedRecipeLoader";
import { AppHeader } from "@/components/shell/AppHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved recipe · Saffron", robots: { index: false, follow: false } };

export default async function SavedRecipePage({ params }: { params: Promise<{ savedId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) notFound();
  const document = await getSavedRecipe(viewer.id, (await params).savedId);
  if (!document) notFound();
  return <div className="flex min-h-dvh flex-1 flex-col"><AppHeader /><main className="flex-1">
    <SavedRecipeLoader key={document.id} savedId={document.id} />
  </main></div>;
}
