import { runVoiceTurn } from "@/lib/ai/voice";
import { VoiceTurnRequestSchema } from "@/lib/voice/types";
import { aiErrorResponse, failure, readJsonBody, rateLimited } from "@/app/api/ai/shared";

// POST /api/voice/turn {context, transcript, history} → {say, toolCalls} (PRD §9, §11).

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const limited = rateLimited(request);
  if (limited) return limited;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = VoiceTurnRequestSchema.safeParse(body.value);
  if (!parsed.success) return failure(400, "That request isn't valid.");

  try {
    return Response.json(await runVoiceTurn(parsed.data));
  } catch (err) {
    return aiErrorResponse(err, "voice-turn");
  }
}
