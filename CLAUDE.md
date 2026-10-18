# Saffron (LA Hacks 2026)

A recipe browser: a Browser Use agent finds recipes, Gemini rewrites them into a clean layout, and every line can be clicked to ask about it, substitute it or adapt it. The spec is `docs/PRD.md`; it is the source of truth. Current progress and the next tasks are in `docs/HANDOFF.md`; update it when you finish a task.
Update this file after every mistake an agent makes so it doesn't repeat.

## Session handoff (Claude Code and Codex)

### Starting or resuming work

- Read the latest on-disk `docs/HANDOFF.md`, `AGENTS.md`, this file, and the relevant PRD sections. Do not rely solely on a previous agent's conversation summary.
- Check `git status --short --branch` and relevant recent commits, including merges into `main` and changes to the files involved in the next task. Compare them with the handoff's recorded branch and commit; if no baseline is recorded, use the last handoff commit as a starting point.
- When the handoff is stale or remote freshness matters, check for newer commits. Fetch remote refs when network access and the user's scope permit, then inspect the relevant history without automatically pulling, switching branches, or merging. If fetching is unavailable or the task is strictly read-only, state that remote freshness is unverified.
- Treat the PRD as intended behavior and code plus Git history as implementation evidence. Reconcile discrepancies with targeted inspection. Reuse prior verified findings when the relevant code and environment have not changed; do not redo completed implementation or an entire audit by default. Run the checks required for the current task, and expand investigation only for new failures, relevant changes, or unresolved risks.
- Preserve existing edits and unfinished work. Identify what is already implemented, what remains unverified, and the next concrete task before making changes.

### Completing or handing off work

- Update `docs/HANDOFF.md` after each completed development task and before handing off unfinished work, within the user's authorized file scope. If documentation edits are excluded, provide the handoff details in the response instead and state that the file was not updated.
- Record the date, branch, and commit baseline used for verification. Identify uncommitted work separately; distinguish local completion from merged or deployed status.
- Summarize completed behavior and relevant files, exact checks run and their results, tested user flows, and anything skipped, blocked, or still untested. Do not carry historical passing results forward as if they were rerun.
- Record outstanding bugs with reproduction steps or supporting evidence, label assumptions and suspected issues, and leave prioritized next tasks with acceptance criteria. Remove or revise obsolete task/status claims so the next agent does not repeat completed work.
- Preserve setup knowledge needed on another machine: runtime/tool prerequisites, installation and build commands, required env variable names, non-secret configuration choices, and network or deployment limitations. Distinguish a populated credential from verified service connectivity. Never copy API keys, tokens, passwords, connection strings, private keys, or `.env.local` contents into documentation or logs; reference the ignored file and private transfer process instead.
- AI review is an additional check, not a replacement for automated validation or human review. Report review findings and remaining uncertainty so the user can assess the change. Review does not grant permission to commit, merge, push, or deploy; follow the user's instructions for those actions. This clarification takes precedence over older handoff wording that says no human reviews code.

