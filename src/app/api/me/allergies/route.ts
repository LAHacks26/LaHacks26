import { attachViewerCookie, getOrCreateViewer } from "@/lib/auth/viewer";
import { assertSameOrigin, readSavedBody, savedError, savedJson } from "@/lib/saved/http";
import { updateViewerAllergies } from "@/lib/saved/repository";
import { UpdateAllergiesSchema } from "@/lib/saved/validation";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const { allergies } = await readSavedBody(request, UpdateAllergiesSchema);
    const identity = await getOrCreateViewer();
    return attachViewerCookie(savedJson({ allergies: await updateViewerAllergies(identity.viewer.id, allergies) }), identity);
  } catch (error) { return savedError(error); }
}
