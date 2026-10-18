import Link from "next/link";
import { AppHeader } from "@/components/shell/AppHeader";

export default function SavedNotFound() {
  return <div className="min-h-dvh"><AppHeader /><main className="mx-auto max-w-lg px-6 py-16 text-center">
    <h1 className="font-display text-3xl">This recipe isn&apos;t available in this browser.</h1>
    <p className="my-4 text-muted-foreground">Check the link and use the browser where you saved it. Clearing cookies loses access to anonymous saves.</p>
    <Link href="/kitchen" className="text-saffron-ink underline">Open My Kitchen</Link>
  </main></div>;
}
