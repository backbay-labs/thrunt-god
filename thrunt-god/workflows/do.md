<purpose>
Analyze freeform text from the user and route to the most appropriate hunt or THRUNT command. This dispatcher never does the work itself. Match user intent to the best command, confirm the routing, and hand off.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="validate">
**Check for input.**

If `$ARGUMENTS` is empty, ask via AskUserQuestion:

```
What would you like to do? Describe the hunt, task, bug, or idea and I'll route it to the right command.
```

Wait for response before continuing.
</step>

<step name="check_project">
**Check if project exists.**

```bash
INIT=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" state load 2>/dev/null)
HAS_HUNT_DOCS=false
if [[ -f .planning/MISSION.md || -f .planning/HUNTMAP.md || -f .planning/HYPOTHESES.md ]]; then
  HAS_HUNT_DOCS=true
fi
```

Track whether `.planning/` exists and whether hunt-native files already exist — some routes require a planning directory, and hunt-native routes should be preferred when the workspace is already in THRUNT mode.
</step>

<step name="route">
**Match intent to command.**

Evaluate `$ARGUMENTS` against these routing rules. Apply the **first matching** rule:

| If the text describes... | Route to | Why |
|--------------------------|----------|-----|
| Hunt help, threat hunting commands, THRUNT usage | `/hunt:help` | Show the hunt-native command surface |
| A signal, detection, suspicious telemetry, IOC, intel lead, or analyst suspicion | `/hunt:new-case` | Starts a scoped hunt case from a concrete signal |
| Standing up ongoing threat hunting coverage, a hunt program, or a campaign | `/hunt:new-program` | Initializes a durable hunt program |
| Mapping telemetry, blind spots, retention windows, tenants, or query surfaces | `/hunt:map-environment` | Builds analyst-usable environment context |
| Turning a signal into hypotheses, scope, datasets, or success criteria | `/hunt:shape-hypothesis` | Shapes the hunt before planning or execution |
| Planning a hunt phase, exact queries, receipt expectations, or a hunt swarm | `/hunt:plan` | Builds a hunt execution plan |
| Running hunts, querying telemetry, swarming across EDR/SIEM/identity/cloud/email | `/hunt:run` | Executes the hunt work |
| Validating findings, reviewing evidence, checking counter-evidence, or confidence | `/hunt:validate-findings` | Tests conclusions against receipts |
| Publishing findings, escalating a case, promoting a detection, or writing a hunt report | `/hunt:publish` | Produces the action-driving hunt artifact |
| Starting a new mission, "set up", "initialize" | `/hunt:new-program` | Needs full mission initialization |
| Mapping or analyzing an existing codebase | `/hunt:map-environment` | Codebase discovery |
| A bug, error, crash, failure, or something broken | `/thrunt:debug` | Needs systematic investigation |
| Exploring, researching, comparing, or "how does X work" | `/hunt:shape-hypothesis` | Domain research before planning |
| Discussing vision, "how should X look", brainstorming | `/hunt:shape-hypothesis` | Needs context gathering |
| A complex task: refactoring, migration, multi-file architecture, system redesign | `/thrunt:add-phase` | Needs a full phase with plan/build cycle |
| Planning a specific phase or "plan phase N" | `/hunt:plan` | Direct planning request |
| Executing a phase or "build phase N", "run phase N" | `/hunt:run` | Direct execution request |
| Running all remaining phases automatically | `/thrunt:autonomous` | Full autonomous execution |
| A review or quality concern about existing work | `/hunt:validate-findings` | Needs findings validation |
| Checking progress, status, "where am I" | `/thrunt:progress` | Status check |
| Resuming work, "pick up where I left off" | `/thrunt:resume-work` | Session restoration |
| A note, idea, or "remember to..." | `/thrunt:add-todo` | Capture for later |
| Adding tests, "write tests", "test coverage" | `/thrunt:add-tests` | Test generation |
| Completing a milestone, publishing, releasing | `/thrunt:complete-milestone` | Milestone lifecycle |
| A specific, actionable, small task (add feature, fix typo, update config) | `/thrunt:quick` | Self-contained, single executor |

If `HAS_HUNT_DOCS=true`, prefer `/hunt:*` routes whenever the text plausibly matches threat hunting work. Only route to `/thrunt:*` if the user is explicitly asking for THRUNT utility help, repo maintenance, or workspace management.

**Requires `.planning/` directory:** All routes except `/hunt:new-program`, `/hunt:map-environment`, `/thrunt:help`, `/thrunt:join-discord`, `/hunt:help`, `/hunt:new-case`, and `/hunt:new-program`.

If the project doesn't exist and the chosen route requires hunt context:
- Use `/hunt:new-case` for a single signal, incident, or investigation thread
- Use `/hunt:new-program` for durable coverage, environment mapping, or repeatable hunts

**Ambiguity handling:** If the text could reasonably match multiple routes, ask the user via AskUserQuestion with the top 2-3 options. For example:

```
"Refactor the authentication system" could be:
1. /thrunt:add-phase — Full planning cycle (recommended for multi-file refactors)
2. /thrunt:quick — Quick execution (if scope is small and clear)

Which approach fits better?
```

For hunt ambiguity, prefer examples like:

```
"Investigate suspicious Okta sign-ins" could be:
1. /hunt:new-case — Start a scoped investigation from this signal (recommended)
2. /hunt:new-program — Set up broader identity hunt coverage

Which outcome are you after?
```
</step>

<step name="display">
**Show the routing decision.**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 THRUNT ► ROUTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Input:** {first 80 chars of $ARGUMENTS}
**Routing to:** {chosen command}
**Reason:** {one-line explanation}
```
</step>

<step name="dispatch">
**Invoke the chosen command.**

Run the selected `/thrunt:*` or `/hunt:*` command, passing `$ARGUMENTS` as args.

If the chosen command expects a phase number and one wasn't provided in the text, extract it from context or ask via AskUserQuestion.
For hunt work, prefer the active phase from `HUNTMAP.md` or `STATE.md` if it is unambiguous.

After invoking the command, stop. The dispatched command handles everything from here.
</step>

</process>

<success_criteria>
- [ ] Input validated (not empty)
- [ ] Intent matched to exactly one hunt or THRUNT command
- [ ] Ambiguity resolved via user question (if needed)
- [ ] Project existence checked for routes that require it
- [ ] Routing decision displayed before dispatch
- [ ] Command invoked with appropriate arguments
- [ ] No work done directly — dispatcher only
</success_criteria>
