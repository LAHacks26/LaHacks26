import Link from "next/link";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/shell/AppHeader";

export default function MocksLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <p className="bg-saffron-soft px-4 py-1.5 text-center text-xs text-saffron-ink">
        Mock screens · fixture data ·{" "}
        <Link
          href="/mocks"
          className="font-medium underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          ← all mocks
        </Link>
      </p>
      <AppHeader homeHref="/mocks/landing" kitchenHref="/mocks/kitchen" />
      <main className="flex-1">{children}</main>
    </div>
  );
}
