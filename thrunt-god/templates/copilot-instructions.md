# Instructions for THRUNT

- Use the thrunt-god skill when the user asks for THRUNT or uses a `thrunt-*` command.
- Treat `/thrunt-...` or `thrunt-...` as command invocations and load the matching file from `.github/skills/thrunt-*`.
- When a command says to spawn a subagent, prefer a matching custom agent from `.github/agents`.
- Do not apply THRUNT workflows unless the user explicitly asks for them.
- After completing any `thrunt-*` command (or any deliverable it triggers: feature, bug fix, tests, docs, etc.), ALWAYS: (1) offer the user the next step by prompting via `ask_user`; repeat this feedback loop until the user explicitly indicates they are done.
