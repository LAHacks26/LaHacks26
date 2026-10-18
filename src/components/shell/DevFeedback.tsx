"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// Agentation click-to-comment toolbar, synced to Claude Code via the agentation MCP
// server. NODE_ENV is inlined at build time, so production bundles drop the import.
const Agentation: ComponentType<{ endpoint: string }> =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("agentation").then((m) => m.Agentation), { ssr: false })
    : () => null;

export function DevFeedback() {
  return <Agentation endpoint="http://localhost:4747" />;
}
