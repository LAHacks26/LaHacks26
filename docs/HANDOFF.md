# Saffron — handoff for the next agent

Written 2026-10-18 for any coding agent (Codex, Claude Code, etc.) picking up the build. Read this file first, then `CLAUDE.md` (rules and hard-won gotchas) and `docs/PRD.md` (the spec and source of truth). Update this file when you finish a task.

## 1. Where things stand

| Phase (PRD §14) | Status | Branch |
|---|---|---|
| 0 Scaffold, schema, DB, deploy skeleton | Done | `main` |
| UI mocks (`/mocks/*`) | Done | `main` |
| 1 URL import → recipe page | **Done, tested end to end** | `main` |
| 2 Hero: click a line → ask → recipe edits itself | **In progress.** Patch engine, store and AI routes are merged; UI wiring is underway (Task B) | `david/phase-2` |
| 3 Chat | Contract only (`ChatRequestSchema` in `src/lib/ai/contracts.ts`) | `david/phase-2` |
| 4 Search | Contract (`src/lib/search/types.ts`); server and page are being built | `david/phase-2` |
| 5 Auth / save / share | Not started. No Google OAuth credentials yet (see §3) | — |
| 6 Cook mode + voice | Contracts only (`src/lib/voice/types.ts`, `src/lib/store/cookStore.ts` stub) | `david/phase-2` |
| 7 Scaler / units / schedule | Pure functions being built | — |
| 8 Deploy + demo | Not started | — |

**Branches on GitHub**
- `main`: Phase 1 merged. Builds and works.
- `david/phase-2`: **continue from here.** It holds:
  - the contracts for phases 2, 3, 4 and 6;
  - the patch engine and the working-copy store;
  - the AI routes (`/api/ai/edit`, `/api/ai/explain`, `/api/ai/suggest-swaps`), reviewed twice.

  300 tests pass.

Work in progress lives in agent worktrees under `.claude/worktrees/` on David's laptop until it is reviewed and merged, so it is not on GitHub yet.

