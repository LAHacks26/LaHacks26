import { suggestSwaps } from "@/lib/ai/swaps";
import { SuggestSwapsRequestSchema } from "@/lib/ai/contracts";
import { aiErrorResponse, failure, readJsonBody, rateLimited } from "../shared";

// POST /api/ai/suggest-swaps {recipe, target, allergies} → {suggestions} (PRD §9).

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const limited = rateLimited(request);
  if (limited) return limited;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = SuggestSwapsRequestSchema.safeParse(body.value);
  if (!parsed.success) return failure(400, "That request isn't valid.");

  try {
    const suggestions = await suggestSwaps(parsed.data);
    return Response.json({ suggestions });
  } catch (err) {
    return aiErrorResponse(err, "suggest-swaps");
  }
}
