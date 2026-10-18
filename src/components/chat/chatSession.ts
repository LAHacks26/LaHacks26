import { createRecipeSession } from "../recipe/recipeSession";
import { useRecipeStore } from "@/lib/store/recipeStore";
import { useChatStore } from "@/lib/store/chatStore";
import { requestChat } from "@/lib/api/chatClient";
import { readAllergies } from "@/lib/allergies";
import { editTargetProblem } from "@/lib/ai/context";

/** One mounted recipe owns its requests and lock; navigation permanently invalidates it. */
export function createChatSession(recipeKey: string) {
  const session = createRecipeSession(recipeKey);
  return {
    dispose: session.dispose,
    async send(text: string, retry = false) {
      const chat = useChatStore.getState();
      if (chat.recipeKey !== recipeKey || chat.busy || !text.trim() || text.length > 2000 || !session.beginEdit(null)) return;
      chat.setBusy(true);
      chat.setError(null);
      if (!retry) chat.append({ role: "user", content: text.trim(), contextRefs: chat.chips.map(({ ref }) => ref) });
      const messages = useChatStore.getState().messages.slice(-20).map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const copy = session.currentCopy();
          if (!copy || !session.ownsEdit()) return;
          const contextRefs = chat.chips.map(({ ref }) => ref).filter((ref) => !editTargetProblem(copy.recipe, "ask", ref));
          const response = await requestChat({ recipe: copy.recipe, baseVersion: copy.version, messages, contextRefs, allergies: readAllergies() }, session.signal);
          if (!session.ownsEdit()) return;
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
          return;
        }
      } catch (error) {
        if (session.currentCopy()) useChatStore.getState().setError(error instanceof Error ? error.message : "Couldn't send. Try again.");
      } finally {
        session.finishEdit();
        if (session.currentCopy()) useChatStore.getState().setBusy(false);
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
