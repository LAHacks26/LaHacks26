import { getViewer } from "@/lib/auth/viewer";
import { assertSameOrigin, readSavedBody, savedError, savedJson } from "@/lib/saved/http";
import { getSavedRecipe, updateSavedRecipe } from "@/lib/saved/repository";
import { UpdateSavedSchema } from "@/lib/saved/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const notFound = () => savedJson({ error: "That recipe wasn't found." }, 404);

export async function GET(_request: Request, { params }: Context) {
  try {
    const viewer = await getViewer();
    if (!viewer) return notFound();
    const saved = await getSavedRecipe(viewer.id, (await params).id);
    return saved ? savedJson(saved) : notFound();
  } catch (error) { return savedError(error); }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) return notFound();
    const input = await readSavedBody(request, UpdateSavedSchema);
    const saved = await updateSavedRecipe(viewer.id, (await params).id, input);
    return saved ? savedJson(saved) : notFound();
  } catch (error) { return savedError(error); }
}
