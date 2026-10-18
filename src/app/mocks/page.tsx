import Link from "next/link";
import { SectionLabel } from "@/components/saffron";

type MockEntry = {
  title: string;
  description: string;
  href: string;
};

type MockGroup = {
  label: string;
  mocks: MockEntry[];
};

const groups: MockGroup[] = [
  {
    label: "Find",
    mocks: [
      {
        title: "Landing",
        description: "Logo, one big search box and example queries.",
        href: "/mocks/landing",
      },
      {
        title: "Search: agent browsing",
        description: "Live browser view and step log while the agent works.",
        href: "/mocks/search?state=running",
      },
      {
        title: "Search: 3 candidates",
        description: "Candidate cards after the agent finishes, with cached matches on top.",
        href: "/mocks/search?state=done",
      },
      {
        title: "Search: agent failed",
        description: "\"The agent hit a snag\" with Retry and a paste-a-link field.",
        href: "/mocks/search?state=error",
      },
    ],
  },
  {
    label: "Recipe",
    mocks: [
      {
        title: "Recipe page",
        description: "Single column with stats first, ingredients, appliances and steps.",
        href: "/mocks/recipe",
      },
      {
        title: "Substitute popover",
        description: "Click-to-ask popover with swap chips on heavy cream.",
        href: "/mocks/recipe?state=popover",
      },
      {
        title: "Highlighted phrase",
        description: "A selected phrase narrows the target, with a tip under the line.",
        href: "/mocks/recipe?state=phrase",
      },
      {
        title: "After a swap",
        description: "Patched lines glow and an undo toast appears.",
        href: "/mocks/recipe?state=patched",
      },
      {
        title: "Rejected swap",
        description: "An invalid swap explained, with three valid alternatives.",
        href: "/mocks/recipe?state=rejected",
      },
      {
        title: "I don't have this",
        description: "Missing appliance (Oven) handled with a patch.",
        href: "/mocks/recipe?state=appliance",
      },
      {
        title: "Impossible request",
        description: "Explanation plus a Search instead button.",
        href: "/mocks/recipe?state=impossible",
      },
    ],
  },
  {
    label: "Cook & chat",
    mocks: [
      {
        title: "Chat panel",
        description: "Floating Ask Saffron panel with context chips and transforms.",
        href: "/mocks/chat",
      },
      {
        title: "Cook mode",
        description: "Step focus, timer chips and the sticky timer tray.",
        href: "/mocks/cook",
      },
    ],
  },
  {
    label: "Account",
    mocks: [
      {
        title: "Shared link",
        description: "Read-only shared recipe with Make it mine.",
        href: "/mocks/share",
      },
      {
        title: "My Kitchen",
        description: "Saved recipes grid and the allergy settings.",
        href: "/mocks/kitchen",
      },
    ],
  },
];

function MockCard({ mock }: { mock: MockEntry }) {
  return (
    <Link
      href={mock.href}
      className="group block rounded-2xl border border-transparent bg-card p-5 shadow-border transition-[border-color,box-shadow] duration-150 ease-out outline-none hover:border-saffron hover:shadow-border-hover focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="block font-display text-lg font-semibold tracking-tight text-ink group-hover:text-saffron-ink">
        {mock.title}
      </span>
      <span className="mt-1 block text-sm text-muted-foreground">
        {mock.description}
      </span>
      <span className="mt-3 block font-mono text-xs text-muted-foreground">
        {mock.href}
      </span>
    </Link>
  );
}

export default function MocksIndexPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
      <header className="mb-10">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Saffron UI mocks
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Clickable screens built from the PRD, with fixture data. Use the
          links to jump to a screen or a state.
        </p>
      </header>

      <div className="flex flex-col gap-10">
        {groups.map((group) => (
          <section key={group.label}>
            <SectionLabel as="h2" className="mb-3">
              {group.label}
            </SectionLabel>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {group.mocks.map((mock) => (
                <MockCard key={mock.href} mock={mock} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-12 text-sm text-muted-foreground">
        Shared components:{" "}
        <Link
          href="/mocks/primitives"
          className="font-medium text-saffron-ink underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          primitives gallery
        </Link>
      </p>
    </div>
  );
}
