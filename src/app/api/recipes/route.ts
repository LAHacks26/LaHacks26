import { attachViewerCookie, getOrCreateViewer, getViewer } from "@/lib/auth/viewer";
import { assertSameOrigin, readSavedBody, savedError, savedJson } from "@/lib/saved/http";
import { createSavedRecipe, listSavedRecipes } from "@/lib/saved/repository";
import { CreateSavedSchema } from "@/lib/saved/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const viewer = await getViewer();
    return savedJson({ recipes: viewer ? await listSavedRecipes(viewer.id) : [], allergies: viewer?.allergies ?? [] });
  } catch (error) { return savedError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await readSavedBody(request, CreateSavedSchema);
    const identity = await getOrCreateViewer();
    const saved = await createSavedRecipe(identity.viewer.id, input);
    return attachViewerCookie(savedJson(saved, 201), identity);
  } catch (error) { return savedError(error); }
}
