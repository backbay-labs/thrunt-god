<purpose>

Start a new milestone cycle for an existing project. Loads project context, gathers milestone goals (from MILESTONE-CONTEXT.md or conversation), updates MISSION.md and STATE.md, optionally runs parallel research, defines scoped requirements with HYP-IDs, spawns the huntmap builder to create phased execution plan, and commits all artifacts. Brownfield equivalent of new-program.

</purpose>

<required_reading>

Read all files referenced by the invoking prompt's execution_context before starting.

</required_reading>

<available_agent_types>
Valid THRUNT subagent types (use exact names — do not fall back to 'general-purpose'):
- thrunt-signal-triager — Researches project-level technical decisions
- thrunt-intel-synthesizer — Synthesizes findings from parallel research agents
- thrunt-huntmap-builder — Creates phased execution huntmaps
</available_agent_types>

<process>

## 1. Load Context

Parse `$ARGUMENTS` before doing anything else:
- `--reset-phase-numbers` flag → opt into restarting huntmap phase numbering at `1`
- remaining text → use as milestone name if present

If the flag is absent, keep the current behavior of continuing phase numbering from the previous milestone.

- Read MISSION.md (existing project, validated requirements, decisions)
- Read MILESTONES.md (what published previously)
- Read STATE.md (pending todos, blockers)
- Check for MILESTONE-CONTEXT.md (from /thrunt:discuss-milestone)

## 2. Gather Milestone Goals

**If MILESTONE-CONTEXT.md exists:**
- Use features and scope from discuss-milestone
- Present summary for confirmation

**If no context file:**
- Present what published in last milestone
- Ask inline (freeform, NOT AskUserQuestion): "What do you want to build next?"
- Wait for their response, then use AskUserQuestion to probe specifics
- If user selects "Other" at any point to provide freeform input, ask follow-up as plain text — not another AskUserQuestion

## 3. Determine Milestone Version

- Parse last version from MILESTONES.md
- Suggest next version (v1.0 → v1.1, or v2.0 for major)
- Confirm with user

## 3.5. Verify Milestone Understanding

Before writing any files, present a summary of what was gathered and ask for confirmation.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 THRUNT ► MILESTONE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Milestone v[X.Y]: [Name]**

**Goal:** [One sentence]

**Target features:**
- [Feature 1]
- [Feature 2]
- [Feature 3]

**Key context:** [Any important constraints, decisions, or notes from questioning]
```

AskUserQuestion:
- header: "Confirm?"
- question: "Does this capture what you want to build in this milestone?"
- options:
  - "Looks good" — Proceed to write MISSION.md
  - "Adjust" — Let me correct or add details

**If "Adjust":** Ask what needs changing (plain text, NOT AskUserQuestion). Incorporate changes, re-present the summary. Loop until "Looks good" is selected.

**If "Looks good":** Proceed to Step 4.

## 4. Update MISSION.md

Add/update:

```markdown
## Current Milestone: v[X.Y] [Name]

**Goal:** [One sentence describing milestone focus]

**Target features:**
- [Feature 1]
- [Feature 2]
- [Feature 3]
```

Update Active requirements section and "Last updated" footer.

Ensure the `## Evolution` section exists in MISSION.md. If missing (projects created before this feature), add it before the footer:

