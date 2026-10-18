"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  importRecipeLink,
  readAllergies,
  SEARCH_FALLBACK_ERROR,
  SearchClientError,
  startSearch,
  subscribeSearch,
} from "@/lib/search/client";
import { formatReadyBy, type AgentStep } from "@/lib/mocks/search";
import type { CandidateCardData } from "@/lib/search/types";
import { recipeHref } from "@/lib/recipe/readyBy";
import { cn } from "@/lib/utils";
import { AgentStepLog } from "./AgentStepLog";
import { CachedStrip, type CachedStripItem } from "./CachedStrip";
import { CandidateCard } from "./CandidateCard";
import { LiveAgentView } from "./LiveAgentView";
import { SearchError } from "./SearchError";
import { SearchSummary } from "./SearchSummary";
import {
  initialSearchRunState,
  rankCandidates,
  readyByClock,
  reduceSearchEvent,
} from "./searchRunState";

const IMPORT_FALLBACK_ERROR = "Couldn't import that page. Try another link.";

/** Runs one search: subscribes to its stream and renders the live view, the cached strip and the cards. */
export function SearchRun({ searchId }: { searchId: string }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reduceSearchEvent, initialSearchRunState);
  // Read on the client only. Nothing allergen-specific is rendered before the first event arrives.
  const [allergies] = useState<string[]>(readAllergies);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const importAbort = useRef<AbortController | null>(null);

  // The key on the page resets this component when the searchId changes (Retry).
  useEffect(() => {
    return subscribeSearch(
      searchId,
      (event) => dispatch(event),
      () => dispatch({ type: "connection_lost" }),
    );
  }, [searchId]);

  // Abort a running import when the user leaves the page.
  useEffect(() => {
    return () => importAbort.current?.abort();
  }, []);

  const { meta, cached, phase, error, steps, liveUrl, agentDone } = state;
  const liveShowing = phase === "running" && !agentDone;
  const cards = useMemo(() => rankCandidates(state, allergies), [state, allergies]);
  // Once the run has ended, a card still without a sourceRecipeId never becomes a link, so it is dropped.
  const shownCards = useMemo(
    () => (phase === "running" ? cards : cards.filter((card) => card.sourceRecipeId !== undefined)),
    [phase, cards],
  );
  const cachedItems: CachedStripItem[] = (cached ?? []).map((item) => ({
    id: item.sourceRecipeId,
    title: item.title,
    site: item.site,
    totalMin: item.totalMin,
    imageUrl: item.imageUrl,
    href: recipeHref(item.sourceRecipeId, meta?.readyBy),
  }));
  const stepItems: AgentStep[] =
    steps.length === 0
      ? [{ text: "Starting the browser…", status: "active" }]
      : steps.map((text, index) => ({
          text,
          status: index === steps.length - 1 ? "active" : "done",
        }));

  // Same search again (PRD §5.2). A new searchId means a new run, so the page remounts.
  async function retry() {
    if (busy) {
      return;
    }
    if (!meta) {
      router.push("/");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const id = await startSearch({
        text: meta.query,
        constraints: meta.constraints,
        readyBy: meta.readyBy,
        allergies: readAllergies(),
      });
      router.replace(`/search/${id}`);
    } catch (caught) {
      setActionError(
        caught instanceof SearchClientError ? caught.message : SEARCH_FALLBACK_ERROR,
      );
      setBusy(false);
    }
  }

  async function pasteLink(url: string) {
    importAbort.current?.abort();
    const controller = new AbortController();
    importAbort.current = controller;
    setBusy(true);
    setActionError(null);
    try {
      const sourceRecipeId = await importRecipeLink(url, controller.signal);
      // Stay busy until the navigation replaces this screen.
      if (controller.signal.aborted) return;
      router.push(recipeHref(sourceRecipeId, meta?.readyBy));
    } catch (caught) {
      if (controller.signal.aborted) {
        return;
      }
      setActionError(
        caught instanceof SearchClientError ? caught.message : IMPORT_FALLBACK_ERROR,
      );
      setBusy(false);
    }
  }

  const wide = !liveShowing && shownCards.length > 0;

  return (
    // reducedMotion="user" drops the transform parts of every animation for people who ask for less motion.
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          "mx-auto flex w-full flex-col px-4",
          wide ? "max-w-5xl" : "max-w-3xl",
          liveShowing ? "gap-5 py-5" : "gap-8 py-8 sm:py-12",
        )}
      >
        {meta ? (
          <SearchSummary
            query={meta.query}
            constraints={meta.constraints}
            readyBy={readyByClock(meta.readyBy)}
            editHref="/"
          />
        ) : (
          <div aria-hidden="true" className="h-10 w-64 max-w-full animate-pulse rounded-xl bg-muted" />
        )}

        {cachedItems.length > 0 ? (
          <CachedStrip items={cachedItems} compact={liveShowing} />
        ) : null}

        <AnimatePresence mode="wait" initial={false}>
          {liveShowing ? (
            <motion.div
              key="live"
              className="flex flex-col gap-5"
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            >
              <LiveAgentView currentUrl={liveUrl} frameUrl={liveUrl} status="browsing" />
              <AgentStepLog steps={stepItems} />
            </motion.div>
          ) : (
            <motion.div
              key="results"
              className="flex flex-col gap-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {phase === "error" && error ? (
                <ErrorPanel
                  code={error.code}
                  message={error.message}
                  onRetry={retry}
                  onPasteLink={pasteLink}
                  busy={busy}
                  actionError={actionError}
                  hasCached={cachedItems.length > 0}
                />
              ) : null}

              {shownCards.length > 0 ? (
                <CandidatesSection
                  cards={shownCards}
                  userAllergies={allergies}
                  readyBy={meta?.readyBy ? formatReadyBy(readyByClock(meta.readyBy)) : null}
                  readyByIso={meta?.readyBy}
                />
              ) : null}

              {phase === "done" && shownCards.length === 0 ? (
                <SearchError
                  title="No recipes fit."
                  message="Try loosening a constraint."
                  recoverable={false}
                />
              ) : null}

              {phase === "running" && cards.length === 0 ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Checking the recipes…
                </p>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

type ErrorPanelProps = {
  code: string;
  message: string;
  onRetry: () => void;
  onPasteLink: (url: string) => void;
  busy: boolean;
  actionError: string | null;
  hasCached: boolean;
};

/** Maps a server error code to its panel. Expired and not-food searches are dead ends; the rest can retry. */
function ErrorPanel({
  code,
  message,
  onRetry,
  onPasteLink,
  busy,
  actionError,
  hasCached,
}: ErrorPanelProps) {
  if (code === "not_found") {
    return (
      <SearchError
        title="This search has expired."
        message="Start a new search to find recipes."
        recoverable={false}
      />
    );
  }
  if (code === "not_food") {
    return <SearchError title="That's not a dish." message={message} recoverable={false} />;
  }
  return (
    <SearchError
      message={message}
      onRetry={onRetry}
      onPasteLink={onPasteLink}
      busy={busy}
      actionError={actionError}
      hasCached={hasCached}
    />
  );
}

type CandidatesSectionProps = {
  readyByIso?: string;
  cards: CandidateCardData[];
  userAllergies: string[];
  /** Formatted ready-by time, or null when the search had none. */
  readyBy: string | null;
};

function CandidatesSection({ cards, userAllergies, readyBy, readyByIso }: CandidatesSectionProps) {
  const count = cards.length;
  const noun = count === 1 ? "recipe" : "recipes";
  const heading = readyBy ? `${count} ${noun} ready by ${readyBy}` : `${count} ${noun} found`;

  return (
    <section aria-labelledby="candidates-heading" className="flex flex-col gap-4">
      <h2
        id="candidates-heading"
        className="font-display text-2xl font-semibold tracking-tight text-ink"
      >
        {heading}
      </h2>
      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AnimatePresence initial={false}>
          {cards.map((card, index) => {
            const ready = card.sourceRecipeId !== undefined;
            return (
              <motion.li
                key={card.url}
                layout
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="flex"
              >
                <CandidateCard
                  title={card.title}
                  site={card.site}
                  totalMin={card.totalMin}
                  difficulty={card.difficulty}
                  allergens={card.allergens}
                  userAllergies={userAllergies}
                  fitsReadyBy={card.fitsReadyBy}
                  entranceIndex={index}
                  imageUrl={card.imageUrl}
                  pending={!ready}
                  href={ready ? recipeHref(card.sourceRecipeId!, readyByIso) : undefined}
                />
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}
