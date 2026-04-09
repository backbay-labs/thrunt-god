<purpose>
Interactive configuration of THRUNT workflow agents (research, plan_check, validator) and model profile selection via multi-question prompt. Updates .planning/config.json with user preferences. Optionally saves settings as global defaults (~/.thrunt/defaults.json) for future projects.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="ensure_and_load_config">
Ensure config exists and load current state:

```bash
node ".github/thrunt-god/bin/thrunt-tools.cjs" config-ensure-section
INIT=$(node ".github/thrunt-god/bin/thrunt-tools.cjs" state load)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Creates `.planning/config.json` with defaults if missing and loads current config values.
</step>

<step name="read_current">
```bash
cat .planning/config.json
```

Parse current values (default to `true` if not present):
- `workflow.research` — spawn researcher during hunt-plan
- `workflow.plan_check` — spawn plan checker during hunt-plan
- `workflow.validator` — spawn findings validator during hunt-run
- `workflow.nyquist_validation` — validation architecture research during hunt-plan (default: true if absent)
- `workflow.ui_phase` — generate UI-SPEC.md design contracts for frontend phases (default: true if absent)
- `workflow.ui_safety_gate` — prompt to run /thrunt-ui-phase before planning frontend phases (default: true if absent)
- `model_profile` — which model each agent uses (default: `balanced`)
- `git.branching_strategy` — branching approach (default: `"none"`)
</step>

<step name="present_settings">
Use AskUserQuestion with current values pre-selected:

```
AskUserQuestion([
  {
    question: "Which model profile for agents?",
    header: "Model",
    multiSelect: false,
    options: [
      { label: "Quality", description: "Opus everywhere except findings validation (highest cost)" },
      { label: "Balanced (Recommended)", description: "Opus for planning, Sonnet for research/execution/validation" },
      { label: "Budget", description: "Sonnet for writing, Haiku for research/validation (lowest cost)" },
      { label: "Inherit", description: "Use current session model for all agents (best for OpenRouter, local models, or runtime model switching)" }
    ]
  },
  {
    question: "Spawn Plan Researcher? (researches domain before planning)",
    header: "Research",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Research phase goals before planning" },
      { label: "No", description: "Skip research, plan directly" }
    ]
  },
  {
    question: "Spawn Plan Checker? (validates plans before execution)",
    header: "Plan Check",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Validate that plans meet phase goals" },
      { label: "No", description: "Skip plan validation" }
    ]
  },
  {
    question: "Spawn Findings Validator? (validates phase completion)",
    header: "Validator",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Validate must-haves after execution" },
      { label: "No", description: "Skip post-execution findings validation" }
    ]
  },
  {
    question: "Auto-advance pipeline? (discuss → plan → execute automatically)",
    header: "Auto",
    multiSelect: false,
    options: [
      { label: "No (Recommended)", description: "Manual /clear + paste between stages" },
      { label: "Yes", description: "Chain stages via Task() subagents (same isolation)" }
    ]
  },
  {
    question: "Enable Nyquist Validation? (researches test coverage during planning)",
    header: "Nyquist",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Research automated test coverage during hunt-plan. Adds validation requirements to plans. Blocks approval if tasks lack automated validation steps." },
      { label: "No", description: "Skip validation research. Good for rapid prototyping or no-test phases." }
    ]
  },
  // Note: Nyquist validation depends on research output. If research is disabled,
  // hunt-plan automatically skips Nyquist steps (no RESEARCH.md to extract from).
  {
    question: "Enable UI Phase? (generates UI-SPEC.md design contracts for frontend phases)",
    header: "UI Phase",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Generate UI design contracts before planning frontend phases. Locks spacing, typography, color, and copywriting." },
      { label: "No", description: "Skip UI-SPEC generation. Good for backend-only projects or API phases." }
    ]
  },
  {
    question: "Enable UI Safety Gate? (prompts to run /thrunt-ui-phase before planning frontend phases)",
    header: "UI Gate",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "hunt-plan asks to run /thrunt-ui-phase first when frontend indicators detected." },
      { label: "No", description: "No prompt — hunt-plan proceeds without UI-SPEC check." }
    ]
  },
  {
    question: "Git branching strategy?",
    header: "Branching",
    multiSelect: false,
    options: [
      { label: "None (Recommended)", description: "Commit directly to current branch" },
      { label: "Per Phase", description: "Create branch for each phase (thrunt/phase-{N}-{name})" },
      { label: "Per Milestone", description: "Create branch for entire milestone (thrunt/{version}-{name})" }
    ]
  },
  {
    question: "Enable context window warnings? (injects advisory messages when context is getting full)",
    header: "Ctx Warnings",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Warn when context usage exceeds 65%. Helps avoid losing work." },
      { label: "No", description: "Disable warnings. Allows the agent to reach auto-compact naturally. Good for long unattended runs." }
    ]
  },
  {
    question: "Research best practices before asking questions? (web search during new-program and shape-hypothesis)",
    header: "Research Qs",
    multiSelect: false,
    options: [
      { label: "No (Recommended)", description: "Ask questions directly. Faster, uses fewer tokens." },
      { label: "Yes", description: "Search web for best practices before each question group. More informed questions but uses more tokens." }
    ]
  },
  {
    question: "Skip shape-hypothesis in autonomous mode? (use HUNTMAP phase goals as spec)",
    header: "Skip Discuss",
    multiSelect: false,
    options: [
      { label: "No (Recommended)", description: "Run smart discuss before each phase — surfaces gray areas and captures decisions." },
      { label: "Yes", description: "Skip discuss in /thrunt-autonomous — chain directly to plan. Best for backend/pipeline work where phase descriptions are the spec." }
    ]
  }
])
```
</step>

<step name="update_config">
Merge new settings into existing config.json:

```json
{
  ...existing_config,
  "model_profile": "quality" | "balanced" | "budget" | "inherit",
  "workflow": {
    "research": true/false,
    "plan_check": true/false,
    "validator": true/false,
    "auto_advance": true/false,
    "nyquist_validation": true/false,
    "ui_phase": true/false,
    "ui_safety_gate": true/false,
    "text_mode": true/false,
    "research_before_questions": true/false,
    "discuss_mode": "discuss" | "assumptions",
    "skip_discuss": true/false
  },
  "git": {
    "branching_strategy": "none" | "phase" | "milestone",
    "quick_branch_template": <string|null>
  },
  "hooks": {
    "context_warnings": true/false,
    "workflow_guard": true/false
  }
}
```

Write updated config to `.planning/config.json`.
</step>

<step name="save_as_defaults">
Ask whether to save these settings as global defaults for future projects:

```
AskUserQuestion([
  {
    question: "Save these as default settings for all new projects?",
    header: "Defaults",
    multiSelect: false,
    options: [
      { label: "Yes", description: "New projects start with these settings (saved to ~/.thrunt/defaults.json)" },
      { label: "No", description: "Only apply to this project" }
    ]
  }
])
```

If "Yes": write the same config object (minus project-specific fields like `brave_search`) to `~/.thrunt/defaults.json`:

```bash
mkdir -p ~/.thrunt
```

Write `~/.thrunt/defaults.json` with:
```json
{
  "mode": <current>,
  "granularity": <current>,
  "model_profile": <current>,
  "commit_docs": <current>,
  "parallelization": <current>,
  "branching_strategy": <current>,
  "quick_branch_template": <current>,
  "workflow": {
    "research": <current>,
    "plan_check": <current>,
    "validator": <current>,
    "auto_advance": <current>,
    "nyquist_validation": <current>,
    "ui_phase": <current>,
    "ui_safety_gate": <current>,
    "skip_discuss": <current>
  }
}
```
</step>

<step name="confirm">
Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 THRUNT ► SETTINGS UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Setting              | Value |
|----------------------|-------|
| Model Profile        | {quality/balanced/budget/inherit} |
| Plan Researcher      | {On/Off} |
| Plan Checker         | {On/Off} |
| Findings Validator   | {On/Off} |
| Auto-Advance         | {On/Off} |
| Nyquist Validation   | {On/Off} |
| UI Phase             | {On/Off} |
| UI Safety Gate       | {On/Off} |
| Git Branching        | {None/Per Phase/Per Milestone} |
| Skip Discuss         | {On/Off} |
| Context Warnings     | {On/Off} |
| Saved as Defaults    | {Yes/No} |

These settings apply to future /hunt-plan and /hunt-run runs.

Quick commands:
- /thrunt-set-profile <profile> — switch model profile
- /hunt-plan --research — force research
- /hunt-plan --skip-research — skip research
- /hunt-plan --skip-verify — skip plan check
```
</step>

</process>

<success_criteria>
- [ ] Current config read
- [ ] User presented with 10 settings (profile + 8 workflow toggles + git branching)
- [ ] Config updated with model_profile, workflow, and git sections
- [ ] User offered to save as global defaults (~/.thrunt/defaults.json)
- [ ] Changes confirmed to user
</success_criteria>
