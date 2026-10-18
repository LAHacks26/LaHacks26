import { butterChicken } from "@/lib/recipe/fixtures/butterChicken";
import type { Recipe } from "@/lib/recipe/schema";
import type { VoiceTurn, WakeState } from "@/components/cook";

// Mock data for /mocks/cook. Steps before initialStepId start as done.
export const cookMock: {
  recipe: Recipe;
  initialStepId: string;
  timers: { id: string; label: string; stepId?: string; remainingSec: number }[];
  transcript: VoiceTurn[];
} = {
  recipe: butterChicken,
  initialStepId: "s4",
  timers: [
    { id: "t-broil", label: "Broil", stepId: "s4", remainingSec: 8 * 60 + 42 },
    { id: "t-rice", label: "Rice", remainingSec: 14 * 60 + 10 },
  ],
  transcript: [
    { who: "you", text: "Hey Saffron, I'm out of butter." },
    { who: "saffron", text: "Swapped the butter for olive oil. Step 5 is updated." },
  ],
};

// Wake-word states shown as preview chips on /mocks/cook.
export const WAKE_PREVIEW_STATES: WakeState[] = ["off", "armed", "listening", "thinking", "speaking"];
