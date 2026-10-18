import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { assertSameOrigin, readSavedBody, savedError, savedJson } from "@/lib/saved/http";
import { shareSavedRecipe } from "@/lib/saved/repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) return savedJson({ error: "That recipe wasn't found." }, 404);
    if (request.body) await readSavedBody(request, z.object({}).strict());
    const slug = await shareSavedRecipe(viewer.id, (await params).id);
    return slug ? savedJson({ slug }) : savedJson({ error: "That recipe wasn't found." }, 404);
  } catch (error) { return savedError(error); }
}
