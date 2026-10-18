"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useChatStore } from "@/lib/store/chatStore";
import { useRecipeStore } from "@/lib/store/recipeStore";
import { landingDestination } from "@/lib/search/landing";
import { readAllergies } from "@/lib/allergies";
import { AskSaffronFab } from "../recipe/AskSaffronFab";
import { ChatPanel, type ChatMessage } from "./ChatPanel";
import { createChatSession } from "./chatSession";

export function ChatDock({ recipeKey }: { recipeKey: string }) {
  const chat = useChatStore();
  const editing = useRecipeStore((state) => state.editing);
  const version = useRecipeStore((state) => state.copy?.version);
  const session = useRef<ReturnType<typeof createChatSession> | null>(null);
  const search = useRef<AbortController | null>(null);
  const router = useRouter();
  useEffect(() => {
    useChatStore.getState().load(recipeKey);
    const scope = createChatSession(recipeKey);
    session.current = scope;
    return () => { scope.dispose(); search.current?.abort(); session.current = null; };
  }, [recipeKey]);
  if (chat.recipeKey !== recipeKey) return null;
  const messages: ChatMessage[] = chat.messages.map((message) => ({
    id: message.id, role: message.role, text: message.content,
    attachment: message.result?.kind === "patch" && message.appliedVersion === version
      ? { kind: "edit", summary: message.result.summary ?? "Recipe updated" }
      : message.result?.kind === "impossible"
        ? { kind: "impossible", reason: message.result.reason!, suggestedSearch: message.result.suggestedSearch! } : undefined,
  }));
  async function searchInstead(query: string) {
    search.current?.abort();
    const controller = new AbortController();
    search.current = controller;
    try {
      const href = await landingDestination({ query, readyBy: "", constraints: [], allergies: readAllergies() }, controller.signal);
      if (!controller.signal.aborted) router.push(href);
    } catch { if (!controller.signal.aborted) toast.error("Couldn't start that search. Try again."); }
  }
  return chat.open ? <ChatPanel messages={messages} contextChips={chat.chips}
    onClose={() => chat.setOpen(false)} onRemoveChip={chat.removeChip}
    onSend={(text) => void session.current?.send(text)} typing={chat.busy} busy={Boolean(editing)}
    error={chat.error} onRetry={() => { const last = chat.messages.at(-1); if (last?.role === "user") void session.current?.send(last.content, true); }}
    onUndo={(id) => { session.current?.undo(id); }} onSearch={(query) => void searchInstead(query)} />
    : <AskSaffronFab onClick={() => chat.setOpen(true)} />;
}
