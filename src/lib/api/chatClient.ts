import { ChatResponseSchema, type ChatRequest } from "../ai/contracts";
import { postJson } from "./aiClient";

export function requestChat(request: ChatRequest, signal?: AbortSignal) {
  return postJson("/api/ai/chat", request, ChatResponseSchema, signal, 75_000);
}
