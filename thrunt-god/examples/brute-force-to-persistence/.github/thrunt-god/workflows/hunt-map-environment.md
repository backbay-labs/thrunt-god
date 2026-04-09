<purpose>
Map the environment that the hunt can actually see and act on. THRUNT cares about real telemetry surfaces, retention, pivots, blind spots, and escalation boundaries, not abstract architecture diagrams.
</purpose>

<required_reading>
Read:

- `.planning/MISSION.md` if it exists
- `.planning/HYPOTHESES.md` if it exists
- `.planning/STATE.md` if it exists
- Existing local docs, detections, parsers, notebooks, configs, and query content relevant to the environment
</required_reading>

<process>

If the Task tool is NOT available, continue inline and do not defer mapping work to background agents.

Never invent or simulate environment details. If a tenant, product, query path, retention window, blind spot, or escalation owner is not confirmed from workspace evidence or direct user input, write `TBD` and call it out as an open question.

## 1. Inventory Reality

Build the environment map from what is actually available in the workspace and from user input.

Capture:

- Tenants, business units, and trust boundaries
- Data sources: EDR, SIEM, identity, cloud, email, network, SaaS
- Retention windows and latency
- Query interfaces and access paths
- High-value entities and pivot keys
- Known blind spots
- Escalation and containment owners

Ask direct follow-up questions only when the user is clearly mapping the environment live and the missing fact would materially change the current map.
If confirmed facts are sparse or absent:

- Do not ask placeholder follow-up questions
- Do not infer the environment from generic threat-hunting patterns
- Create or refresh `.planning/environment/ENVIRONMENT.md` as a blank scaffold using `TBD` markers
- Preserve any confirmed facts already present
- Stop after listing the open questions the operator still needs to answer

## 2. Write `.planning/environment/ENVIRONMENT.md`

Use the template. Favor analyst-useful detail over prose.
Keep the structure and `TBD` markers intact whenever facts are unconfirmed.

## 3. Sync Hunt Artifacts

Update:

- `MISSION.md` - constraints and operating assumptions
- `HYPOTHESES.md` - remove impossible data asks and note blind spots
- `HUNTMAP.md` - insert or refine an environment-baselining phase if needed
- `STATE.md` - note mapped data sources and blockers

If the environment is still mostly unknown, sync only confirmed facts and note the rest as `TBD` or blockers.

## 4. Close Out

Report:

- What surfaces are mapped
- What remains unknown
- Which phase should be planned next

</process>
