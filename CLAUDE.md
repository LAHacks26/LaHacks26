# Saffron (LA Hacks 2026)

A recipe browser: a Browser Use agent finds recipes, Gemini rewrites them into a clean layout, and every line can be clicked to ask about it, substitute it or adapt it. The spec is `docs/PRD.md`; it is the source of truth.
Update this file after every mistake an agent makes so it doesn't repeat.

## Stack
- **Next.js** (App Router, TypeScript, `src/` directory). One app holds both frontend and API routes. Node runtime only, never edge.
- **Tailwind CSS v4 + shadcn/ui**, lucide icons, `motion` for animation. **Light theme only** (cream). Design tokens live in `src/app/globals.css`. Fonts: Fraunces (display) and Inter (body).
- **zod v4** for shared schemas. `src/lib/recipe/schema.ts` is the frozen contract between frontend and backend: do not change it inside a builder task; ask the orchestrator.
- **Zustand** for client state.
- **Postgres on Tiger Cloud** with pgvector. Drizzle ORM and the `postgres` driver live in `src/lib/db/`; migrations go in `drizzle/`.
- **Gemini** via `@google/genai`. **Browser Use Cloud** and **ElevenLabs** are stubbed until their keys arrive (PRD §13.1).
- **Auth.js v5** (Google), added in phase 5.
- **Tests:** vitest. **Hosting:** Vultr VM with pm2 and Caddy. The build needs dev dependencies (Tailwind, shadcn CSS), so deploys run a full `npm ci`, never `--omit=dev`.
- **Next.js 16.4 differs from most training data.** Read the relevant guide in `node_modules/next/dist/docs/` before using an unfamiliar Next API (see `AGENTS.md`). Cache Components is deliberately OFF in `next.config.ts`; do not turn it on.

## Commands
- `npm install`, then `npm run dev` (http://localhost:3000).
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- `npm run db:generate` writes SQL migrations to `drizzle/`. `npm run db:migrate` applies them and needs `DATABASE_URL` in `.env.local`.
- Before reporting a task done, run: `npm run typecheck && npm run lint && npm test && npm run build`.

## Env
Copy `.env.example` to `.env.local` and fill it in. Never commit any `.env*` file except `.env.example`. When you add an env var, add it to `.env.example` in the same change.

**Database access:** the venue Wi-Fi blocks outbound Postgres ports (Tiger uses 31015), so DB connections from the laptop time out there. Ports 443 and 8080 work. Anything that touches the DB from the laptop (`npm run db:migrate`, DB-backed pages in `npm run dev`) needs a phone hotspot. If a DB call times out, ask the user to switch networks; don't debug the code or probe ports.

## Workflow
1. **PRD** — Opus, high effort. Expand the idea with `/grill-me` (or `/jmo-workflow:interview`), review the app flow with `/lavish`, loop between the two. Save the PRD in `docs/PRD.md`.
2. **UI mocks** — generate mocks from the final PRD; polish with `/jmo-workflow:better-ui` and `/jmo-workflow:animate`.
3. **Build** — Opus orchestrates. Split work into sub-tasks, hand each to the `builder` agent (Haiku), and have the `reviewer` agent (Sonnet) review every change before it is committed. Nobody reviews code by hand; the reviewer is the safety net.
4. **Test** — use `agent-browser` to click through every part of the site and fix what breaks.

## Subagent rules
- Give each subagent exact file paths, the goal, and success criteria — it starts with no context.
- Run parallel agents only on disjoint files (frontend / backend / db). 3–5 at once max.
- For isolation use worktrees; worktrees don't share `.env` or `node_modules`, so copy the env file and run install in each. Merge branches one at a time.

## Git rules
- Commit after each working sub-task.
- One short-lived branch per person; keep `main` working at all times.
- Never force-push to `main`.
- Never commit secrets; keep `.env.example` up to date instead.

## Habits
- Compact at ~60% context (~35% for Haiku). `/clear` between unrelated tasks.
- Plan mode (Shift+Tab) before big builds.
- Deploy a hello-world early, cut scope aggressively, rehearse the demo.
