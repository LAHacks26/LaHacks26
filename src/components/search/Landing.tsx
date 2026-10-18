"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Chip } from "@/components/saffron";
import { isRecipeUrl } from "@/lib/mocks/search";
import { readAllergies } from "@/lib/allergies";
import { landingDestination } from "@/lib/search/landing";
import { SEARCH_FALLBACK_ERROR, SearchClientError } from "@/lib/search/client";
import { ConstraintChips } from "./ConstraintChips";
import { SearchBox } from "./SearchBox";
import "./search.css";

/** Reads `?q=` once it changes and hands it up to fill the search box. Rendered inside a Suspense boundary. */
function QueryPrefill({ onPrefill }: { onPrefill: (query: string) => void }) {
  const q = useSearchParams().get("q");
  useEffect(() => {
    if (q?.trim()) onPrefill(q.trim());
  }, [q, onPrefill]);
  return null;
}

const EXAMPLES = [
  "butter chicken",
  "something with spinach",
  "15-minute breakfast",
  "weeknight pasta",
];

// Gemini rewrites the page during an import (8 to 20 s), so the status line cycles.
const IMPORT_STATUS_MESSAGES = [
  "Fetching the page…",
  "Reading ingredients…",
  "Rewriting it cleanly…",
];
const IMPORT_STATUS_INTERVAL_MS = 3000;
const IMPORT_TIMEOUT_MS = 60_000;
const IMPORT_FALLBACK_ERROR = "Couldn't import that page. Try another link.";
const IMPORT_TIMEOUT_ERROR = "That page took too long. Try another link.";

export function Landing() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [constraints, setConstraints] = useState<string[]>([]);
  const [readyBy, setReadyBy] = useState("");
  const [importing, setImporting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [statusIndex, setStatusIndex] = useState(0);
  const importAbort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefill = useCallback((value: string) => setQuery(value), []);

  // Abort a running import when the user leaves the page.
  useEffect(() => {
    return () => importAbort.current?.abort();
  }, []);

  // Once an import fails, the input is enabled again. Put focus back so the user can edit and resubmit.
  useEffect(() => {
    if (importError) {
      inputRef.current?.focus();
    }
  }, [importError]);

  useEffect(() => {
    if (!importing) {
      return;
    }
    // Clamp at the last message instead of wrapping, so the wait never shows stale text.
    const timer = window.setInterval(() => {
      setStatusIndex((index) => Math.min(index + 1, IMPORT_STATUS_MESSAGES.length - 1));
    }, IMPORT_STATUS_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [importing]);

  function toggleConstraint(label: string) {
    setConstraints((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label]
    );
  }

  function changeQuery(value: string) {
    setQuery(value);
    setImportError(null);
  }

  async function submit() {
    if (importAbort.current || !query.trim()) {
      return;
    }
    const isImport = isRecipeUrl(query);

    // One controller covers both the timeout and the unmount abort. The timeout sets
    // `timedOut` first, so the catch block can tell the two apart.
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, isImport ? IMPORT_TIMEOUT_MS : 15_000);
    importAbort.current = controller;
    setImporting(isImport);
    setSearching(!isImport);
    setStatusIndex(0);
    setImportError(null);

    try {
      const href = await landingDestination(
        { query, constraints, readyBy, allergies: readAllergies() },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      // Stay busy until the navigation replaces this screen.
      router.push(href);
    } catch (error) {
      if (timedOut) {
        setImportError(isImport ? IMPORT_TIMEOUT_ERROR : "Starting the search took too long. Try again.");
        setImporting(false);
        setSearching(false);
        importAbort.current = null;
      } else if (!controller.signal.aborted) {
        // Only server messages and the fallback reach the user. Raw JS errors never do.
        setImportError(error instanceof SearchClientError ? error.message : isImport ? IMPORT_FALLBACK_ERROR : SEARCH_FALLBACK_ERROR);
        setImporting(false);
        setSearching(false);
        importAbort.current = null;
      }
      // Otherwise the component unmounted and the abort was intentional: stay silent.
    } finally {
      window.clearTimeout(timer);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8 px-4 py-16 text-center sm:py-24">
      <Suspense fallback={null}>
        <QueryPrefill onPrefill={prefill} />
      </Suspense>
      <div className="flex flex-col items-center gap-3">
        <h1
          className="search-hero-enter font-display text-[2rem] leading-tight font-semibold tracking-tight text-ink sm:text-[2.75rem]"
          style={{ animationDelay: "0ms" }}
        >
          What do you want to cook?
        </h1>
        <p className="search-hero-enter text-muted-foreground" style={{ animationDelay: "100ms" }}>
          Find a recipe, then click any line to ask, swap or adapt it.
        </p>
      </div>

      <div className="search-hero-enter w-full" style={{ animationDelay: "200ms" }}>
        <SearchBox
          value={query}
          onChange={changeQuery}
          onSubmit={submit}
          busy={importing || searching}
          inputRef={inputRef}
        />
        {/* Always mounted so screen readers announce each status change. */}
        <p
          aria-live="polite"
          className={`text-center text-sm ${importing || searching || importError ? "mt-2 min-h-5" : ""}`}
        >
          {importError ? (
            <span role="alert" className="font-medium text-tomato-ink">{importError}</span>
          ) : searching ? (
            <span className="text-muted-foreground">Starting your search…</span>
          ) : importing ? (
            <span
              key={statusIndex}
              className="search-step-enter text-muted-foreground"
            >
              {IMPORT_STATUS_MESSAGES[statusIndex]}
            </span>
          ) : null}
        </p>
      </div>

      <div className="search-hero-enter flex w-full justify-center" style={{ animationDelay: "300ms" }}>
        <ConstraintChips
          selected={constraints}
          onToggle={toggleConstraint}
          readyBy={readyBy}
          onReadyByChange={setReadyBy}
        />
      </div>

      <div
        className="search-hero-enter flex flex-wrap items-center justify-center gap-2"
        style={{ animationDelay: "400ms" }}
      >
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
