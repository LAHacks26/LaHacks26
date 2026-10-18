import { runEdit } from "@/lib/ai/edit";
import { EditRequestSchema } from "@/lib/ai/contracts";
import { editTargetProblem } from "@/lib/ai/context";
import { aiErrorResponse, failure, readJsonBody, rateLimited } from "../shared";

// POST /api/ai/edit {recipe, baseVersion, target, action, message?, allergies} → {baseVersion, result} (PRD §9).

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const limited = rateLimited(request);
  if (limited) return limited;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = EditRequestSchema.safeParse(body.value);
  if (!parsed.success) return failure(400, "That request isn't valid.");

  // Checked before any Gemini call: a target that is missing, or the wrong kind for the action.
  const problem = editTargetProblem(parsed.data.recipe, parsed.data.action, parsed.data.target);
  if (problem) return failure(400, problem);

  try {
    const result = await runEdit(parsed.data);
    return Response.json({ baseVersion: parsed.data.baseVersion, result });
  } catch (err) {
    return aiErrorResponse(err, "edit");
  }
}