```markdown
## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/thrunt:transition`):
1. Hypotheses invalidated? → Move to Out of Scope with reason
2. Hypotheses validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/thrunt:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state
```

## 5. Update STATE.md

```markdown
## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: [today] — Milestone v[X.Y] started
```

Keep Accumulated Context section from previous milestone.

## 6. Cleanup and Commit

Delete MILESTONE-CONTEXT.md if exists (consumed).

```bash
node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" commit "docs: start milestone v[X.Y] [Name]" --files .planning/MISSION.md .planning/STATE.md
```

## 7. Load Context and Resolve Models

```bash
INIT=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" init new-milestone)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
AGENT_SKILLS_RESEARCHER=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" agent-skills thrunt-signal-triager 2>/dev/null)
AGENT_SKILLS_SYNTHESIZER=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" agent-skills thrunt-synthesizer 2>/dev/null)
AGENT_SKILLS_HUNTMAPPER=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" agent-skills thrunt-huntmap-builder 2>/dev/null)
```

Extract from init JSON: `researcher_model`, `synthesizer_model`, `huntmap_builder_model`, `commit_docs`, `research_enabled`, `current_milestone`, `mission_exists`, `huntmap_exists`, `latest_completed_milestone`, `phase_dir_count`, `phase_archive_path`.

## 7.5 Reset-phase safety (only when `--reset-phase-numbers`)

If `--reset-phase-numbers` is active:

1. Set starting phase number to `1` for the upcoming huntmap.
2. If `phase_dir_count > 0`, archive the old phase directories before huntmapping so new `01-*` / `02-*` directories cannot collide with stale milestone directories.

If `phase_dir_count > 0` and `phase_archive_path` is available:

```bash
mkdir -p "${phase_archive_path}"
find .planning/phases -mindepth 1 -maxdepth 1 -type d -exec mv {} "${phase_archive_path}/" \;
```

Then verify `.planning/phases/` no longer contains old milestone directories before continuing.

If `phase_dir_count > 0` but `phase_archive_path` is missing:
- Stop and explain that reset numbering is unsafe without a completed milestone archive target.
- Tell the user to complete/archive the previous milestone first, then rerun `/hunt:new-program --reset-phase-numbers ${THRUNT_WS}`.

## 8. Research Decision

Check `research_enabled` from init JSON (loaded from config).

**If `research_enabled` is `true`:**

AskUserQuestion: "Research the domain ecosystem for new features before defining requirements?"
- "Research first (Recommended)" — Discover patterns, features, architecture for NEW capabilities
- "Skip research for this milestone" — Go straight to requirements (does not change your default)

**If `research_enabled` is `false`:**

AskUserQuestion: "Research the domain ecosystem for new features before defining requirements?"
- "Skip research (current default)" — Go straight to requirements
- "Research first" — Discover patterns, features, architecture for NEW capabilities

**IMPORTANT:** Do NOT persist this choice to config.json. The `workflow.research` setting is a persistent user preference that controls hunt-plan behavior across the project. Changing it here would silently alter future `/hunt:plan` behavior. To change the default, use `/thrunt:settings`.

**If user chose "Research first":**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 THRUNT ► RESEARCHING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning 4 researchers in parallel...
  → Stack, Features, Architecture, Pitfalls
```

```bash
mkdir -p .planning/research
```

Spawn 4 parallel thrunt-signal-triager agents. Each uses this template with dimension-specific fields:

**Common structure for all 4 researchers:**
```
Task(prompt="
<research_type>Project Research — {DIMENSION} for [new features].</research_type>

<milestone_context>
SUBSEQUENT MILESTONE — Adding [target features] to existing app.
{EXISTING_CONTEXT}
Focus ONLY on what's needed for the NEW features.
</milestone_context>

<question>{QUESTION}</question>

<files_to_read>
- .planning/MISSION.md (Project context)
</files_to_read>

${AGENT_SKILLS_RESEARCHER}

<downstream_consumer>{CONSUMER}</downstream_consumer>

<quality_gate>{GATES}</quality_gate>

<output>
Write to: .planning/research/{FILE}
Use template: ~/.claude/thrunt-god/templates/research-program/{FILE}
</output>
", subagent_type="thrunt-signal-triager", model="{researcher_model}", description="{DIMENSION} research")
```

**Dimension-specific fields:**

