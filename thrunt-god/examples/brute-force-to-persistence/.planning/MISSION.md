# Mission: Meridian Identity Abuse Program

**Mode:** program
**Opened:** 2026-03-29
**Owner:** Threat Hunt Team (analyst: j.chen)
**Status:** Complete

## Signal

Meridian identity abuse program

## Desired Outcome

Preserve completed identity-abuse investigations in a single program workspace so the VS Code extension can surface case status, published findings, and ATT&CK technique coverage from real child hunts.

## Scope

- **Cases:** 1 closed case at `cases/brute-force-to-persistence`
- **Theme:** Password spraying, valid-account abuse, MFA manipulation, and cloud data access
- **Environment:** Meridian Financial Services identity and Microsoft 365 telemetry
- **Primary outcome:** Keep the final case record intact while exposing the new program dashboard and case rollup flows from this PR

## Working Theory

Identity-centric attacks at Meridian often begin in Okta and pivot into Microsoft 365. This example program captures that pattern in the same layout the CLI now writes: a program root with one closed child case, published findings, and technique metadata recorded in case frontmatter.
