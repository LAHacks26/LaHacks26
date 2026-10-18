import { ChatDemo } from "@/components/chat";
import { chatContextChips, chatMessages } from "@/lib/mocks/chat";

type ChatMockPageProps = {
  searchParams: Promise<{ state?: string }>;
};

const SKELETON_WIDTHS = ["w-full", "w-11/12", "w-5/6", "w-full", "w-2/3", "w-10/12", "w-4/5"];

export default async function ChatMockPage({ searchParams }: ChatMockPageProps) {
  const { state } = await searchParams;
  const closed = state === "closed";
  const typing = state === "typing";

  return (
    <main className="relative min-h-dvh overflow-hidden bg-background">
      {/* Faded recipe behind the panel. Decorative only. */}
      <div aria-hidden="true" className="pointer-events-none mx-auto max-w-2xl px-6 py-12 opacity-40">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">Butter Chicken</h1>
        <p className="mt-2 text-sm text-muted-foreground">Serious Eats · Serves 4</p>
        <div className="mt-8 flex flex-col gap-3">
          {SKELETON_WIDTHS.map((width, index) => (
            <div key={index} className={`h-3.5 ${width} rounded-full bg-muted`} />
          ))}
        </div>
      </div>

      <ChatDemo
        key={state ?? "open"}
        initialOpen={!closed}
        messages={chatMessages}
        contextChips={chatContextChips}
        typing={typing}
      />
    </main>
  );
}