| Field | Stack | Features | Architecture | Pitfalls |
|-------|-------|----------|-------------|----------|
| EXISTING_CONTEXT | Existing validated capabilities (DO NOT re-research): [from MISSION.md] | Existing features (already built): [from MISSION.md] | Existing architecture: [from MISSION.md or codebase map] | Focus on common mistakes when ADDING these features to existing system |
| QUESTION | What stack additions/changes are needed for [new features]? | How do [target features] typically work? Expected behavior? | How do [target features] integrate with existing architecture? | Common mistakes when adding [target features] to [domain]? |
| CONSUMER | Specific libraries with versions for NEW capabilities, integration points, what NOT to add | Table stakes vs differentiators vs anti-features, complexity noted, dependencies on existing | Integration points, new components, data flow changes, suggested build order | Warning signs, prevention strategy, which phase should address it |
| GATES | Versions current (verify with Context7), rationale explains WHY, integration considered | Categories clear, complexity noted, dependencies identified | Integration points identified, new vs modified explicit, build order considers deps | Pitfalls specific to adding these features, integration pitfalls covered, prevention actionable |
| FILE | STACK.md | FEATURES.md | ARCHITECTURE.md | PITFALLS.md |

After all 4 complete, spawn synthesizer:

```
Task(prompt="
Synthesize research outputs into SUMMARY.md.

<files_to_read>
- .planning/research/STACK.md
- .planning/research/FEATURES.md
- .planning/research/ARCHITECTURE.md
- .planning/research/PITFALLS.md
</files_to_read>

${AGENT_SKILLS_SYNTHESIZER}

Write to: .planning/research/SUMMARY.md
Use template: ~/.claude/thrunt-god/templates/research-program/SUMMARY.md
Commit after writing.
", subagent_type="thrunt-intel-synthesizer", model="{synthesizer_model}", description="Synthesize research")
```

Display key findings from SUMMARY.md:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 THRUNT ► RESEARCH COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Stack additions:** [from SUMMARY.md]
**Feature table stakes:** [from SUMMARY.md]
**Watch Out For:** [from SUMMARY.md]
```

**If "Skip research":** Continue to Step 9.

## 9. Define Hypotheses

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 THRUNT ► DEFINING HYPOTHESES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Read MISSION.md: core value, current milestone goals, validated requirements (what exists).

**If research exists:** Read FEATURES.md, extract feature categories.

Present features by category:
```
## [Category 1]
**Table stakes:** Feature A, Feature B
**Differentiators:** Feature C, Feature D
**Research notes:** [any relevant notes]
```

**If no research:** Gather requirements through conversation. Ask: "What are the main things users need to do with [new features]?" Clarify, probe for related capabilities, group into categories.

**Scope each category** via AskUserQuestion (multiSelect: true, header max 12 chars):
- "[Feature 1]" — [brief description]
- "[Feature 2]" — [brief description]
- "None for this milestone" — Defer entire category

Track: Selected → this milestone. Unselected table stakes → future. Unselected differentiators → out of scope.

**Identify gaps** via AskUserQuestion:
- "No, research covered it" — Proceed
- "Yes, let me add some" — Capture additions

**Generate HYPOTHESES.md:**
- v1 Hypotheses grouped by category (checkboxes, HYP-IDs)
- Future Hypotheses (deferred)
- Out of Scope (explicit exclusions with reasoning)
- Traceability section (empty, filled by huntmap)

**HYP-ID format:** `[CATEGORY]-[NUMBER]` (AUTH-01, NOTIF-02). Continue numbering from existing.

**Hypothesis quality criteria:**

Good requirements are:
- **Specific and testable:** "User can reset password via email link" (not "Handle password reset")
- **User-centric:** "User can X" (not "System does Y")
- **Atomic:** One capability per requirement (not "User can login and manage profile")
- **Independent:** Minimal dependencies on other requirements

Present FULL requirements list for confirmation:

```
## Milestone v[X.Y] Hypotheses

### [Category 1]
- [ ] **CAT1-01**: User can do X
- [ ] **CAT1-02**: User can do Y

### [Category 2]
- [ ] **CAT2-01**: User can do Z

Does this capture what you're building? (yes / adjust)
```

If "adjust": Return to scoping.

**Commit requirements:**
```bash
node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" commit "docs: define milestone v[X.Y] requirements" --files .planning/HYPOTHESES.md
```

## 10. Create Huntmap

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 THRUNT ► CREATING HUNTMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning huntmap builder...
```