## Stack
- **Next.js** (App Router, TypeScript, `src/` directory). One app holds both frontend and API routes. Node runtime only, never edge.
- **Tailwind CSS v4 + shadcn/ui**, lucide icons, `motion` for animation. **Light theme only** (cream). Design tokens live in `src/app/globals.css`. Fonts: Fraunces (display) and Inter (body).
- **zod v4** for shared schemas. `src/lib/recipe/schema.ts` is the frozen contract between frontend and backend: do not change it inside a builder task; ask the orchestrator.
- **Zustand** for client state.
- **Postgres on Tiger Cloud** with pgvector. Drizzle ORM and the `postgres` driver live in `src/lib/db/`; migrations go in `drizzle/`.
- **Gemini** via `@google/genai`. **Browser Use Cloud** and **ElevenLabs** are stubbed until their keys arrive (PRD §13.1).
- **MVP ownership:** anonymous HttpOnly device cookie (approved 2026-10-18). Google/Auth.js account linking is deferred. See `docs/ANONYMOUS_SAVES.md` for access, recovery, sharing and configuration limits.
- **Tests:** vitest. **Hosting:** Vultr VM with pm2 and Caddy. The build needs dev dependencies (Tailwind, shadcn CSS), so deploys run a full `npm ci`, never `--omit=dev`.
- **No CSS modules.** `next.config.ts` routes every `*.css` file through `@tailwindcss/turbopack` as global CSS, so `*.module.css` class imports are `undefined` and fail silently. Use Tailwind classes, or a plain `.css` file with prefixed class names (e.g. `.recipe-glow`) imported once by a client component.
- **Fetch recipe pages with `fetchPage` (curl), never Node `fetch`.** Cloudflare-fronted recipe sites (Allrecipes, Serious Eats, Budget Bytes) return 403 to Node's TLS fingerprint but 200 to curl. Don't add `--compressed`; Budget Bytes 403s with it. `src/lib/ingest/fetchPage.ts` also holds the SSRF guard, so every server-side fetch of a user-supplied URL goes through it.
- **Gemini free tier has a per-minute limit (5/min) AND a small daily cap per model** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`). One evening of builder smoke tests used up the daily cap on `gemini-3.6-flash` and `gemini-3.5-flash`. Don't fire Gemini calls in loops or "just to check". Unit-test against fixtures; make live calls only when a prompt or schema changes. Each model has its own cap, so when one is exhausted, switch the `GEMINI_*_MODEL` vars in `.env.local` (models that worked: `gemini-3.5-flash-lite`, `gemini-3-flash-preview`, `gemini-3.7-flash`, `gemini-3.1-flash-lite`). A 429 body with `PerDay` means wait ~17h or switch models; don't retry.
- **`SYSTEM_PREAMBLE` (`src/lib/ai/prompts.ts`) says "return only JSON".** Any plain-text prompt built on it (explain, chat replies, voice) must restate its output format at the top of its own rules, or Gemini answers in a JSON code fence.
- **Next.js 16.4 differs from most training data.** Read the relevant guide in `node_modules/next/dist/docs/` before using an unfamiliar Next API (see `AGENTS.md`). Cache Components is deliberately OFF in `next.config.ts`; do not turn it on.
- **Saved editors use their saved ID as the session key**, independent of the public source ID. Multiple saves/forks can share a source. Preserve this isolation in hero/chat/cook lifecycle code.
- **Autosave must preserve unsent edits on SPA navigation.** `beforeunload` does not run for Next links. Keep per-tab pending recipe/chat drafts tied to the server revision and recover them only after an owner-checked read; conflicts must not overwrite newer saves. Next Back/forward can reuse page payloads, so saved editors re-read the current owner/revision before activation.
- **Save as new must keep the original recovery identity until creation succeeds.** Persist the separate-copy intent with the pending draft; a failed POST must retain later edits, keep the exit warning, and never recover into automatic updates of the original recipe.
- **First-use cookie creation must be serialized across tabs.** Both save creation and allergy sync use `withDeviceMutationLock`; otherwise concurrent responses can issue different owners and strand a save. Keep the lock around the entire request and response. Do not put a browser token or owner ID in localStorage or client payloads.
- Production identity uses the `__Host-` cookie prefix with Secure, path `/`, and no Domain. Do not accept the development cookie name in production; host-only cookie attributes alone do not prevent sibling-domain cookie tossing.
- **Ready-by deadlines are stored as UTC ISO strings (`toISOString()`).** Never read the wall-clock digits out of the string; convert with `new Date(iso)` and local getters, and only on the client (the server's timezone differs from the user's).
- **Browser tests that write data use a local Docker DB, never the `.env.local` URL.** Export `DATABASE_URL` for the local container in the shell before `npm run dev`/`build` (`@next/env` keeps an existing process value). Apply migrations with `psql` inside the container; `drizzle.config.ts` falls back to `.env.local` (production) if the variable is missing. Recipe and steps are in `docs/HANDOFF.md` §4.
- **Nullable SQL JSON fields need explicit DTO normalization.** `->>` returns null for missing values; a TypeScript annotation does not turn it into undefined. Initial-open settings must also accept loaded data until the user edits, so delayed hydration cannot erase stored allergies.

## Commands
- `npm install`, then `npm run dev` (http://localhost:3000).
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- `npm run db:generate` writes SQL migrations to `drizzle/`. `npm run db:migrate` applies them and needs `DATABASE_URL` in `.env.local`.
- Before reporting a task done, run: `npm run typecheck && npm run lint && npm test && npm run build`.
- **Visual feedback (Agentation):** in `npm run dev` only, a toolbar (bottom-right) lets you click any element and leave a comment. Comments sync to Claude Code through the `agentation` MCP server (`npx -y agentation-mcp server`, HTTP on `localhost:4747`, registered in David's local Claude config). Read them with the `agentation_*` tools, fix, then resolve them. It never renders in production builds.
- **Deploy** (Vultr VM, live at https://96-30-204-210.sslip.io): push the branch, then `ssh saffron 'sudo -iu saffron bash app/scripts/deploy.sh <branch>'` (default branch `main`). The `saffron` SSH alias and key are on David's laptop. Production env lives in `/home/saffron/app/.env.local` on the VM; update it with `scp`, never git. If you change `deploy/Caddyfile`, copy it to `/etc/caddy/Caddyfile` and run `systemctl reload caddy`. Don't deploy right before a demo: a failed build leaves the site degraded until the next good deploy.

## Env
Copy `.env.example` to `.env.local` and fill it in. Never commit any `.env*` file except `.env.example`. When you add an env var, add it to `.env.example` in the same change.

**Database access:** the venue Wi-Fi blocks outbound Postgres ports (Tiger uses 31015), so DB connections from the laptop time out there. Ports 443 and 8080 work. Anything that touches the DB from the laptop (`npm run db:migrate`, DB-backed pages in `npm run dev`) needs a phone hotspot. If a DB call times out, ask the user to switch networks; don't debug the code or probe ports.

Treat the configured DATABASE_URL as potentially production until verified. Browser save/share validation must use a separately verified local test database; do not start a write-capable validation app with the unknown URL. `node scripts/check-db-connectivity.mjs` performs a bounded read-only connection/schema check and outputs only booleans/safe error codes. Keep configuration parsing and driver construction inside its redaction boundary, and suppress cleanup errors and notices so an invalid URL cannot expose credentials through a raw stack trace. Strip URL startup parameters before passing explicit read-only/timeout options: postgres.js lets URL parameters override connection settings. A whole-operation deadline and forced cleanup are needed because connect_timeout ends after establishing a connection. Its regression tests use `node --test scripts/check-db-connectivity.test.mjs` without any database connection. A browser automation policy stop must be resolved through a supported surface rather than an alternate automation technology.

## Workflow
1. **PRD** — Opus, high effort. Expand the idea with `/grill-me` (or `/jmo-workflow:interview`), review the app flow with `/lavish`, loop between the two. Save the PRD in `docs/PRD.md`.
2. **UI mocks** — generate mocks from the final PRD; polish with `/jmo-workflow:better-ui` and `/jmo-workflow:animate`.
3. **Build** — Opus orchestrates. Split work into sub-tasks, hand each to the `builder` agent (Haiku), and have the `reviewer` agent (Sonnet) review every change before it is committed. AI review supplements automated checks and human review; surface findings and remaining risks for the user rather than treating agent approval as sufficient assurance.
4. **Test** — use `agent-browser` to click through every part of the site and fix what breaks.

## Subagent rules
- Give each subagent exact file paths, the goal, and success criteria — it starts with no context.
- Run parallel agents only on disjoint files (frontend / backend / db). 3–5 at once max.
- For isolation use worktrees; worktrees don't share `.env` or `node_modules`, so copy the env file and run install in each. Merge branches one at a time.
- Agent worktrees (`isolation: "worktree"`) start from `main`, NOT from your current branch. Before spawning them, make sure everything they depend on is on `main`, or merge your branch into each worktree (`git -C <worktree> merge <branch>`) right after spawning. Otherwise builders recreate missing shared files.
- Parallel builders must not run `next build` or `next dev` in the same folder; they clobber `.next`. Use separate worktrees, or have only one agent build at a time.

## Git rules
- Commit after each working sub-task.
- One short-lived branch per person; keep `main` working at all times.
- Never force-push to `main`.
- Never commit secrets; keep `.env.example` up to date instead.

## Habits
- Compact at ~60% context (~35% for Haiku). `/clear` between unrelated tasks.
- Plan mode (Shift+Tab) before big builds.
- Deploy a hello-world early, cut scope aggressively, rehearse the demo.
