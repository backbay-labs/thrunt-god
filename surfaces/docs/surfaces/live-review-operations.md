# Live Review Operations

## Fixture-Backed Behavior

- Fixture replay remains the fastest way to validate adapter changes before touching live campaigns.
- Fixture replay can drive campaign bundles into `review-required`, but it does not produce `live-certified`.

## Live-Capable Behavior

- A live campaign now moves through an explicit local review flow:
  1. prerequisite check
  2. capture
  3. replay
  4. runtime preview / execute where available
  5. submit for review
  6. reviewer decision
  7. optional baseline promotion
- Submission is durable. Campaign bundles now record:
  - `submittedBy`
  - `submittedAt`
  - `reviewState`
  - `reviewNotes`
  - `followUpItems`
- The certification ledger now emits `review-ledger.json` in addition to per-campaign `review.md`.
- Supported reviewer decisions are:
  - approve certification
  - reject certification
  - request follow-up
  - mark inconclusive
  - approve baseline promotion
  - reject baseline promotion

## Actually Live-Certified Behavior

- A campaign only becomes truly live-certified when:
  - replay has completed without certification-blocking drift
  - reviewer approval is recorded
  - campaign status becomes `live-certified`
- Reviewer approval and baseline promotion are separate decisions.
- A reviewer-approved campaign can remain unpromoted if the team does not want to replace the active baseline.

## Blocked Behavior

- If the campaign is missing replay evidence, runtime evidence, or required live prerequisites, submission may still be recorded but `reviewState` will not become `ready_for_review`.
- On April 11, 2026 this repository still has no checked-in reviewer-approved real-tenant campaigns, so example outputs remain blocked and unpromoted by design.
