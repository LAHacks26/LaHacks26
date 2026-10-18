import type { ChatMessage, ContextChip } from "@/components/chat";

// Mock conversation for /mocks/chat.
export const chatMessages: ChatMessage[] = [
  { id: "m1", role: "user", text: "How do I know it's charred enough?" },
  {
    id: "m2",
    role: "assistant",
    text: "Look for deep brown spots, not black ones. Cut the thickest piece open: it should be opaque all the way through, and read 165°F (74°C) if you have a thermometer.",
  },
  { id: "m3", role: "user", text: "Make it dairy-free" },
  {
    id: "m4",
    role: "assistant",
    text: "Done. Coconut milk replaces the cream, olive oil replaces the butter, and coconut yogurt goes in the marinade.",
    attachment: { kind: "edit", summary: "Swapped 3 ingredients · 4 lines changed" },
  },
  { id: "m5", role: "user", text: "Can this be ready in 10 minutes?" },
  {
    id: "m6",
    role: "assistant",
    text: "Not safely with raw chicken.",
    attachment: {
      kind: "impossible",
      reason: "Raw chicken needs about 20 minutes to be safe.",
      suggestedSearch: "10-minute chicken curry with rotisserie chicken",
    },
  },
];

// Attached recipe lines shown above the chat input.
export const chatContextChips: ContextChip[] = [
  { id: "c1", label: "Step 4 · until charred" },
  { id: "c2", label: "1 cup heavy cream" },
];
