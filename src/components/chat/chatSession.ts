import { createRecipeSession } from "../recipe/recipeSession";
import { useRecipeStore } from "@/lib/store/recipeStore";
import { useChatStore } from "@/lib/store/chatStore";
import { requestChat } from "@/lib/api/chatClient";
import { readAllergies } from "@/lib/allergies";
import { editTargetProblem } from "@/lib/ai/context";

/** What a send did. Voice speaks it; the chat panel shows the same thing from the store. */
export type ChatSendOutcome =
  | { ok: true; reply: string; summary?: string }
  | { ok: false; reason: "busy" | "failed" | "gone" };

/** The send that set chatStore.busy. Only it may clear busy, even after its session was disposed. */
let busyOwner: object | null = null;

/** One mounted recipe owns its requests and lock; navigation permanently invalidates it. */
export function createChatSession(recipeKey: string) {
  const session = createRecipeSession(recipeKey);
  return {
    dispose: session.dispose,
    async send(text: string, retry = false): Promise<ChatSendOutcome> {
      const chat = useChatStore.getState();
      if (chat.recipeKey !== recipeKey || !text.trim() || text.length > 2000) return { ok: false, reason: "gone" };
      if (chat.busy || !session.beginEdit(null)) return { ok: false, reason: "busy" };
      const owner = {};
      busyOwner = owner;
      chat.setBusy(true);
      chat.setError(null);
      if (!retry) chat.append({ role: "user", content: text.trim(), contextRefs: chat.chips.map(({ ref }) => ref) });
      const messages = useChatStore.getState().messages.slice(-20).map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const copy = session.currentCopy();
          if (!copy || !session.ownsEdit()) return { ok: false, reason: "gone" };
          const contextRefs = chat.chips.map(({ ref }) => ref).filter((ref) => !editTargetProblem(copy.recipe, "ask", ref));
          const response = await requestChat({ recipe: copy.recipe, baseVersion: copy.version, messages, contextRefs, allergies: readAllergies() }, session.signal);
          if (!session.ownsEdit()) return { ok: false, reason: "gone" };
          if (response.baseVersion !== copy.version || session.currentCopy()?.version !== copy.version) {
            if (attempt === 0) continue;
            throw new Error("The recipe changed. Please try again.");
          }
          const result = response.result;
          let appliedVersion: number | undefined;
          if (result?.kind === "patch") {
            if (useRecipeStore.getState().applyEdit(result, copy.version) !== "applied") throw new Error("Couldn't apply that change. Please try again.");
            appliedVersion = copy.version + 1;
          } else if (result?.kind === "tip" && result.target && result.text) {
            session.saveExplanation(result.target, result.text, copy.version);
          }
          useChatStore.getState().append({ role: "assistant", content: response.reply, result, appliedVersion });
          return { ok: true, reply: response.reply, summary: result?.kind === "patch" ? result.summary : undefined };
        }
        return { ok: false, reason: "failed" };
      } catch (error) {
        if (session.currentCopy()) useChatStore.getState().setError(error instanceof Error ? error.message : "Couldn't send. Try again.");
        return { ok: false, reason: "failed" };
      } finally {
        session.finishEdit();
        // Also after dispose (e.g. End cooking during a voice edit): the editor and its chat stay
        // mounted, so nothing else would clear busy. A newer send (after A → B → A) keeps its own.
        if (busyOwner === owner) {
          busyOwner = null;
          if (useChatStore.getState().recipeKey === recipeKey) useChatStore.getState().setBusy(false);
        }
      }
    },
    undo(messageId: string) {
      const copy = session.currentCopy();
      const message = useChatStore.getState().messages.find((item) => item.id === messageId);
      if (!copy || useRecipeStore.getState().editing || message?.appliedVersion !== copy.version) return false;
      return useRecipeStore.getState().undo();
    },
  };
}
