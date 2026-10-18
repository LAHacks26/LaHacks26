# Saffron — handoff for the next agent

Last updated 2026-10-18 by Codex. Read this file, `AGENTS.md`, `CLAUDE.md`, and the relevant PRD sections. Use code and Git history as implementation evidence; the PRD defines intended behavior.

## 1. Current baseline and verification

- Branch: `codex/saffron-recovery`, based on HEAD `03ae8da`. `git fetch origin` on 2026-10-18 found no newer commits on `origin/main`.
- Phase 2 UI (`782f5af`), Phase 4 search server (`65c22a5`), and the remaining Phase 2 work (`03ae8da`) are already merged. Do not switch to the old WIP branches or repeat those merges.
- Recovery work included in this handoff: shared handoff instructions in `AGENTS.md` and `CLAUDE.md`, hero request lifecycle stabilization, search integration/constraints/import lifecycle, Phase 7 display controls, and Phase 3 chat (Tasks B–E below). The user authorized committing and pushing this recovery branch for Computer C on 2026-10-18. No merge, deployment, or migration is authorized. Stop feature implementation for this transfer.
- Previous baseline validation after `npm ci`: typecheck, lint, all 718 tests (34 files), and production build passed. Build required network access for Google Fonts.
- Current task validation (2026-10-18): `npm run typecheck`, `npm run lint`, `npm test` (726 tests across 35 files, including eight new lifecycle regressions), and `npm run build` all passed. Build used approved network access. `git diff --check` passed. AI review found no blocking issues; it noted the absence of mounted-component/DOM tests and direct coverage of the editor's two-attempt loop.
- Latest search integration validation (2026-10-18): typecheck, lint, `npm test` (**738 tests across 37 files**), production build, and `git diff --check` passed. A production server on localhost returned HTTP 200 for `/` with the expected landing heading and ready-by control, then was stopped. No browser provider was available (`cua.listBrowsers()` returned none), so visual/interaction checks remain pending. The separate reviewer hit its usage limit; direct review was completed, but no independent review of this search diff is claimed.
- Latest lifecycle validation (2026-10-18, supersedes test totals above): `npm run typecheck`, `npm run lint`, `npm test` (**749 tests across 38 files**), `npm run build`, and `git diff --check` passed. Ten new importer tests plus mock cleanup coverage verify caller isolation, late joiners, rejection without AI, retries after fetch/normalization failures, cache/host-guard behavior, and task expiry. Direct diff review completed; independent review remains unavailable after the reviewer usage limit. No live external calls were made for these fixes.
- Latest validation (2026-10-18, supersedes totals above): typecheck, lint, **795 tests across 47 files**, production build, and `git diff --check` all passed after search constraints, display controls, chat integration, and the timeout fix. Build includes `/api/ai/chat`. Direct code review completed; independent review was unavailable. These checks preceded the handoff-only documentation changes; they were not repeated. The user subsequently authorized commit/push of this branch, approved anonymous ownership, and explicitly deferred save/share implementation. No merge, deployment, or DB migration was performed.
- Live Gemini/database connectivity, browser interactions, latency, and production deployment have NOT been reverified on this computer. Do not treat successful unit tests or build as credential validation.

| Area | Actual implementation |
|---|---|
| Scaffold, schema, migrations, UI mocks | On main; deployment configuration exists |
| URL import and recipe page | Implemented on main; earlier developer reported end-to-end success, not rerun here |
| Hero editor | Engine, store, AI routes, allergen guards, and UI on main; lifecycle fixes currently uncommitted |
| Search | API, SSE, cache, mock agent, results page on main; real landing submission and deadline links now wired locally |
| Scaling / units / schedule | Ready-by propagation, persistence, and live start-by/ETA now wired locally; servings, units, temperatures and per-step times now wired locally |
| Chat | Production route, intent routing, transforms, local history, context chips and UI wired locally; live/browser acceptance pending |
| Auth / save / share | DB schema and mock UI; production routes/pages missing |
| Cook / voice | Contracts and mocks; cook-store actions throw `not implemented`; voice providers/routes missing |
| Deployment | Old handoff reported a mocks-only live site; current deployed version unverified |

## Computer C: resume here

1. Fetch origin and check out `codex/saffron-recovery`; read this handoff plus AGENTS/CLAUDE and inspect commits newer than this document. Do not repeat the completed B–E work or a full audit.
2. Install Node 22 dependencies with `npm ci`. Transfer `.env.local` privately to the repo root; Git intentionally excludes it. A populated environment is not proof of service connectivity.
3. Next implementation priority: Task F anonymous save/share, with ownership and cross-user access tests, then kitchen/allergies/autosave/forking. The cookie decision above is approved. Save/share was deliberately not started here.
4. Then Task G cook mode/timers/voice. Task H live validation, rehearsal, cache warming and deployment remain pending; production actions still require approval.
5. Acceptance gaps: browser interactions, live Gemini/database behavior, real Browser Use/voice providers, and independent review. Existing mock/automated success does not establish live readiness. See §7 for known limitations; no currently failing automated check is known.

## 2. Setup and environment knowledge (no secrets)

