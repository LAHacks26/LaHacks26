import { cn } from "@/lib/utils";

export type EditToastProps = {
  summary: string;
  linesChanged: number;
  onUndo?: () => void;
  className?: string;
};

/** Undo toast shown after an edit. Bottom-left, because the chat button sits bottom-right. */
export function EditToast({ summary, linesChanged, onUndo, className }: EditToastProps) {
  return (
    <div
      role="status"
      className={cn(
        "recipe-toast fixed bottom-4 left-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-4 rounded-xl bg-ink px-4 py-3 text-sm text-background shadow-lg",
        className
      )}
    >
      <p className="min-w-0">
        {summary}
        {linesChanged > 0
          ? ` · ${linesChanged} ${linesChanged === 1 ? "line" : "lines"} changed`
          : null}
      </p>
      <button
        type="button"
        onClick={onUndo}
        className="min-h-9 shrink-0 rounded-md px-1 font-semibold text-saffron outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Undo
      </button>
    </div>
  );
}
