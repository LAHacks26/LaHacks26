# Saffron — handoff for the next agent

Last updated 2026-10-18 by Claude Code (Opus). Read AGENTS.md, CLAUDE.md, and relevant PRD sections. Code and Git history establish implementation; the PRD defines intended behavior.

## 1. Current baseline and verification

- **Latest session (Claude Code, David's laptop): browser validation of Task F and the AI flows is done.** Branch **claude/browser-validation**, started clean at **b8cf77b** (merge of PR #6, codex/saffron-next). `git fetch` on 2026-10-18 showed origin/main also at b8cf77b. The fixes below are committed locally on this branch; nothing was pushed, merged or deployed.
- **Production DB untouched.** The read-only probe (`node scripts/check-db-connectivity.mjs`) against the configured Tiger URL returned **CONNECT_TIMEOUT** again on this network (known venue/port block; not debugged). All browser writes went to an **isolated local test DB**: Docker container `saffron-test-db` (`pgvector/pgvector:pg16`, TLS on via the image's snakeoil cert because `src/lib/db/client.ts` forces `ssl: "require"`), published only on `127.0.0.1:54329`. Migrations were applied by piping `drizzle/0000_*.sql` and `0001_*.sql` into `psql` inside the container, deliberately **not** `npm run db:migrate` (drizzle.config.ts falls back to the production URL in `.env.local`). The probe confirmed connected/read-only/all tables; `log_connections` proved the dev server's connections reached the container. The random local password lives only in the session scratchpad, not the repo.
- How to repeat: start the container (see §4), then run `npm run dev` with `DATABASE_URL=<local url>` exported in the shell. `@next/env` never overrides a variable already set in the process, so `.env.local`'s production URL is ignored. Use the same override for `npm run build`.
- **Gemini latency finding (config, not code):** with `GEMINI_FAST_MODEL=gemini-3.5-flash-lite`, every `suggest-swaps` call hit the 10s fast-tier timeout (504). A direct 12-token call took 9.3s; network RTT to the API host was ~0.1s. `gemini-3.1-flash-lite` answered in 1.1s, and the configured **fallback `gemini-3.7-flash` did not answer within 60s**. Validation ran with `GEMINI_FAST_MODEL=gemini-3.1-flash-lite` set in the dev server's process env; `.env.local` was not edited. **Recommendation for David:** set fast = `gemini-3.1-flash-lite` in `.env.local` and the VM env, and pick a fallback that responds. Re-measure before the demo; latency changes.
- **Browser-validated (agent-browser, headless Chrome, sessions a/b/c = separate profiles):**
  - Import: pasted the Allrecipes butter-chicken URL → fetch, normalize, embed, upsert → recipe page (26.6s, smart tier close to its 30s budget). The "mn" byline is the real JSON-LD author. Loopback URL → "That link can't be imported." (SSRF guard, no AI call).
  - Hero: cream → coconut milk (after fix), salt → "with sugar" rejection with 3 alternatives, phrase select → Explain → saved tip, Oven → "I don't have this" (preheat removed, bake → skillet with 165°F note, 60 → 50 min, toast "· 3 lines changed · Undo"), Ctrl+Z undo. Bare text in the popover box is a question by design; substitutions need the `with …` prefix.
  - Chat: "make it dairy-free" → butter → vegan butter, with summary and Undo.
  - Search: "butter chicken" + Ready by → cached strip, mock agent log, 3 candidate cards with "Contains dairy" labels (42s). The candidate opens with "Start by 6:45 AM · ready 7:30 AM" and per-step clock times. Servings 4 → 6 and Metric are display-only.
  - Save/share: Save → `/my/<id>` (users row `anon:<sha256>`, HttpOnly cookie, undo stack and chat stored). Autosave PATCH after undo; reload keeps edits and chat. Share → 192-bit slug. Session b sees a read-only page (no popovers/chat, no cookie set, no chat/IDs in HTML). Make it mine → fork saved under a different owner with `forked_from_id`. Cross-owner and cookie-less `/my` and `/api/recipes/<id>` → not available/404.
  - Autosave edge cases: SPA navigation inside the debounce stores a sessionStorage draft; returning recovers it and PATCHes once. Two tabs: stale tab → 409 → "Save as new recipe" creates a copy and leaves the original. Two first-time saves raced in a fresh profile (2s fetch delay injected) → one owner, serialized ~2.1s apart by the Web Lock. Cookies cleared → "isn't available in this browser".
  - My Kitchen lists only the owner's recipes and labels shared ones. Allergies: Dairy saved (PUT 200, DB updated), ⚠ dairy badge on butter. With the endpoint failing (in-page fetch rejection), local choices stayed, the message and "Retry sync" appeared, and the retry synced.
- **Bugs found and fixed in this session (with regression tests):**
  1. **Smart cascade incomplete (hero, PRD §3 step 4).** The fast model swapped the ingredient but left "combine cream, …" in a step that lists it. New `src/lib/ai/cascade.ts` flags untouched steps that use a renamed ingredient and still name it. `runValidatedEdit` retries once with those IDs; if the retry fails or is still incomplete, it returns the valid patch rather than failing the edit. Hard problems (IDs, allergens) behave as before. Re-tested live: the step now says "combine coconut milk, …". Applies to chat transforms too.
  2. **Ready-by shown in UTC on the search page.** Picking 7:30 AM in PDT showed "Ready by 2:30 PM": `readyByClock` read digits from the `toISOString()` value. It now uses local time (client-only; `meta` arrives over SSE). Re-tested live: "Ready by 7:30 AM". The test pins `TZ=America/Los_Angeles` and fails on the old code.
- **Checks on the committed state:** `npm run typecheck`, `npm run lint`, `npm test` (**933 tests, 58 files**), `npm run build` (with the local DB URL override) and `git diff --check` all passed. The reviewer agent approved the fixes. Its suggestions (heuristic stopwords, two control-flow tests, docstring) were applied. AI review supplements, and does not replace, human review.
- Not verified this session: live Tiger connectivity/schema, real Browser Use, ElevenLabs, deployment. Tooling notes: agent-browser `wait --load networkidle` never settles under `next dev` (HMR socket), so wait on text/URL instead. Its clicks don't scroll targets into view in a short viewport, so use `set viewport 1280 1000` and `scrollintoview`. `network route --abort` did not intercept same-origin fetches here, so simulate outages in-page.
- Task F (anonymous save/share) is on main via PR #6; Tasks B–E merged earlier. Do not repeat those implementations or audits. Historical Codex records: [anonymous saves](ANONYMOUS_SAVES.md), and `scripts/check-db-connectivity.mjs` with its 8 standalone tests (`node --test scripts/check-db-connectivity.test.mjs`).

## 2. Resume here

1. Re-read latest files and inspect branch/status/history. Preserve unfinished edits. Do not redo the browser validation above unless the related code changes.
2. **Task G / Phase 6 (in progress on claude/browser-validation):** cookStore/timers, cook UI, then voice turn/Web Speech/wake word/tools. See the Task G section for status.
3. Task H: live Tiger DB check on a network that allows port 31015 (phone hotspot), cache warming, rehearsal of PRD §3 on the deployed domain, deployment. Production/remote actions require approval.

## 3. Implementation status

| Area | Current implementation |
|---|---|
| Scaffold, schema, migrations, UI mocks | On main; deployment configuration exists |
| Import / recipe page | On main; browser-validated 2026-10-18 with live Gemini + local DB |
| Hero | On main; browser-validated; smart-cascade check added on claude/browser-validation |
| Search | On main; browser-validated with mock agent; ready-by timezone fix on claude/browser-validation |
| Display controls | Servings, units/temperatures, start-by/ETA and step clocks; browser-validated |
| Chat | Routing/transforms/context; saved text/context in DB; browser-validated |
| Save/share/kitchen/allergies | Task F on main (PR #6); browser-validated against the local test DB |
| Cook/voice | Task G in progress on claude/browser-validation |
| Deployment | Current live version unverified; historical handoff reported mocks-only site |

### Completed recovery: Tasks B–E (merged)

- Hero sessions own cancellation/edit locks; navigation permanently invalidates requests, including A → B → A. Explanations are version-bound; stale edits retry once. Existing popover/selection fixes should not be reimplemented.
- Landing submits text/constraints/allergies/deadline to search and URLs to import. Deadlines propagate through links and working copies. Cached/normalized candidates share dietary/equipment checks; allergens stay visible. Import callers remain isolated across shared preparation/normalization. Mock tasks expire/clean up; the search registry retains SSE replay.
- Servings 1–100, US/Metric and temperature conversion, and step clock times are view-only. AI receives canonical quantities/text.
- Chat handles intent routing, targeted edits, transforms, patch/allergen validation, context chips, and local history. Hero/chat share one edit lock. History cap 200, last 20 sent to AI. Client budgets: ordinary AI 30s, missing appliance 45s (server 40s), chat 75s.
- Remaining acceptance: browser navigation/popovers/selection and real-service demo steps. Task F changed no AI prompts and made no live Gemini calls.

### Task F: anonymous save/share (implemented)

User approved anonymous device-cookie ownership on 2026-10-18. Google sign-in/account linking is deferred; this decision needs no new confirmation. Details and limitations: [ANONYMOUS_SAVES.md](ANONYMOUS_SAVES.md).

- `src/lib/auth/viewer.ts`: server-only random UUID v4 cookie, __Host-saffron_uid in production / saffron_uid in development; HttpOnly, SameSite=Lax, host-only, path /, one-year life, Secure in production. The production prefix blocks sibling-domain cookie tossing; there is no fallback to the development name. Only SHA-256 bearer digest stored as users.google_sub = anon:<digest>. Reads never provision identity; unknown supplied tokens are never adopted. Existing tables suffice.
- `src/lib/saved/*`, `/api/recipes*`, `/api/me/allergies`: owner-scoped private recipe/chat reads/writes, uniform private 404s, exact Origin/fetch-metadata checks, bounded validated JSON, generic errors, no-store API responses. Production requires HTTPS APP_URL. Save creation/allergy PUT use a shared Web Lock across tabs; a current browser supporting Web Locks on HTTPS or localhost is required.
- Recipe/undo/deadline/chat persist transactionally. Opaque updatedAt token preserves PostgreSQL microseconds; stale updates return 409 without changing chat. Public slugs are random 192-bit values, idempotent under a parent-row lock. Sharing preserves autosave tokens. Public DTO contains recipe/slug only, excluding owner/saved IDs, chat, undo, and deadline.
- Save moves to /my/[id]. Share flushes pending changes before creating/copying a link, with selectable-link fallback. Shared views have no popovers/chat. Make it mine opens /fork/[slug]?draft=<uuid> as an isolated unsaved copy; saving resolves public lineage on the server.
- Autosave debounces one second, serializes writes, and includes edits made during in-flight requests. Conflicts offer Save as new recipe / Reload saved version. Pending saved recipe/chat drafts persist per-tab in sessionStorage with server token (memory fallback for SPA navigation); restoration follows an owner-checked read. Failed Save as new retains its original recovery identity, subsequent edits, exit warning, and separate-copy intent; recovery requires an explicit retry and never silently updates the original. Saved loaders fetch current data on activation/Back. Separate editor keys isolate saves/forks sharing a public source.
- Chat text/context persist in chat_messages. Transient result attachments and version-specific Undo buttons are not reconstructed after reload; recipe undo snapshots remain. Saved private chat loads from the server; pending drafts take precedence only through recovery.
- /kitchen lists owner recipes with loading/error/retry/empty states. Production header links work; browser ownership replaces inert sign-in. Local/server allergies merge initially; PUT replaces explicit choices. Changes notify same-tab subscribers immediately; failures retain local choices and offer retry. Initially-open sheets accept hydration until edited.
- Added tests cover cookie flags/hash/fixation, two-viewer API denial, compiled SQL owner predicates, transaction rollback, microsecond CAS, public projection, fork validation, body/CSRF limits, same-source saved-session isolation, debouncing/in-flight changes/retries/conflicts, navigation draft recovery, fresh loader reads, identity locking, and kitchen/allergy races.

### Task G: cook mode and voice (next)

Contracts: `src/lib/voice/types.ts`, `src/lib/store/cookStore.ts`. Mocks: `src/components/cook/*`, /mocks/cook.

1. Implement focused/done steps and timers with endsAt persisted at saffron:cook:<key>. Use editor identity to distinguish saves/forks of the same source.
2. Wire Start cooking, dimmed steps, timer chips/tray, Web Audio chime. Production Start cooking is explicitly disabled until implemented.
3. Add /api/voice/turn and lib/ai/voice.ts: one Gemini fast call returning {say, toolCalls}, using a flat schema.
4. Add wakeword matcher/tests, WebSpeechProvider, shared tool dispatch to cookStore and /api/ai/chat, ElevenLabs stub until real integration. Respect Gemini quota rules.

### Task H: later acceptance/deployment

Validate live DB/Gemini and browser interactions, warm cache with seed/demo searches, rehearse PRD §3 twice. Deploy only with approval. Real Browser Use, ElevenLabs, Google linking, and final domain remain separate unfinished integrations.

## 4. Setup knowledge (no secrets)

- Remote: https://github.com/LAHacks26/LaHacks26.git. Current Node reports **v24.20.0**; package engines >=22, historical recovery Node 22. Locked install: npm ci. Root dependencies were already present; builders installed isolated copies.
- This tool shell required prepending `C:\Program Files\nodejs` to PATH for Node/npm. Commands: npm run dev, npm run typecheck, npm run lint, npm test, npm run build.
- Secrets belong in ignored repo-root **.env.local**, including leading dot. Transfer privately. env.local/env.local.download are neither loaded nor covered by the .env.* ignore rule. Never print or commit secrets.
- Required existing names: GEMINI_API_KEY, DATABASE_URL, GEMINI_FAST_MODEL, GEMINI_SMART_MODEL, GEMINI_FALLBACK_MODEL, GEMINI_EMBED_MODEL. Populated settings are not connectivity proof.
- **APP_URL** now gates save/allergy Origin: match local dev origin/port; required HTTPS public URL in production. .env.example documents this. Google auth settings are deferred. No new env names added.
- Historical working models: fast gemini-3.5-flash-lite, smart gemini-3-flash-preview, fallback gemini-3.7-flash; .env.example has older defaults. Not a current availability guarantee; preserve working private config.
- Build downloads Inter/Fraunces from Google Fonts, requiring network access. Earlier restricted npm install failed on cache/exit-handler; network-enabled install succeeded. Historical audit reported 13 vulnerabilities (4 moderate, 9 high); no forced updates applied.
- Venue Wi-Fi historically blocks Tiger Postgres port 31015. Use a hotspot if DB calls time out; do not debug code or probe ports to bypass this known limitation. Current DB connectivity remains unverified.
- **Local test DB (Docker Desktop must be running):** `MSYS_NO_PATHCONV=1 docker run -d --name saffron-test-db -p 127.0.0.1:54329:5432 -e POSTGRES_USER=saffron -e POSTGRES_PASSWORD=<random> -e POSTGRES_DB=saffron_test pgvector/pgvector:pg16 -c ssl=on -c ssl_cert_file=/etc/ssl/certs/ssl-cert-snakeoil.pem -c ssl_key_file=/etc/ssl/private/ssl-cert-snakeoil.key`. Without `MSYS_NO_PATHCONV=1`, Git Bash rewrites the cert paths. Apply schema with `cat drizzle/0000_enable_pgvector.sql drizzle/0001_init.sql | docker exec -i saffron-test-db psql -v ON_ERROR_STOP=1 -U saffron -d saffron_test`. Put `DATABASE_URL=postgres://saffron:<random>@127.0.0.1:54329/saffron_test` in a file outside the repo and pass it to `node scripts/check-db-connectivity.mjs <file>` to verify. The container from this session may still exist with test data (recipes, three anonymous owners). Remove it with `docker rm -f saffron-test-db` when done.
- On this laptop, killing the shell that runs `npm run dev` can leave `next/dist/server/lib/start-server.js` running on :3000. Check the process creation time and command line, then `taskkill /PID <pid> /T /F`.
- Mock Browser Use needs no key. Copying Google/ElevenLabs/Browser Use credentials alone does not implement those integrations.

Historically seeded sources (DB presence not rechecked):

| Recipe | Source ID |
|---|---|
| Easy Indian Butter Chicken (oven + cream hero) | f0a8dd5a-4a78-4aa9-974d-3deaa8570896 |
| Chicken tikka masala | 1cd3ee5b-54e6-44aa-be5a-e1e0d9ec8941 |
| Spinach & chickpea curry | c8d0897c-9d97-44f8-af67-d81aa137a1b5 |
| Mac and cheese | 8992ffb5-d680-4624-b857-fda1ab3377a2 |
| Chocolate chip cookies | 3ab04875-2e45-4cce-b658-8b65e0baee91 |

## 5. Conventions and known limitations

CLAUDE.md wins. Recipe/AI contracts are frozen and require deliberate coordinated changes (Task F did not change the frozen schema). No CSS modules; cream/light theme; read bundled Next guides; Cache Components off; error boundaries use retry. Every server-side user-URL fetch goes through SSRF-guarded fetchPage. Fence scraped/client prompt text with untrusted.ts. Plain-text prompts override the JSON-only system preamble. Send local allergies on every AI request; retain deterministic server allergen checks.

Anonymous access is browser-specific and unrecoverable after cookie loss/expiry. Shares expose later saved recipe edits; no share-revocation/account-linking UI. A timed-out initial save may have committed: inspect My Kitchen before retrying. Failed creation may leave an unused anonymous row. Pending drafts are per tab; keep a tab open after failed saves. Real DB concurrency/browser behavior are untested; detailed acceptance checklist is in ANONYMOUS_SAVES.md.

Accepted existing gaps: undo restores a snapshot and drops tips added after that edit; appliances do not prefetch alternatives to save quota; dietary/equipment checks are heuristic; soy sauce deliberately flags gluten; “nut-free walnut pesto” contradictions may evade negation stripping. Cache threshold 0.64 comes from historical tuning, not this session. Mock search has no live iframe; real Browser Use is unfinished.

Historical Gemini key: free tier (~5 requests/min plus a small per-model daily cap). Do not make live loops/check calls without prompt/schema changes. A 429 with PerDay means stop until reset or use an available configured model. Project owner should enable billing before rehearsal; billing/availability were not reverified.

Deployment: Vultr VM, pm2/Caddy, /home/saffron/app; saffron SSH alias/key on David's laptop. Before an approved deploy verify curl, private model config, HTTPS APP_URL, and Caddy unbuffered explain-stream config. Do not deploy immediately before a demo. Never force-push main or commit secrets. Local commits do not authorize push/merge/deploy/migrate.
