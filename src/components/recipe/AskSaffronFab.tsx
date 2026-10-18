import { cn } from "@/lib/utils";

export type AskSaffronFabProps = {
  className?: string;
  onClick?: () => void;
};

/** Floating chat button, bottom-right. The chat panel itself lives elsewhere. */
export function AskSaffronFab({ className, onClick }: AskSaffronFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "fixed right-4 bottom-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-background shadow-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
    >
      <span aria-hidden="true" className="size-2 rounded-full bg-saffron" />
      Ask Saffron
    </button>
  );
}
