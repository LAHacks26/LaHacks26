# Saffron — handoff for the next agent

Last updated 2026-10-18, for any coding agent (Codex, Claude Code, etc.) picking up the build. Read this file first, then `CLAUDE.md` (rules and hard-won gotchas) and `docs/PRD.md` (the spec and source of truth). Update this file when you finish a task.

## 1. Where things stand

| Phase (PRD §14) | Status | Where |
|---|---|---|
| 0 Scaffold, schema, DB, deploy skeleton | Done | `main` |
| UI mocks (`/mocks/*`) | Done | `main` |
| 1 URL import → recipe page | **Done, tested end to end** | `main` |
| 2 Hero: click a line → ask → recipe edits itself | Engine, store, AI routes and allergen safety net **merged**. The UI wiring is built and browser-tested against stubs, but **its review fixes are mostly not applied** (Task B) | `david/phase-2` + `wip/phase-2-ui` |
| 3 Chat | Contract merged. **Server and UI not started** (Task E) | `david/phase-2` |
| 4 Search | Contract and **search page merged**. The server is **built and live-tested; its review was not finished** (Task C) | `david/phase-2` + `wip/phase-4-search-server` |
| 5 Auth / save / share | Not started. No Google OAuth credentials yet (Task F) | — |
| 6 Cook mode + voice | Contracts only (`src/lib/voice/types.ts`, `src/lib/store/cookStore.ts` stub) | `david/phase-2` |
| 7 Scaler / units / schedule | **Pure functions merged** (`src/lib/recipe/{scale,units,schedule}.ts`). Not wired into the UI yet (Task D) | `david/phase-2` |
| 8 Deploy + demo | Not started | — |

**Branches on GitHub**
- `main`: Phase 1. Builds and works.
- `david/phase-2`: **continue from here.** 669 tests pass. It holds everything reviewed and merged so far:
  - the contracts for phases 2, 3, 4 and 6;
  - the patch engine and the working-copy store;
  - the AI routes;
  - the allergen safety net;
  - the Phase 7 functions;
  - the search page.
- `wip/phase-2-ui`: the Phase 2 UI wiring, built on `david/phase-2`. Its first review returned **CHANGES NEEDED**. Of the 9 fixes (Task B), only #6 and #9 appear to be in, so re-check every item. Don't merge it as is.
- `wip/phase-4-search-server`: the Phase 4 server, built on `david/phase-2`. 253 tests pass and it was live-tested, but **the review was interrupted**. Run a review, then merge (Task C).

Both WIP branches are single snapshot commits on top of the agents' worktree branches. To continue one, check it out, make a branch from it, and fix there. All agents were stopped on 2026-10-18 to save tokens. No other work is pending anywhere.

