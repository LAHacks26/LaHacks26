import { AppHeader } from "@/components/shell/AppHeader";
import { Landing } from "@/components/search";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <AppHeader />
      <main className="flex-1">
        <Landing />
      </main>
    </div>
  );
}
