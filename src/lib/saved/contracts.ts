import type { LineRef, Recipe, WorkingCopy } from "../recipe/schema";

/** Persisted text/context only. Edit results and version-specific Undo actions stay in the client. */
export type SavedThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  contextRefs?: LineRef[];
};

export type SavedDocument = {
  id: string;
  copy: WorkingCopy;
  messages: SavedThreadMessage[];
  /** Opaque compare-and-swap token: preserve the full string, including microseconds. */
  updatedAt: string;
  shareSlug: string | null;
};

export type SavedSummary = {
  id: string;
  title: string;
  imageUrl?: string;
  totalMin: number;
  updatedAt: string;
  shareSlug: string | null;
};

/** Deliberately excludes owner IDs, saved IDs, chat, undo history, and the private deadline. */
export type PublicRecipe = { recipe: Recipe; slug: string };
