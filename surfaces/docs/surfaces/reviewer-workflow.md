# Reviewer Workflow

## Fixture-Backed Behavior

- Reviewers can inspect replay output from fixture-backed campaigns, but fixture replay alone does not produce `live-certified`.
- Fixture replay is useful for understanding expected adapter shape before looking at live drift.

## Live-Capable Behavior

Reviewer loop:

1. Inspect the campaign bundle under `.planning/certification/campaigns/<campaign-id>/`.
2. Read `prerequisites.json` for exact blocked or warned checks.
3. Compare `replay.json` against the approved baseline or captured expectation.
4. Inspect `runtime-preview.json` and `runtime-execute.json` when present.
5. Record a certification decision:

```bash
cd surfaces
bun run dogfood:campaign -- review --project-root ../thrunt-god/examples/oauth-session-hijack --campaign-id CERT-OKTA-... --reviewer reviewer-1 --decision approve --notes "Replay and runtime path are acceptable"
```

6. Record a promotion decision:

```bash
cd surfaces
bun run dogfood:campaign -- promote --project-root ../thrunt-god/examples/oauth-session-hijack --campaign-id CERT-OKTA-... --reviewer reviewer-1 --decision approve --target baseline --notes "Promote as active baseline"
```

- Review decisions persist inside `campaign.json` and `review.md`.
- The extension dev diagnostics path shows active-vendor campaign summary, history summary, trend summary, and active baseline when the bridge has loaded those artifacts.

## Truly Live-Certified Behavior

- Reviewer approval only counts when the campaign is replay-clean and not blocked by runtime readiness.
- Promotion to baseline is explicit and separate from certification approval.
- The reviewer note trail is durable and inspectable.

## Blocked Behavior

- If prerequisites or runtime evidence block certification, reviewers should reject certification or leave it `review-required`; they should not promote the baseline.
- On April 11, 2026 no checked-in campaign in this repo has progressed past `live-blocked`, so reviewer decisions remain part of the ready workflow rather than checked-in proof.