- Repo remote is already `https://github.com/LAHacks26/LaHacks26.git`.
- Node 22 and curl are installed on this Windows computer. Run `npm ci` for locked dependencies. Dependencies are installed here now.
- Local secrets must be in the repository-root **`.env.local`**, including the leading dot. Uploaded names such as `env.local` or `env.local.download` are not loaded by Next.js and are not covered by the `.env.*` ignore rule. The file here was renamed correctly and is ignored.
- Required populated settings were checked without printing values: `GEMINI_API_KEY`, `DATABASE_URL`, `GEMINI_FAST_MODEL`, `GEMINI_SMART_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_EMBED_MODEL`. Transfer secrets privately; never paste them into docs or logs.
- HANDOFF historically recommended fast `gemini-3.5-flash-lite`, smart `gemini-3-flash-preview`, fallback `gemini-3.7-flash`; `.env.example` has older defaults. These are historical observations, not a current model-availability guarantee. Preserve working local configuration until verified.
- Mock Browser Use does not require its API key. Google OAuth, ElevenLabs, and real Browser Use remain future integrations; copying keys alone does not implement them.
- Sandboxed `npm ci` failed with npm's exit-handler/cache error; approved execution with cache/network access succeeded. Some dependency install scripts were blocked, but baseline tests and build still passed. npm reported 13 vulnerabilities (4 moderate, 9 high); no forced fixes/upgrades were applied.
- `next build` downloads Inter and Fraunces from Google Fonts. A restricted-network build failed; the approved network-enabled retry passed.
- Venue Wi-Fi historically blocked the Tiger Postgres port (31015). Use a hotspot if DB calls time out, per CLAUDE.md; connectivity on this computer remains unverified.
- Commands: `npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

Historically seeded demo recipes (DB presence not rechecked):

| Recipe | Source recipe ID |
|---|---|
| Easy Indian Butter Chicken (hero: oven + cream) | `f0a8dd5a-4a78-4aa9-974d-3deaa8570896` |
| Chicken tikka masala | `1cd3ee5b-54e6-44aa-be5a-e1e0d9ec8941` |
| Spinach & chickpea curry | `c8d0897c-9d97-44f8-af67-d81aa137a1b5` |
| Mac and cheese | `8992ffb5-d680-4624-b857-fda1ab3377a2` |
| Chocolate chip cookies | `3ab04875-2e45-4cce-b658-8b65e0baee91` |

## 3. Completed task and prioritized next work

### Task B: hero request lifecycle stabilization (local changes)

`RecipeEditor` now keys its internal session by source recipe. A session owns cancellation and its edit lock; leaving the recipe aborts edit/explain/suggestion requests. Late responses cannot revive an old session after A → B → A navigation, and old cleanup cannot release another editor's lock. Explanations are saved only against the version they describe; starting an edit cancels the previous explanation. Non-patch edit results also participate in the existing stale-version retry.

The original nine UI review fixes are substantially present on main; do not blindly reimplement the old checklist. The remaining acceptance work is browser validation: pending edit/explain during navigation, closing a popover during an edit, action switching while streaming, phrase Explain, keyboard opening, and undo. Unit coverage exercises the session/store lifecycle, not DOM interaction. When live AI validation is appropriate under CLAUDE.md's quota policy, run PRD demo steps 4–7 (cream → coconut milk, salt → sugar rejection, phrase Explain, no Oven). No live calls were made for this lifecycle-only task.

### Task C: search integration and lifecycle fixes (local changes)

Completed locally:
- `Landing.tsx` uses `lib/search/landing.ts` to submit text to `/api/search` with selected constraints, saved allergies, and an absolute ISO deadline, then navigates to the returned run. URL input still uses `/api/import`. Busy/error states, unmount cancellation, and timeout handling are present; the form can be resubmitted after failure.
- Ready-by is optional initially. Opening its picker defaults to one hour ahead. A selected earlier clock time means tomorrow (explained in the picker); conversion uses local wall-clock time and sends UTC ISO.
- `recipeHref` preserves the deadline on cached cards, candidate cards, direct imports, and search-page fallback imports. `parseReadyBy` rejects malformed/repeated parameters.
- The recipe page reads the async Next.js `searchParams`, and `recipeStore.load` persists a valid incoming deadline while preserving restored edits and undo history. No deadline or an invalid one preserves the stored value. The editor shows start-by/ETA and updates once per minute.
- Search ready-by budgets now use the existing schedule helper with a zero floor rather than inventing a 15-minute minimum.
- New tests exercise request payloads, URL-vs-text routing, clearing the deadline, API failure/retry, cancellation, local-time/day rollover, offset-safe links, and deadline persistence without losing edits.
- `importRecipe` now shares preparation and normalization separately. Every caller of an uncached page runs its own `onParsed` callback on copied facts, including callers joining during normalization. A rejection affects only that caller. If all callers reject, no normalization runs; shared entries are removed after the last caller settles. Cache hits retain their previous no-hook behavior; search still checks normalized duration afterwards.
- `MockBrowserUseClient` deletes tasks after delivering the finished result and on cancellation (idempotent). It prunes abandoned tasks older than ten minutes on start/poll, without adding timers. Polling a removed task throws `Unknown mock task`; the search registry retains SSE replay, so terminal task data does not need to remain in the mock.

Remaining acceptance: browser click-through and real-service search → recipe validation. Keep the mock agent until the real adapter exists.

Completed constraint integration: cached and normalized candidates use the same deterministic dietary/equipment checks before becoming selectable. Allergy matches remain visible. Cache filtering examines up to 30 matches before selecting three. Checks use ingredient names, allergen tags, and declared appliances; they are heuristics, not dietary certification. The search client now re-exports the shared allergy reader.

Validation: typecheck, lint, all **766 tests across 40 files**, and production build passed. No live services or browser interaction were tested. Task D has since been completed below.

Static review found SSE close guards, ping cleanup, synchronous replay/subscription registration, and verbatim `meta.readyBy` echo already present. Focus further review on actual gaps. The cache threshold is 0.64 based on historical live tuning; those live results were not rerun.

### Task D: Phase 7 display controls (completed locally)
- Servings (1–100) and US/Metric controls live in the keyed editor session. Ingredient scaling and unit/temperature conversion are display-only; canonical recipe quantities and AI payloads stay unchanged.
- Steps show approximate clock times when a ready-by is present, recalculated from the schedule and current recipe. Converted temperature selections map back to canonical text before AI requests.
- Typecheck, lint, **772 tests across 41 files**, and production build passed. Rendering tests verify scaled metric quantities, temperatures, clock-time presence/absence, and no recipe mutation; selection tests cover rounding and multiple conversions. Browser click tests remain pending.

### Task E: Phase 3 chat (completed locally; live acceptance pending)
- `/api/ai/chat` validates history and context references before intent routing. Cooking answers/declines return text; targeted requests reuse `runEdit`; whole-recipe transforms use smart/medium reasoning and the shared patch-ID, application, and allergen validator. Impossible results expose a suggested search.
- `ChatDock` mounts on the recipe page. Context chips, Continue in chat (including the available question/explanation), send/error/retry, Search instead, and localStorage history (`saffron:chat:<sourceId>`) are connected. History is capped at 200 entries, with the last 20 sent to AI. DB history waits for saving.
- The deliberate store contract addition is `editing: { target: LineRef | null } | null` plus `beginWholeRecipeEdit()`. Null target means a whole-recipe request; outer null means no request. Hero and chat share one lock. Navigation cancels and permanently invalidates the old session; stale responses retry once. Undo only applies to the current edit version.
- Client budgets: ordinary actions 30 seconds, missing-appliance edits 45 seconds (server 40), chat 75 seconds for routing plus edit/transform. Regression tests cover the longer deadlines.
- Mocked tests cover routing, context validation, real patch/allergy validation, persistence/corrupt storage, lock ownership, navigation, stale retry, errors and version-specific undo. No live Gemini call was made: model behavior and latency remain unverified under the existing quota limits. Browser interactions and independent review remain pending.

### Task F: Phase 5 save / share, anonymous first

**Approved MVP decision (2026-10-18): anonymous device-cookie ownership.** The user explicitly approved this for Computer C and instructed us not to implement save/share during handoff. No save/share identity code or DB changes have been made. This choice no longer needs confirmation.

Proposed implementation: a cryptographically random UUID bearer cookie, HttpOnly, SameSite=Lax, Secure in production, mapped to the existing anonymous user row. Check request origin on mutations and scope every private saved-recipe query to the viewer; public share slugs expose only deliberate read-only shares. **Clearing or losing cookies loses access to anonymous saves until account linking/recovery exists.** Cross-device recovery is not part of the MVP.

Google OAuth is deferred; credential availability remains unverified. Implement the approved anonymous fallback first:
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
- AI review supplements automated checks and human review. Follow the review and authorization rules in CLAUDE.md.
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
- Phase 2 is already merged into main. Validate the hero flow before the next deployment; do not repeat the merge.
- Don't deploy right before a demo.

## 7. Known gaps and decisions

- **Undo drops tips:** undoing an edit restores the pre-edit snapshot, so tips added after that edit disappear. Accepted for now.
- **Appliance popovers** don't prefetch alternatives, to save Gemini quota. "I don't have this" runs immediately.
- **Soy sauce is flagged as gluten** on purpose (most contains wheat). "Nut-free walnut pesto"-style contradictions can slip through the two-word negation strip. That's an accepted trade-off.
- **Search page:** the mock agent has `liveUrl: null`, so the page shows a placeholder animation. A real Browser Use live URL renders in a sandboxed iframe, https only, with an "Open live view" fallback.
- **External integrations:** Google OAuth, real Browser Use, ElevenLabs and the domain remain unfinished. Current credential availability is unverified; stubs/contracts do not mean the providers are implemented.

- **Hero timeout mismatch resolved locally:** missing-appliance edits now get a 45 s client timeout against the 40 s server budget.
- **Unwired controls:** Save, Share, Start cooking, Sign in, and production allergy settings; My Kitchen links to a missing page. Complete in their respective phases.
