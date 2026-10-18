import { ChatRequestSchema } from "@/lib/ai/contracts";
import { editTargetProblem } from "@/lib/ai/context";
import { runChat } from "@/lib/ai/chat";
import { aiErrorResponse, failure, readJsonBody, rateLimited } from "../shared";

export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  const limited = rateLimited(request);
  if (limited) return limited;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = ChatRequestSchema.safeParse(body.value);
  if (!parsed.success) return failure(400, "That request isn't valid.");
  for (const ref of parsed.data.contextRefs) {
    const problem = editTargetProblem(parsed.data.recipe, "ask", ref);
    if (problem) return failure(400, problem);
  }
  try {
    return Response.json(await runChat(parsed.data));
  } catch (error) {
    return aiErrorResponse(error, "chat");
  }
}
