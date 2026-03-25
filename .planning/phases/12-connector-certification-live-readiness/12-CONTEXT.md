# Phase 12: Connector Certification & Live Readiness - Context

**Gathered:** 2026-03-25
**Status:** Completed

<domain>
## Phase Boundary

Prove the connector runtime can be trusted before evidence-integrity work builds on top of it. This phase owns operator-facing readiness scoring, live smoke execution, profile-defined smoke specs, and the docs/tests that make connector certification a first-class workflow.

</domain>

<decisions>
## Implementation Decisions

### Certification Surface
- Certification should extend the existing runtime instead of creating a separate harness.
- `runtime doctor` should be safe by default and static unless `--live` is explicitly requested.
- `runtime smoke` should execute live read-only smoke queries without emitting normal hunt evidence artifacts.

### Smoke Spec Source Order
- CLI-provided smoke specs win for one-off debugging.
- Profile-defined `connector_profiles.<connector>.<profile>.smoke_test` is the canonical override path.
- Built-in smoke specs should exist only where a safe, read-only query is known to be operationally reasonable.

### Readiness Semantics
- Readiness must be operational, not optimistic.
- Scoring should distinguish adapter presence, profile resolution, auth-material readiness, preflight success, smoke-spec availability, and optional live verification.
- Connectors should report `unconfigured`, `ready`, or `live_verified` instead of a generic pass/fail.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `thrunt-god/bin/lib/runtime.cjs` already owns adapter registration, auth-profile resolution, request execution, pagination, and normalized result envelopes.
- `thrunt-god/bin/lib/commands.cjs` and `thrunt-god/bin/thrunt-tools.cjs` already expose the runtime command surface and can add certification commands without new entrypoints.
- Existing runtime tests already exercise mocked connectors end to end, which makes command-level certification tests practical.

### Gaps Closed in This Phase
- There was no operator-facing readiness scoring or preflight surface for configured connectors.
- There was no live smoke-test command for real tenant validation.
- Connectors without a safe shipped smoke query had no profile-level way to define one.

</code_context>

<specifics>
## Specific Ideas

Delivered command surface:

- `runtime doctor [<connector-id>] [--profile <name>] [--live]`
- `runtime smoke [<connector-id>] [--profile <name>]`

Readiness checks now cover:

- adapter registered
- profile found
- profile valid
- auth material resolved
- preflight ready
- smoke spec available
- live smoke result

</specifics>

<deferred>
## Deferred Ideas

- Receipt hashing and provenance signing begin in Phase 14.
- Export bundles and evidence publish gates remain in Phases 15-16.

</deferred>
