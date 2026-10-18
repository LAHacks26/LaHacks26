import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SignInPrompt() {
  return (
    <section
      aria-labelledby="sign-in-prompt-heading"
      className="flex flex-col items-start gap-5 rounded-2xl border border-dashed border-border bg-card p-6 sm:p-8"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="sign-in-prompt-heading" className="font-display text-xl font-semibold text-ink">
          Sign in with Google to save recipes
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Changes stay on this device until you sign in, then they move into your kitchen.
        </p>
      </div>
      <Button variant="outline" size="lg" className="h-11 ps-2 bg-background">
        <LogIn aria-hidden="true" />
        Sign in with Google
      </Button>
    </section>
  );
}
