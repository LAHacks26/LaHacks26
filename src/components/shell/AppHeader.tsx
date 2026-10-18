import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/saffron";

// Handler props (onAllergiesClick, onSignInClick) only work when AppHeader is
// rendered from a client component. Passing a function from a server component
// fails at render time.
export type AppHeaderProps = {
  /** Where the logo goes. */
  homeHref?: string;
  /** Where "My Kitchen" goes. */
  kitchenHref?: string;
  /** Called when "Allergies" is clicked. Presentational until wired up. */
  onAllergiesClick?: () => void;
  /** Called when "Sign in" is clicked. Presentational until wired up. */
  onSignInClick?: () => void;
  /** Extra controls appended after the built-in ones. */
  right?: ReactNode;
};

const linkClass =
  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

export function AppHeader({
  homeHref = "/",
  kitchenHref = "/kitchen",
  onAllergiesClick,
  onSignInClick,
  right,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-full max-w-5xl items-center justify-between gap-3 px-4">
        <Link
          href={homeHref}
          className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <LogoMark />
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <Link href={kitchenHref} aria-label="My Kitchen" className={linkClass}>
            <BookOpen className="size-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">My Kitchen</span>
          </Link>

          <Button
            variant="ghost"
            size="sm"
            aria-label="Allergies"
            onClick={onAllergiesClick}
            className="gap-1.5 px-2.5"
          >
            <ShieldAlert className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Allergies</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onSignInClick}
            className="px-3"
          >
            Sign in
          </Button>

          {right}
        </nav>
      </div>
    </header>
  );
}
