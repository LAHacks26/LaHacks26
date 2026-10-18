import Link from "next/link";
import { CookModeView, type WakeState } from "@/components/cook";
import { Chip } from "@/components/saffron";
import { WAKE_PREVIEW_STATES, cookMock } from "@/lib/mocks/cook";

type CookMockPageProps = {
  searchParams: Promise<{ voice?: string }>;
};

export default async function CookMockPage({ searchParams }: CookMockPageProps) {
  const { voice } = await searchParams;
  const active: WakeState = WAKE_PREVIEW_STATES.find((state) => state === voice) ?? "armed";

  return (
    <main className="min-h-dvh bg-background">
      <nav
        aria-label="Preview wake word states"
        className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 pt-4 sm:px-6"
      >
        <span className="mr-1 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Preview
        </span>
        {WAKE_PREVIEW_STATES.map((state) => (
          <Link
            key={state}
            href={`/mocks/cook?voice=${state}`}
            aria-current={state === active ? "true" : undefined}
            className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Chip variant={state === active ? "selected" : "default"} size="sm">
              {state}
            </Chip>
          </Link>
        ))}
      </nav>

      <CookModeView
        key={active}
        recipe={cookMock.recipe}
        initialStepId={cookMock.initialStepId}
        initialVoice={active}
        initialTimers={cookMock.timers}
        transcript={cookMock.transcript}
      />
    </main>
  );
}
