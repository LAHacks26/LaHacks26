- Run /model and pick Opus at high or xhigh effort. Both docs say to use it for planning.
  - /grill-me isn't installed in this session, though the docs mention it. Either install it with npx skills add mattpocock/skills -s grill-me -g -a claude-code -y 

Write or dictate a few hundred words about your idea: what it is, who it's for, the problem it solves, what a user does step by step, and what the demo should show.
  1. Run /jmo-workflow:interview (or /grill-me) and paste that text. I'll keep asking questions until there are no gaps left.
  2. Run /lavish and say "show the app flow." A diagram opens in your browser, and you can click on parts of it to leave comments for me.
  3. Go back and forth between steps 2 and 3 until the plan feels solid.
  4. Say: "Write the final plan to docs/PRD.md, pick a stack and hosting, fill in the stack and run/test commands in CLAUDE.md, and commit." For a quick JavaScript site, Next.js on
     Vercel is the easy choice, and Supabase works if you need a database.

    
Say: "Generate UI mocks from docs/PRD.md."
  7. Polish them with /jmo-workflow:better-ui and /jmo-workflow:animate.
   use paper as well

Phase 3: Build

  8. Say: "Scaffold the app and deploy a hello-world to Vercel." Do this in the first hour.
  9. Press Shift+Tab to enter plan mode, then say: "Split the build into sub-tasks, build each with the builder agent, have the reviewer agent check every change, and commit after each
     working sub-task."
     - I coordinate the work. The builder agent (Haiku) writes the code, and the reviewer agent (Sonnet) checks it. You don't call these agents yourself.
     - I'll only run agents in parallel when they work on separate files, like frontend vs. backend, and never more than 3–5 at once.

  Phase 4: Test

  10. Run /agent-browser and say: "Click through every part of the site and fix what breaks."
  11. Cut features if time runs short, keep main working, and rehearse the demo.

  Habits during the session

  - Run /compact when context gets to about 60% full, and /clear when you switch to an unrelated task.
  - Each teammate works on their own short branch and runs git pull before starting. Never force-push to main, and never commit .env.
  - When I make a mistake, tell me to add a rule to CLAUDE.md so it doesn't happen again.