**The live site** (https://96-30-204-210.sslip.io) still runs the old mocks-only build. Phase 1 has not been deployed. See §6.

## 2. Setup on a new machine

1. `git fetch && git switch david/phase-2 && npm ci` (Node 22, see `.nvmrc`).
2. **`.env.local` is not in git.** Copy it from David's laptop by a private channel, or rebuild it from `.env.example`. Use these Gemini model values for now (see §5):
   ```
   GEMINI_FAST_MODEL=gemini-3.5-flash-lite
   GEMINI_SMART_MODEL=gemini-3-flash-preview
   GEMINI_FALLBACK_MODEL=gemini-3.7-flash
   ```
3. `curl` must be on PATH. Recipe pages are fetched with curl, not Node `fetch` (see CLAUDE.md).
4. **The DB needs a phone hotspot.** Venue Wi-Fi blocks the Postgres port (31015). If a DB call times out, switch networks; don't debug the code.
5. `npm run dev` serves http://localhost:3000. Before calling a task done, run `npm run typecheck && npm run lint && npm test && npm run build`.

**Demo recipes already in the DB** (seeded with `npm run seed` against a running dev server):

| Recipe | URL path |
|---|---|
| Easy Indian Butter Chicken (**hero recipe**: oven + heavy cream) | `/recipe/f0a8dd5a-4a78-4aa9-974d-3deaa8570896` |
| Chicken tikka masala | `/recipe/1cd3ee5b-54e6-44aa-be5a-e1e0d9ec8941` |
| Spinach & chickpea curry | `/recipe/c8d0897c-9d97-44f8-af67-d81aa137a1b5` |
| Homemade mac and cheese | `/recipe/8992ffb5-d680-4624-b857-fda1ab3377a2` |
| Chocolate chip cookies | `/recipe/3ab04875-2e45-4cce-b658-8b65e0baee91` |

## 3. Next tasks, in order

### Task A: AI routes (DONE, merged into `david/phase-2`)
Both rounds of review fixes are applied: allergen "-free" handling, the untrusted fence, explain-stream errors, the Caddy streaming block, 400s before calling Gemini, and a total deadline.

Still open:
- A follow-up adding allergen synonyms ("butter" → dairy, "almond" → tree nuts, and so on) is in progress.
- Make **one** live call: substitute heavy cream → coconut milk on the butter chicken recipe, through `POST /api/ai/edit`. This checks Gemini's output against the real patch engine; the earlier smoke test ran with `patch.ts` stubbed.

**What was merged:**
- `src/lib/ai/edit.ts`: `runEdit`. Gemini fills a flat op schema (`editSchema.ts`, because Gemini handles `oneOf` poorly), which is converted to `PatchOp`. Then `normalizePatchIds`, `validatePatch`, `applyEditResult`, with one retry carrying the error messages.
- `explain.ts`: a streamed plain-text answer.
- `swaps.ts`: exactly 3 allergen-safe swaps.
- `context.ts`: shared prompt helpers.
- The routes `src/app/api/ai/{edit,explain,suggest-swaps}/route.ts`, plus `shared.ts` for body cap, rate limit and error mapping.
- `streamText` in `gemini.ts`, and new rules in `prompts.ts`.

### Task B: wire the recipe page UI to the store and the AI routes (not started)
This is the hero feature. The demo script steps 4–7 in PRD §3 are its acceptance test.

**Read first:**
- `src/lib/ai/contracts.ts` (route request and response shapes).
- `src/lib/recipe/patch.ts` and `src/lib/store/recipeStore.ts`. Callers must call `setEditing(target)` before starting an edit. `applyEdit` returns `"applied" | "stale" | "ignored"`.
- `src/components/recipe/*`. `RecipeView` and `LinePopover` are mock-driven today. `/mocks/recipe?state=...` must keep working.

**Build:**
1. `src/lib/api/aiClient.ts`: client fetch helpers `explainStream(req, {signal, onChunk})`, `suggestSwaps`, `requestEdit`.
   - Validate every response with the contract schemas.
   - Show only user-facing error messages, never raw JS errors.
   - Time out after 30 s.
2. `src/components/recipe/RecipeEditor.tsx` (client component, props `{sourceRecipeId, recipe}`). On mount, call `useRecipeStore.getState().load(...)`. Render from `copy.recipe`.

   Popover actions per line type:

   | Line | Action | Calls |
   |---|---|---|
   | Ingredient | **Substitute…** | 3 swap chips, prefetched when the popover opens, plus a "with…" field. Choosing one sends edit `substitute`. |
   | Ingredient | **What is this?** | explain |
   | Step | **Explain** | explain |
   | Step | Ask field | edit `ask` |
   | Appliance | **I don't have this** | edit `missing_appliance`, sent immediately |
   | Appliance | **Explain** | explain |

   **Explain:** stream the answer into the popover. When it finishes, save it with `addTip`. Explain may run while an edit is running. Abort the stream when the popover closes.

   **Edit flow:**
   1. Call `setEditing(target)` and record `baseVersion`.
   2. Send `requestEdit`.
   3. Handle the result by kind:

      | Result | What happens |
      |---|---|
      | `patch` | `applyEdit`. On `"stale"`, re-run once. On success, close the popover; the store drives the glow and toast. |
      | `rejected` | `RejectionCard`; tapping a chip substitutes that suggestion. |
      | `impossible` | `ImpossibleCard`; "Search instead" goes to `/?q=…`. |
      | `answer` / `tip` | Show the text and save it with `addTip`. |

   4. Always clear `editing` in `finally`.

   **Also:**
   - While `editing` is set, the target line shimmers and other edits are disabled with "Saffron is editing…".
   - Errors show inline with a "Try again" button.
   - Pass `glow.ids` as `glowIds`, keyed by `glow.key`.
   - Show `EditToast` with Undo, auto-dismissed after 8 s. Ctrl/Cmd+Z also undoes.
   - Pass `newTipIds` as `openTipIds`.
   - **Phrase selection:** a mouse selection inside one step's text opens the popover with `target.selectedText`, anchored to the selection rect (Base UI virtual anchor).
   - Enter or Space on a focused line opens its popover.
   - Hide "Continue in chat" until Phase 3.
3. Refactor `RecipeView` and `LinePopover` so props and handlers control them, with the mock states still working.
4. `src/app/recipe/[sourceId]/page.tsx` renders `RecipeEditor`.
5. `Landing.tsx` prefills its query from `?q=`. `useSearchParams` needs a Suspense boundary; check the Next 16 docs.
6. Test in a browser on the butter chicken recipe:
   - cream → coconut milk: the lines glow, the toast appears, Undo and Ctrl+Z work.
   - salt → sugar: the rejection card appears with its chips.
   - Highlight "until charred" (or any phrase), then Explain: the answer streams and a tip appears.
   - Oven → "I don't have this": the Oven chip disappears.

   Task B can be built against temporary stub routes if Task A isn't merged yet. Delete the stubs afterwards.

### Then: Phases 3–8 (PRD §14)
3. Chat panel. 4. Search with the mocked Browser Use agent. 5. Auth.js Google, save/share, My Kitchen. 6. Cook mode, timers, Web Speech voice. 7. Servings scaler, units, ready-by schedule. 8. Deploy, warm the cache, full click-through, rehearse the §3 demo twice.

The PRD lists files, parallel tracks and the cut order if time runs short. The hero flow, URL import and recipe page must never be cut.

## 4. Conventions that matter

These are all in `CLAUDE.md`; it wins over this file.
- `src/lib/recipe/schema.ts` and the contracts are frozen. Change them only deliberately, everywhere at once.
- **No CSS modules.** Light theme only. Next 16.4 differs from most training data, so read `node_modules/next/dist/docs/` before using an unfamiliar API. Cache Components stay off.
- **Every server-side fetch of a user URL goes through `fetchPage`.** It uses curl and contains the SSRF guard.
- **Scraped or client-supplied text in prompts must be fenced** with `src/lib/ai/untrusted.ts`.
- **Plain-text prompts must override the JSON-only `SYSTEM_PREAMBLE`.**
- **Git:** one short branch per person, commit after each working sub-task, keep `main` green, never force-push `main`, never commit `.env*` except `.env.example`. A new env var goes into `.env.example` in the same change.
- No human reviews code. Have a second agent review every diff before merging.

## 5. Gemini quota (the main risk)

The key is on the **free tier**, which has two limits:
- About 5 requests per minute.
- **A small daily cap per model.** On 2026-10-17 it ran out for `gemini-3.6-flash` and `gemini-3.5-flash`. A 429 response containing `PerDay` means you need to switch models or wait about 17 hours.

Each model has its own cap, which is why `.env.local` points at lite and preview models (§2). How to work with this:
- Unit-test against fixtures and mocked `generateJson`.
- Make live calls only when a prompt or schema changes.
- Don't retry in loops.

**Billing on the Google AI Studio project must be enabled before demo rehearsals.** The team is waiting on the person who owns the project.

## 6. Deploying

Production is a Vultr VM: pm2, Caddy, `/home/saffron/app`.
- The deploy command is in `CLAUDE.md`. It needs the `saffron` SSH alias from David's laptop.
- Before the first Phase 1+ deploy:
  - Make sure `curl` is installed on the VM.
  - Update the VM's `/home/saffron/app/.env.local` with the model names from §2 (use `scp`, not git).
  - Apply the Caddy streaming fix from `REVIEW-TODO.md` item 4.
- Don't deploy right before a demo.
