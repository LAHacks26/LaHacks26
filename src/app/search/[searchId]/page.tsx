import type { Metadata } from "next";
import { SearchRun } from "@/components/search/SearchRun";
import { AppHeader } from "@/components/shell/AppHeader";

export const metadata: Metadata = {
  title: "Search · Saffron",
};

type SearchPageProps = {
  params: Promise<{ searchId: string }>;
};

export default async function SearchPage({ params }: SearchPageProps) {
  const { searchId } = await params;

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <AppHeader />
      <main className="flex-1">
        {/* The key resets the run when Retry moves the page to a new searchId. */}
        <SearchRun key={searchId} searchId={searchId} />
      </main>
    </div>
  );
}
