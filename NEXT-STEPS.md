# LA Hacks 2026 — Skills & Next Steps

## Skills installed

A **skill** is a set of instructions that teaches Claude one specific job. Run it by typing its slash command, or Claude loads it automatically when your request matches.

| Command | Workflow step | What it does |
| --- | --- | --- |
| `/grill-me` | 1. PRD | You describe your idea; Claude asks question after question until the gaps are filled in. |
| `/jmo-workflow:interview` | 1. PRD | Like grill-me, but saves a written spec to `.plans/` at the end. |
| `/lavish` | 1. PRD | Turns the plan into a visual page (diagrams, app flow) in your browser. Click parts and leave comments for Claude. |
| `/jmo-workflow:better-ui` | 2. UI mocks | Polishes the interface: spacing, icons, visual details. |
| `/jmo-workflow:animate` | 2. UI mocks | Adds purposeful animations. |
| `/jmo-workflow:agentation` | 2. UI mocks | Lets you click parts of the running site and attach feedback to them. |
| `/agent-browser` | 4. Test | Claude opens the site in a real Chrome window, clicks through it, fills forms, takes screenshots, and finds bugs. |

## Agents (for step 3, build)

Agents are separate Claude helpers, defined in `.claude/agents/`.

- **builder** (Haiku): writes the code for one small task at a time.
- **reviewer** (Sonnet): checks every change for bugs before it's committed. It reads code but never edits it.

You don't call these directly. Ask the main Claude (Opus) to "split this into sub-tasks, build them with the builder agent, and have the reviewer check each one."

## Steps

### Now
1. **Restart Claude Code.** Type `/exit`, then run `claude` again in the `lahacks26` folder.
2. **Set the model.** Run `/model` and pick Opus at high (or xhigh) effort for planning.

### Step 1: PRD (do this together as a team)
3. **Write your idea** in a few hundred words: what it is, who it's for, the problem it solves, what a user does step by step, and what the demo should show. Dictation (e.g. Willow Voice) is fastest.
4. **Run `/grill-me`** and paste your paragraphs. Answer Claude's questions until it runs out.
5. **Run `/lavish`** and ask it to show the app flow. Comment on it in the browser.
6. **Repeat steps 4–5** until the plan feels solid.
7. **Save the PRD.** Ask Claude to write the final plan to `docs/PRD.md` and commit it.
8. **Pick the stack and hosting**, then ask Claude to fill in the stack and run/test commands in `CLAUDE.md`.

### Step 2: UI mocks
9. Ask Claude to generate UI mocks from `docs/PRD.md`.
10. Polish them with `/jmo-workflow:better-ui` and `/jmo-workflow:animate`.

### Step 3: Build
11. Deploy a hello-world early (e.g. Vercel for a Next.js app).
12. Press **Shift+Tab** for plan mode, then ask Claude to split the build into sub-tasks.
13. Have Claude build with the **builder** agent and review each change with the **reviewer** agent. It commits after each working sub-task.

### Step 4: Test
14. Run `/agent-browser` and ask Claude to click through every part of the site and fix what breaks.
15. Cut scope where needed, keep `main` working, and rehearse the demo.

## Habits
- Compact at about 60% context (about 35% for Haiku); `/clear` between unrelated tasks.
- `git pull` before starting work. One short branch per person. Never force-push to `main`.
- Never commit secrets (`.env`).

## Teammate setup (each person, on their own laptop)
1. Install Git, Node.js LTS, and Claude Code (Windows: `irm https://claude.ai/install.ps1 | iex` in PowerShell).
2. Clone the repo: `git clone https://github.com/TaDavid7/LaHacks26.git`
3. Install the skills:
   ```sh
   npx skills add mattpocock/skills -s grill-me -g -a claude-code -y
   npx skills add kunchenguid/lavish-axi -s lavish -g -a claude-code -y
   npx skills add vercel-labs/agent-browser -s agent-browser -g -a claude-code -y
   ```
4. Install agent-browser and its Chrome:
   ```sh
   npm install -g agent-browser
   agent-browser install
   ```
5. Install the jmo-workflow plugin:
   ```sh
   claude plugin marketplace add 23jmo/jmo-skills
   claude plugin install jmo-workflow@jmo-skills
   ```
6. Optional: install GitHub CLI and run `gh auth login`.
7. Restart Claude Code.
