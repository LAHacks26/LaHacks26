import Link from "next/link";
import { Chip } from "@/components/saffron";
import {
  AgentStepLog,
  CachedStrip,
  CandidateCard,
  LiveAgentView,
  SearchError,
  SearchSummary,
} from "@/components/search";
import { formatReadyBy, mockSearch } from "@/lib/mocks/search";

type ViewState = "running" | "done" | "error";

const VIEW_STATES: { state: ViewState; label: string }[] = [
  { state: "running", label: "Agent browsing" },
  { state: "done", label: "3 candidates" },
  { state: "error", label: "Agent failed" },
];

export default async function SearchMockPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const { state } = await searchParams;
  const view: ViewState =
    state === "done" || state === "error" ? state : "running";

  const readyByLabel = formatReadyBy(mockSearch.readyBy);
  const width = view === "done" ? "max-w-5xl" : "max-w-3xl";
  // While the agent runs, the live view should be the first thing on screen.
  const running = view === "running";

  return (
    <div
      className={`mx-auto flex w-full ${width} flex-col px-4 ${
        running ? "gap-5 py-5" : "gap-8 py-8 sm:py-12"
      }`}
    >
      <nav aria-label="Mock states" className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Mock state</span>
        {VIEW_STATES.map((item) => (
          <Link
            key={item.state}
            href={`/mocks/search?state=${item.state}`}
            aria-current={view === item.state ? "page" : undefined}
            className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Chip
              size="sm"
              variant={view === item.state ? "selected" : "default"}
            >
              {item.label}
            </Chip>
          </Link>
        ))}
      </nav>

      <SearchSummary
        query={mockSearch.query}
        constraints={mockSearch.constraints}
        readyBy={mockSearch.readyBy}
      />

      <CachedStrip items={mockSearch.cached} compact={running} />

      {view === "running" ? (
        <>
          <LiveAgentView
            currentUrl={mockSearch.liveUrl}
            status={mockSearch.liveStatus}
          />
          <AgentStepLog steps={mockSearch.steps} />
        </>
      ) : null}

      {view === "done" ? (
        <section aria-labelledby="candidates-heading" className="flex flex-col gap-4">
          <h2
            id="candidates-heading"
            className="font-display text-2xl font-semibold tracking-tight text-ink"
          >
            {mockSearch.candidates.length} recipes ready by {readyByLabel}
          </h2>
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {mockSearch.candidates.map((candidate) => (
              <li key={candidate.id} className="flex">
                <CandidateCard
                  title={candidate.title}
                  site={candidate.site}
                  totalMin={candidate.totalMin}
                  difficulty={candidate.difficulty}
                  allergens={candidate.allergens}
                  userAllergies={mockSearch.userAllergies}
                  fitsReadyBy={candidate.fitsReadyBy}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view === "error" ? <SearchError message={mockSearch.errorReason} /> : null}
    </div>
  );
}
