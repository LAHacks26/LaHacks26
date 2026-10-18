export default function Home() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="size-3 rounded-full bg-saffron" />
        <span className="font-display text-xl font-semibold tracking-tight">
          Saffron
        </span>
      </div>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        What do you want to cook?
      </h1>
      <p className="text-muted-foreground">Phase 0: scaffold is live.</p>
    </main>
  );
}
