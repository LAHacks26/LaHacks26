"use client";

import { useState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SearchErrorProps = {
  /** One line on why the agent stopped, or what to do next for a dead end. */
  message: string;
  /** Heading. Defaults to "The agent hit a snag." */
  title?: string;
  /**
   * True (default) shows Retry and the paste-a-link field. False is a dead end (expired search,
   * no matches, not food): it only links back to search.
   */
  recoverable?: boolean;
  /** Runs the same search again. Retry stays inert when this is omitted. */
  onRetry?: () => void;
  /** Imports the pasted link. The field stays inert when this is omitted. */
  onPasteLink?: (url: string) => void;
  /** An action is running. Disables Retry and Import. */
  busy?: boolean;
  /** Why the last Retry or import failed. Shown under the actions. */
  actionError?: string | null;
  /** Where the dead-end link goes. */
  homeHref?: string;
  /** Whether cached results are on screen. The "still work" note only shows when they are. Defaults to true (mock). */
  hasCached?: boolean;
};

export function SearchError({
  message,
  title = "The agent hit a snag.",
  recoverable = true,
  onRetry,
  onPasteLink,
  busy = false,
  actionError = null,
  homeHref = "/",
  hasCached = true,
}: SearchErrorProps) {
  const [link, setLink] = useState("");

  function submitLink() {
    const trimmed = link.trim();
    if (!trimmed || busy || !onPasteLink) {
      return;
    }
    onPasteLink(trimmed);
  }

  return (
    <section
      aria-labelledby="search-error-heading"
      className="mx-auto w-full max-w-xl rounded-2xl border border-transparent bg-card p-6 shadow-border sm:p-8"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tomato-soft text-tomato-ink"
        >
          <TriangleAlert className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id="search-error-heading"
            className="font-display text-xl font-semibold tracking-tight text-ink"
          >
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>

      {recoverable ? (
        <div className="mt-6 flex flex-col gap-6">
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={onRetry}
          >
            Retry
          </Button>

          <form
            noValidate
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submitLink();
            }}
          >
            <label htmlFor="paste-recipe-link" className="text-sm font-medium text-ink">
              Paste a recipe link instead
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="paste-recipe-link"
                type="url"
                inputMode="url"
                placeholder="https://"
                autoComplete="off"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                disabled={busy}
                className="h-10 flex-1"
              />
              <Button
                type="submit"
                variant="outline"
                size="lg"
                disabled={busy || (onPasteLink !== undefined && !link.trim())}
              >
                {busy ? "Importing…" : "Import"}
              </Button>
            </div>
          </form>

          {actionError ? (
            <p role="alert" className="text-sm font-medium text-tomato-ink">
              {actionError}
            </p>
          ) : null}

          {hasCached ? (
            <p className="text-xs text-muted-foreground">Your cached results above still work.</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href={homeHref}
            className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
          >
            Back to search
          </Link>
        </div>
      )}
    </section>
  );
}
