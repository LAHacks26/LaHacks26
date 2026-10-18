# LA Hacks 2026 project

Stack, run and test commands: TBD — fill in once the PRD is final (or rerun `/init`).
Update this file after every mistake an agent makes so it doesn't repeat.

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
