# Saffron

Start with `docs/HANDOFF.md` (current state and next tasks), then `CLAUDE.md` (project rules) and `docs/PRD.md` (the spec).

## Cross-agent continuity (Claude Code and Codex)

- At the start of a session, read the latest on-disk handoff and follow the **Session handoff** workflow in `CLAUDE.md`. Inspect the current branch, working tree, and relevant recent Git history, including merges into `main` since the handoff's recorded baseline.
- Use the PRD for intended behavior and code plus Git history for implementation evidence. If the handoff is stale, check for newer commits before choosing work; do not repeat completed tasks or start a full audit unless requested or justified by a specific unresolved problem.
- After completing a development task, update `docs/HANDOFF.md` with the baseline, completed work, tested behavior and check results, outstanding bugs, and prioritized next tasks. Clearly distinguish verified results from assumptions and untested behavior; record partial work before handing off an unfinished task.
- Preserve useful setup knowledge (commands, prerequisites, env variable names, non-secret settings, and machine-specific limitations), never secret values. AI review supplements automated checks and human review; it does not replace human judgment or authorize a commit, merge, or deployment.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
