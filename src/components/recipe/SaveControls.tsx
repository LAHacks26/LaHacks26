"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { SavedDocument } from "@/lib/saved/contracts";
import { createSaveSession, type SaveState } from "./saveSession";
import { clearSavedDraft } from "@/lib/store/savedDraft";

type Props = { recipeKey: string; sourceRecipeId?: string; forkedFromSlug?: string; initial?: SavedDocument; onStartCooking?: () => void };

export function SaveControls(props: Props) {
  const router = useRouter();
  const session = useRef<ReturnType<typeof createSaveSession> | null>(null);
  const [state, setState] = useState<SaveState>({ status: props.initial ? "saved" : "unsaved", id: props.initial?.id });
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const scope = createSaveSession({ ...props, onChange: setState });
    session.current = scope;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (scope.dirty()) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { scope.dispose(); session.current = null; window.removeEventListener("beforeunload", beforeUnload); };
    // The parent keys the editor by saved ID / draft. Server refreshes must not reset an active save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.recipeKey]);

  async function save(asNew = false) {
    const scope = session.current;
    if (!scope || busy) return;
    setBusy(true);
    const id = await (asNew ? scope.saveAsNew() : scope.flush());
    if (scope !== session.current) return;
    if (id && id !== props.initial?.id) router.replace(`/my/${id}`);
    setBusy(false);
  }
  async function share() {
    const scope = session.current;
    if (!scope || busy) return;
    setBusy(true);
    const slug = await scope.share();
    if (scope !== session.current) return;
    if (slug) {
      const url = `${window.location.origin}/s/${encodeURIComponent(slug)}`;
      setShareUrl(url);
      setCopied(false);
      try { await navigator.clipboard.writeText(url); if (scope === session.current) setCopied(true); } catch { /* The selectable link below works without clipboard permission. */ }
    }
    if (scope === session.current) setBusy(false);
  }

  return <div className="flex max-w-sm flex-col gap-2">
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="lg" disabled={busy || state.status === "saving"} onClick={() => void save()}>
        {state.status === "saving" ? "Saving…" : state.id ? "Save now" : "Save"}
      </Button>
      <Button variant="outline" size="lg" disabled={busy || state.status === "saving"} onClick={() => void share()}>Share</Button>
      <Button size="lg" disabled={!props.onStartCooking} onClick={props.onStartCooking}>Start cooking</Button>
    </div>
    <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
      {state.status === "saved" ? "Saved in this browser's kitchen." : state.status === "pending" ? "Unsaved changes · autosaving shortly…" : state.status === "saving" ? "Saving recipe and chat…" : state.status === "error" ? "Changes haven't been saved." : "Save to keep this recipe in My Kitchen."}
      {state.id && state.id !== props.initial?.id ? <> <Link href={`/my/${state.id}`} className="underline">Open saved recipe</Link></> : null}
    </p>
    {!props.initial && <p className="text-xs text-muted-foreground">Clearing cookies loses access to saves. No cross-device recovery.</p>}
    <p className="text-xs text-muted-foreground">Share makes the recipe and future saved edits readable to anyone with the link.</p>
    {state.error && <div className="text-sm text-tomato" role="alert">
      <p>{state.error}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {state.conflict ? <>
          <Button size="sm" variant="outline" onClick={() => void save(true)} disabled={busy}>Save as new recipe</Button>
          <Button size="sm" variant="outline" onClick={() => { if (state.id) clearSavedDraft(state.id); window.location.reload(); }}>Reload saved version</Button>
        </> : <Button size="sm" variant="outline" onClick={() => void save()} disabled={busy}>Retry save</Button>}
      </div>
    </div>}
    {shareUrl && <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <label className="block text-xs font-medium" htmlFor="recipe-share-link">{copied ? "Link copied" : "Copy this share link"}</label>
      <input id="recipe-share-link" readOnly value={shareUrl} onFocus={(event) => event.target.select()}
        className="mt-1 w-full rounded border border-border bg-background p-2 text-xs" />
      <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-saffron-ink underline">Open read-only recipe</a>
    </div>}
  </div>;
}
