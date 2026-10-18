# Saffron — handoff for the next agent

Last updated 2026-10-18 by Codex. Read AGENTS.md, CLAUDE.md, and relevant PRD sections. Code and Git history establish implementation; the PRD defines intended behavior.

## 1. Current baseline and verification

- **Latest session: browser validation is blocked.** Started on clean **codex/saffron-next at 0ff530e**. Fetch on 2026-10-18 found origin/main still at c35e97a; no newer main commits to reconcile. The user requires real-browser validation of Task F before starting cook/voice. No new major feature was started.
- The browser connector still reports no apps/browsers. The computer-use skill found Firefox and opened an isolated private window, but its first window-state request was stopped by the platform: **“Computer Use has been stopped for this turn because browser URL policy enforcement is not yet supported for the current Windows browser.”** No application page interactions, save/share validation, or screenshots occurred. Do not bypass this policy stop with another automation technology; a supported browser connection is needed.
- **Configured DATABASE_URL was treated as potentially production.** One 5-second connectivity probe used TLS, connection-level default_transaction_read_only=on, a READ ONLY transaction, and a 5-second statement timeout. It returned **CONNECT_TIMEOUT**. No database writes, migrations, live-record queries, or repeated port probes occurred. Connectivity, credentials, and expected schema remain unverified. A network change/hotspot may resolve the known venue limitation.
- Added `scripts/check-db-connectivity.mjs`: a reusable read-only SELECT 1 / table-existence probe with redacted configuration/constructor/query/cleanup errors. It strips URL startup options that could override safety settings, enforces a 6-second total probe deadline plus at most 1 second for forced cleanup, and fails closed if the server does not confirm read-only mode. **Eight isolated Node regression tests passed without a database connection**, including the installed driver's option precedence and stalled-connection handling. Run `node --test scripts/check-db-connectivity.test.mjs`. Running the actual probe again is unnecessary until network conditions change.
- **Latest attempt's checks:** application typecheck, lint, 915 Vitest tests across 57 files, and production build were rerun and passed. The final probe changes also passed the eight standalone Node tests, targeted ESLint, and diff checks. Independent read-only review caught the URL-option/timeout issue; final re-review found no remaining concrete blocker in the probe. No browser workflow or live database transaction was verified. No production migrations, production writes, pushes, merges, or deployments occurred.
- Local PostgreSQL provisioning was attempted only in a new disposable loopback cluster, then stopped when browser automation was blocked. Its task-owned process was stopped gracefully; its PID and postmaster.pid are absent. No fixtures, reusable connection env file, or ready marker were produced. Unverified partial setup scripts are preserved outside the repository at `C:\Users\Shot\AppData\Local\Temp\saffron-browser-postgres-20261018\dev-db.mjs` and `dev-db-stop.mjs`; isolated binaries are in that same directory. The stopped, unfinished data directory is `C:\Users\Shot\AppData\Local\Temp\saffron-browser-db-sj0gdG`. These are partial artifacts, not a working test database; no existing services or production data were modified.
- **Task F was committed locally as 0ff530e.** Its implementation baseline was c35e97a, merge PR #5 from codex/saffron-recovery (d5d49e5). Tasks B–E are already merged. Do not repeat those implementations, audits, or merges.
- This task implements **Task F / Phase 5 anonymous save/share**. Code/tests/docs in this branch are the local Task F work; see the commit containing this handoff. No push, merge, deployment, or migration occurred. Those actions still require approval. Next unfinished implementation: **Task G cook mode/timers/voice**.
- Historical recovery baseline: 795 passing tests, typecheck, lint, build.
- **Task F checks at 0ff530e:** `npm run typecheck`, `npm run lint`, **`npm test`: 915 passing tests across 57 files**, `npm run build`, and `git diff --check` passed after the failed-create recovery fix and production cookie hardening. New API and /my, /s, /fork, /kitchen routes are present in the build. These are historical results until superseded by the latest session's check record.
- Local production HTTP smoke on port 3010: /kitchen returned 200 with browser-ownership disclosure; /api/recipes returned an empty cookie-free 200; private API/page requests without cookies and invalid share slug returned 404 without a cookie. A foreign-origin create returned **503**, because local production lacked an acceptable HTTPS APP_URL: the fail-closed configuration guard worked before identity/DB access. Valid-production-config 403 behavior is unit-tested. These checks deliberately avoided live DB access. The server was stopped.
- Independent review found pending-edit loss on SPA navigation, first-use cookie races, nullable image DTOs, initially-open allergy hydration, cached Back/forward payload risk, and loss of the recovery anchor after failed Save as new creation. These were addressed with regression coverage. Earlier reviewers hit usage limits; a subsequent independent final read-only review completed and found no remaining concrete blocker. Direct final review also completed. AI review supplements the passing checks and does not replace human review or authorize production actions.
- `cua.getState()` reported no apps/browsers. **Browser interactions/visuals, live PostgreSQL concurrency/connectivity, Gemini, Browser Use, and voice remain unverified.** DB tests compile actual Drizzle SQL against a scripted driver, not a live Postgres instance.

## 2. Resume here

1. Re-read latest files and inspect branch/status/history, including new main merges. Preserve unfinished edits. Do not restart recovery work or a full audit.
2. **Resolve the supported-browser prerequisite first.** Task F is implemented; the user explicitly gates new major features on browser validation. Use a verified isolated local test database for writes: DATABASE_URL may be production, and production data/live users must not be modified. Test Save → edit/autosave → reload → share in another browser profile → Make it mine → save fork; immediate navigation during debounce; two-tab conflict; simultaneous first saves; cookie-loss 404; allergy offline/retry; and saved chat. See [anonymous saves](ANONYMOUS_SAVES.md). No production migration is needed or allowed.
3. **After validation, next implementation: Task G / Phase 6**. Implement cookStore/timers, cook UI, then voice turn/Web Speech/wake word/tools. No cook implementation has been started.
4. Task H: real-service validation, browser rehearsal, cache warming, deployment. Production/remote actions require approval. Unit tests/build do not establish live readiness.

## 3. Implementation status

| Area | Current implementation |
|---|---|
| Scaffold, schema, migrations, UI mocks | On main; deployment configuration exists |
| Import / recipe page | On main; historical live success, not rerun here |
| Hero | Engine/store/routes/allergen guards and recovery lifecycle fixes merged |
| Search | Landing, constraints, deadline links, API/SSE/cache/mock lifecycle merged |
| Display controls | Servings, units/temperatures, start-by/ETA and step clocks merged |
| Chat | Routing/transforms/context/local history merged; saved text/context now in DB |
| Save/share/kitchen/allergies | Task F implemented in this branch; browser/live acceptance pending |
| Cook/voice | Contracts/mocks only; cookStore actions still throw not implemented |
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
