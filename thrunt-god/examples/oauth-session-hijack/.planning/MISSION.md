# Mission: acme.corp OAuth Abuse Response Program

**Mode:** program
**Opened:** 2026-03-28
**Owner:** SOC Tier 2 - threat hunting team
**Status:** Complete

## Signal

acme.corp OAuth abuse response program

## Desired Outcome

Keep completed OAuth abuse investigations in a program workspace that the updated VS Code extension can open directly, with child-case discovery, published findings status, and technique aggregation all available from static example data.

## Scope

- **Cases:** 1 closed case at `cases/oauth-session-hijack`
- **Theme:** OAuth phishing, illicit consent grants, mailbox tampering, and response tracking
- **Environment:** acme.corp Microsoft 365 tenant with Okta federation context
- **Primary outcome:** Provide a realistic workspace for validating the new program dashboard and case metadata behavior from this PR

## Working Theory

OAuth abuse cases benefit from a program-level view because the same response workflow often repeats: phishing delivery, consent abuse, mailbox tampering, and follow-on monitoring. This example keeps the closed case in the new program-plus-case structure so the dashboard can exercise that end-to-end path.