**Starting phase number:**
- If `--reset-phase-numbers` is active, start at **Phase 1**
- Otherwise, continue from the previous milestone's last phase number (v1.0 ended at phase 5 → v1.1 starts at phase 6)

```
Task(prompt="
<planning_context>
<files_to_read>
- .planning/MISSION.md
- .planning/HYPOTHESES.md
- .planning/research/SUMMARY.md (if exists)
- .planning/config.json
- .planning/MILESTONES.md
</files_to_read>

${AGENT_SKILLS_HUNTMAPPER}

</planning_context>

<instructions>
Create huntmap for milestone v[X.Y]:
1. Respect the selected numbering mode:
   - `--reset-phase-numbers` → start at Phase 1
   - default behavior → continue from the previous milestone's last phase number
2. Derive phases from THIS MILESTONE's requirements only
3. Map every requirement to exactly one phase
4. Derive 2-5 success criteria per phase (observable user behaviors)
5. Validate 100% coverage
6. Write files immediately (HUNTMAP.md, STATE.md, update HYPOTHESES.md traceability)
7. Return HUNTMAP CREATED with summary

Write files first, then return.
</instructions>
", subagent_type="thrunt-huntmap-builder", model="{huntmap_builder_model}", description="Create huntmap")
```

**Handle return:**

**If `## HUNTMAP BLOCKED`:** Present blocker, work with user, re-spawn.

**If `## HUNTMAP CREATED`:** Read HUNTMAP.md, present inline:

```
## Proposed Huntmap

**[N] phases** | **[X] requirements mapped** | All covered ✓

| # | Phase | Goal | Hypotheses | Success Criteria |
|---|-------|------|--------------|------------------|
| [N] | [Name] | [Goal] | [HYP-IDs] | [count] |

### Phase Details

**Phase [N]: [Name]**
Goal: [goal]
Hypotheses: [HYP-IDs]
Success criteria:
1. [criterion]
2. [criterion]
```

**Ask for approval** via AskUserQuestion:
- "Approve" — Commit and continue
- "Adjust phases" — Tell me what to change
- "Review full file" — Show raw HUNTMAP.md

**If "Adjust":** Get notes, re-spawn huntmap builder with revision context, loop until approved.
**If "Review":** Display raw HUNTMAP.md, re-ask.

**Commit huntmap** (after approval):
```bash
node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" commit "docs: create milestone v[X.Y] huntmap ([N] phases)" --files .planning/HUNTMAP.md .planning/STATE.md .planning/HYPOTHESES.md
```

## 11. Done

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 THRUNT ► MILESTONE INITIALIZED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Milestone v[X.Y]: [Name]**

| Artifact       | Location                    |
|----------------|-----------------------------|
| Project        | `.planning/MISSION.md`      |
| Research       | `.planning/research/`       |
| Hypotheses   | `.planning/HYPOTHESES.md` |
| Huntmap        | `.planning/HUNTMAP.md`      |

**[N] phases** | **[X] requirements** | Ready to build ✓

## ▶ Next Up

**Phase [N]: [Phase Name]** — [Goal]

`/hunt:shape-hypothesis [N] ${THRUNT_WS}` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

Also: `/hunt:plan [N] ${THRUNT_WS}` — skip discussion, plan directly
```

</process>

<success_criteria>
- [ ] MISSION.md updated with Current Milestone section
- [ ] STATE.md reset for new milestone
- [ ] MILESTONE-CONTEXT.md consumed and deleted (if existed)
- [ ] Research completed (if selected) — 4 parallel agents, milestone-aware
- [ ] Hypotheses gathered and scoped per category
- [ ] HYPOTHESES.md created with HYP-IDs
- [ ] thrunt-huntmap-builder spawned with phase numbering context
- [ ] Huntmap files written immediately (not draft)
- [ ] User feedback incorporated (if any)
- [ ] Phase numbering mode respected (continued or reset)
- [ ] All commits made (if planning docs committed)
- [ ] User knows next step: `/hunt:shape-hypothesis [N] ${THRUNT_WS}`

**Atomic commits:** Each phase commits its artifacts immediately.
</success_criteria>