**The live site** (https://96-30-204-210.sslip.io) still runs the old mocks-only build. Nothing since Phase 0 is deployed. See §6.

**Git remote:** GitHub says the repo moved to `https://github.com/LAHacks26/LaHacks26.git`. Pushes still work through the redirect. Run `git remote set-url origin https://github.com/LAHacks26/LaHacks26.git` when convenient.

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

## 2.5 What is merged on `david/phase-2` (quick map)

| Area | Files |
|---|---|
| Contracts | `src/lib/ai/contracts.ts` (explain, suggest-swaps, edit, chat); `src/lib/search/types.ts` (search request, SSE events, cards); `src/lib/voice/types.ts` (voice turn, tools, `VoiceProvider`); `src/lib/store/cookStore.ts` (stub signatures) |
| Patch engine | `src/lib/recipe/patch.ts`: `normalizePatchIds`, `validatePatch`, `applyPatch`, `applyEditResult`, `addTip`. Pure; shared by client and server |
| Working copy | `src/lib/store/recipeStore.ts`: zustand, localStorage `saffron:wc:<sourceRecipeId>`, undo stack of 20. Call `setEditing(target)` before an edit. `applyEdit` returns `"applied" \| "stale" \| "ignored"` |
| AI routes | `/api/ai/edit` (`src/lib/ai/edit.ts`, `editSchema.ts`). Gemini fills a flat op schema, which is converted to `PatchOp`, then normalized, validated and test-applied, with one retry and a total deadline. `/api/ai/explain` streams plain text. `/api/ai/suggest-swaps` returns exactly 3. Shared helpers: `src/app/api/ai/shared.ts` (body cap, rate limit, errors) and `src/lib/ai/context.ts` |
| Allergen safety net | `containsAllergen` in `src/lib/ai/context.ts`: synonyms (butter → dairy, almond → tree nuts, soy sauce → gluten, …), negations only on the allergy's own name, plant-based lookalikes exempt. Table tests in `allergenSynonyms.test.ts` |
| Phase 7 functions | `scale.ts` (`scaleQty`, `formatUsQty`, `formatMetricQty`), `units.ts` (`convertIngredient`, `convertTemperaturesInText`, `formatIngredientQty`), `schedule.ts` (`stepClockTimes`, `readyByStatus`, `formatClock`, `maxTotalMinFor`) |
| Search page | `/search/[searchId]`: `src/components/search/SearchRun.tsx`, the pure reducer `searchRunState.ts`, and `src/lib/search/client.ts` (`startSearch`, `subscribeSearch` with connect and stall watchdogs, `importRecipeLink`, `readAllergies`) |
| Caddy | `deploy/Caddyfile` stops buffering `/api/ai/explain` and the search SSE stream (not yet copied to the VM) |

## 3. Next tasks, in order

### Task B: finish and merge the Phase 2 UI wiring (hero feature)
The code is on `wip/phase-2-ui`. Apply the review fixes listed below, re-review, and merge. The demo script steps 4–7 in PRD §3 are its acceptance test.

**What it contains:**
- `src/lib/api/aiClient.ts`
- `src/components/recipe/RecipeEditor.tsx`: the popover state machine. Explain streams and is saved as a tip; substitute shows prefetched swap chips plus "with…"; the missing-appliance and ask actions; rejection, impossible and error states; stale retry; phrase selection anchored to the selection; the glow, the 8 s undo toast and Ctrl/Cmd+Z.
- `LinePopover` rebuilt on Base UI with a virtual anchor.
- `src/lib/allergies.ts`, using the localStorage key `saffron:allergies`.
- The `?q=` prefill on the landing page.

**Review fixes to apply.** These are from the reviewer, by file and line in `RecipeEditor.tsx`, `RecipeView.tsx` and `LinePopover.tsx`:

1. **HIGH:** React `mouseup` bubbles through the popover portal, and a phrase selection survives button clicks. So clicking Explain, Ask or Try again inside a phrase popover re-runs `openLine`, which resets the popover. In `onMouseUp`, return early when the target is inside the popover, or when the selection equals the open phrase target.
2. Tie edits to the recipe. Capture `sourceRecipeId` and bail out unless `getState().copy?.sourceRecipeId` still matches. Pass an `AbortController` to `requestEdit` and abort it on unmount. If the popover was closed, show a rejected, impossible or error result as a sonner toast instead of dropping it.
3. Switching action mid-stream: abort the explain stream and bump `bodyRef`, so stale results are ignored.
4. `RecipeView.tsx:~181`: remove the live `selectedPageText() !== ""` check; it swallows trigger clicks and Enter/Space. Use a short-lived ref set by the phrase `onMouseUp` instead.
5. Rejection chips on a non-ingredient target send action `ask`, not `substitute`.
6. Add `saved: true` to the explain mock states in `src/lib/mocks/recipe.ts` (appears done).
7. Avoid the flash of the server recipe before the stored copy loads. A reduced-opacity, non-interactive render is enough.
8. `LinePopover`: add `aria-live="polite"` on the answer body, and move focus to the popup when the body changes.
9. Create `src/lib/allergies.ts` with `readAllergies` and `writeAllergies` on the `saffron:allergies` key, and send its value with every AI request (appears done).

The store contract may also change in Task E: `editing.target` can become null for whole-recipe edits.

**When it's done:**
1. Re-review it, then merge into `david/phase-2`.
2. Dedupe `readAllergies`: the search client has its own; make it re-export from `src/lib/allergies.ts`.
3. **Live test steps 4–7 against real Gemini** on the butter chicken recipe. That's about 6–8 calls:
   - cream → coconut milk;
   - salt → sugar, rejected;
   - highlight a phrase, then Explain;
   - Oven → "I don't have this".

   This is also the first check of real Gemini patches against the real patch engine.

### Task C: Phase 4 search server, then landing wiring
The server is built on `wip/phase-4-search-server` and needs a review, against `src/lib/search/types.ts`.

**Review focus:**
- Leaks in the in-memory registry, timers and pings over a long-running process.
- `enqueue` after `close` on the SSE stream.
- A gap between replay and subscribe.
- The `importRecipe` `onParsed` hook must not poison the in-flight dedupe map.
- `meta.readyBy` must echo the request's ISO string verbatim.

Live test results:
- A search for "butter chicken" streamed the cached recipe instantly, then 3 candidates.
- A search for "15-minute butter chicken" dropped every candidate as too long, without any Gemini calls.
- The cosine-similarity threshold is tuned to **0.64**. Correct matches score 0.65–0.76; "chocolate cake" doesn't match mac and cheese.
- The SSE `data` field is the whole event JSON, `type` included.

What the server consists of:

| File | Job |
|---|---|
| `parseQuery.ts` | Query parsing (Gemini fast, cached) |
| `cache.ts` | pgvector top-3 with a tuned similarity threshold |
| `browserUse.ts` | The `BrowserUseClient` interface plus `MockBrowserUseClient` (~8 s, a scripted step log, real verified URLs from `mockResults.ts`) |
| `runSearch.ts` | In-memory run registry on `globalThis`; one run per `saffron_sid` cookie, at most 3 concurrent, replays to late subscribers |
| `src/app/api/search/route.ts`, `src/app/api/search/[searchId]/stream/route.ts` | The routes |

`importRecipe(url, hooks)` gains an `onParsed` hook, so a basic card can be emitted before normalization finishes.

**After merging:**
- `Landing.tsx` currently sends text queries to `/mocks/search`. Change it to call `startSearch({ text, constraints, readyBy, allergies: readAllergies() })` and go to `/search/<id>`. `readyBy` must be an ISO string with an offset.
- Make sure the server's `meta.readyBy` echoes the request's ISO string verbatim, because the search page's Retry resubmits it.

### Task D: wire Phase 7 into the recipe page
- **`StatsStrip`:** make the servings stepper and the US | Metric toggle work. Keep them in `RecipeEditor` state; they are view-only and never sent to AI.
- **Ready-by line:** use `readyByStatus` plus a once-a-minute tick. `readyBy` comes from the URL `?readyBy=` (ISO) and is stored on the working copy (`WorkingCopy.readyBy`).
- **`IngredientList`:** show `formatIngredientQty(scaleIngredient(...), system)`.
- **`StepList`:** show `stepClockTimes` per step when a ready-by is set, and pass the step text through `convertTemperaturesInText(text, system)`.

### Task E: Phase 3 chat (not started; build this design)
**Server:**
- `src/lib/ai/chat.ts`: Gemini detects the intent, then routes it:

  | Intent | Goes to |
  |---|---|
  | answer | a plain reply |
  | decline | a plain reply |
  | impossible | a result with a suggested search |
  | targeted edit | `runEdit` with action `ask` |
  | whole-recipe transform | `src/lib/ai/transform.ts` |

- The route is `/api/ai/chat`.

**UI:**
- `src/lib/store/chatStore.ts`: localStorage `saffron:chat:<id>`, context chips, and the send flow with undo.
- `src/lib/api/chatClient.ts`
- `src/components/chat/ChatDock.tsx`

**Contract change:** `recipeStore.editing` becomes `{ target: LineRef | null }`, where null means a whole-recipe edit. There is a new action `beginWholeRecipeEdit()`. `RecipeEditor` must handle a null target when merged.

**Integration after merging:**
1. Mount `<ChatDock recipeKey={sourceRecipeId} />` in `RecipeEditor`, replacing `AskSaffronFab` in `RecipeView`.
2. Re-add "Continue in chat →" in `LinePopover`; it calls `useChatStore.getState().attach(ref, label)`.

### Task F: Phase 5 save / share, anonymous first
There are no Google OAuth credentials (`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are empty). PRD §4's cut order allows a fallback: save under an anonymous device cookie. Recommended design:
- **Identity:** `src/lib/auth/viewer.ts` (server-only). A `saffron_uid` cookie (httpOnly, random UUID) maps to a `users` row with `google_sub = "anon:<uuid>"`. No migration is needed, since `google_sub` is just a unique text column.
- **Google later:** add Auth.js v5 when credentials exist, and merge the anonymous user into the Google user at sign-in. Check that `next-auth` supports Next 16.4 before installing.
- **Routes:** per PRD §9: `POST/GET /api/recipes`, `GET/PATCH /api/recipes/[id]` (owner only), `POST /api/recipes/[id]/share`, `PUT /api/me/allergies`.
- **Pages:**
  - `/my/[savedId]`: `RecipeEditor` with `savedId` and autosave debounced to 1 s.
  - `/s/[slug]`: a read-only `RecipeView`, with **Make it mine** forking it into a new working copy that records `forked_from`.
  - `/kitchen`: saved recipes plus the allergy sheet, which writes `saffron:allergies` (mocks exist).
- **Chat history:** moves from localStorage to `chat_messages` on save.

### Task G: Phase 6 cook mode and voice
The contracts are in `src/lib/voice/types.ts` and the `src/lib/store/cookStore.ts` stub. The UI mocks are in `src/components/cook/*` and `/mocks/cook`.
1. Implement `cookStore`: focused step, done states, timers with `endsAt` persisted to `saffron:cook:<key>`.
2. Build the cook UI: Start cooking, dimmed steps, timer chips and tray, a Web Audio chime.
3. Build `/api/voice/turn` and `src/lib/ai/voice.ts`: one Gemini fast call returning `{say, toolCalls}`. Use a flat schema, since Gemini handles `oneOf` poorly.
4. Build `src/lib/voice/`:
   - `wakeword.ts`: a fuzzy "Hey Saffron" regex with tests.
   - `webspeech.ts`: `WebSpeechProvider`.
   - `tools.ts`: dispatches tool calls to `cookStore` and to `/api/ai/chat` for `edit_recipe`.
   - `elevenlabs.ts`: a stub until the key arrives.

### Task H: Phase 8
1. Deploy (see §6).
2. Warm the cache with `npm run seed` plus the demo search queries.
3. Click through the whole site with agent-browser.
4. Rehearse the §3 demo twice.

## 4. Conventions that matter

These are all in `CLAUDE.md`; it wins over this file.
- `src/lib/recipe/schema.ts` and the contracts are frozen. Change them only deliberately, everywhere at once.
- **No CSS modules.** Light theme only. Next 16.4 differs from most training data, so read `node_modules/next/dist/docs/` before using an unfamiliar API. Cache Components stay off. Error boundaries use `retry` (Next 16.3+), not `reset`.
- **Every server-side fetch of a user URL goes through `fetchPage`.** It uses curl and contains the SSRF guard.
- **Scraped or client-supplied text in prompts must be fenced** with `src/lib/ai/untrusted.ts`.
- **Plain-text prompts must override the JSON-only `SYSTEM_PREAMBLE`.**
- **Allergies:** the client stores them in localStorage `saffron:allergies` (a JSON string array) until Phase 5, and sends them with every AI request. The server re-checks every suggestion with `containsAllergen`.
- **Git:** one short branch per person, commit after each working sub-task, keep `main` green, never force-push `main`, never commit `.env*` except `.env.example`. A new env var goes into `.env.example` in the same change.
- No human reviews code. Have a second agent review every diff before merging.
- On Windows, 5 parallel builders running `npm ci` and `next build` can exhaust process slots ("fork: Resource temporarily unavailable"). Use 3–4.

## 5. Gemini quota (the main risk)

The key is on the **free tier**, which has two limits:
- About 5 requests per minute.
- **A small daily cap per model.** On 2026-10-17 it ran out for `gemini-3.6-flash` and `gemini-3.5-flash`. A 429 response containing `PerDay` means you need to switch models or wait about 17 hours.

Each model has its own cap, which is why `.env.local` points at lite and preview models (§2). How to work with this:
- Unit-test against fixtures and mocked `generateJson`.
- Make live calls only when a prompt or schema changes.
- Don't retry in loops.

**Billing on the Google AI Studio project must be enabled before demo rehearsals.** The team is waiting on the person who owns the project. Flash costs very little at hackathon volume.

## 6. Deploying

Production is a Vultr VM: pm2, Caddy, `/home/saffron/app`.
- The deploy command is in `CLAUDE.md`. It needs the `saffron` SSH alias from David's laptop.
- Before the first Phase 1+ deploy:
  - Make sure `curl` is installed on the VM.
  - Update the VM's `/home/saffron/app/.env.local` with the model names from §2 (use `scp`, not git).
  - Copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile` and run `systemctl reload caddy`. It adds the unbuffered explain-stream block.
- Merge `david/phase-2` into `main` only once the hero flow passes a live test.
- Don't deploy right before a demo.

## 7. Known gaps and decisions

- **Undo drops tips:** undoing an edit restores the pre-edit snapshot, so tips added after that edit disappear. Accepted for now.
- **Appliance popovers** don't prefetch alternatives, to save Gemini quota. "I don't have this" runs immediately.
- **Soy sauce is flagged as gluten** on purpose (most contains wheat). "Nut-free walnut pesto"-style contradictions can slip through the two-word negation strip. That's an accepted trade-off.
- **Search page:** the mock agent has `liveUrl: null`, so the page shows a placeholder animation. A real Browser Use live URL renders in a sandboxed iframe, https only, with an "Open live view" fallback.
- **Keys still missing:** Google OAuth, Browser Use, ElevenLabs and the GoDaddy domain. Each one has a stub (PRD §13.1).
